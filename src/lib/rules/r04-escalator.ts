/**
 * R04 — Price-Escalator / Above-Market Challenge.
 *
 * Detects year-over-year price uplifts that either (a) BREACH the contract's own
 * escalator cap — recoverable cash — or (b) are ABOVE-MARKET (any uplift beyond
 * CONFIG.escalatorAboveMarketPct, default 8%) even where the contract has no cap
 * — an avoidance lever to negotiate a hard cap at renewal.
 *
 * The uplift is read from the INVOICES, not the contract: we find the primary
 * recurring line (the one whose unit price jumps across the anniversary), take
 * its unit price in the earliest vs the latest month it appears, and compute
 *   appliedPct = (later - earlier) / earlier.
 * priorAnnualBase = earlierMonthlyAmount * 12.
 *
 * BREACH      (capPct != null, appliedPct > capPct + tol):
 *   challengeable = (appliedPct - capPct) * priorAnnualBase   [recovery]
 * ABOVE-MARKET (else appliedPct > escalatorAboveMarketPct):
 *   challengeable = appliedPct * priorAnnualBase              [avoidance]
 */
import {
  perVendorRule,
  makeFinding,
  type Rule,
  type RuleContext,
} from "./types";
import type { Evidence, Finding, Invoice, InvoiceLine, VendorRecord } from "../types";
import { formatUSD, formatUSDPrecise, formatPct } from "../money";
import { formatMonthYear } from "../dates";

/** Tolerance on the percentage comparison (1 basis point) for float safety. */
const PCT_TOL = 1e-4;

/** Lines that never carry a recurring escalation. */
const IGNORE_LINE_TYPES = new Set<InvoiceLine["lineType"]>(["tax", "credit"]);

/** Key a line by SKU when present, else by normalized description. */
function lineKey(l: InvoiceLine): string {
  return l.sku ? `sku:${l.sku}` : `desc:${l.description.trim().toLowerCase()}`;
}

interface LineGroup {
  key: string;
  description: string;
  sku: string | null;
  earliest: { inv: Invoice; line: InvoiceLine };
  latest: { inv: Invoice; line: InvoiceLine };
  monthsSeen: number;
}

/**
 * Group recurring lines across the invoice series and, for each, capture the
 * earliest and latest month the line appears (invoices pre-sorted by date).
 */
function groupRecurringLines(invoices: Invoice[]): LineGroup[] {
  const sorted = [...invoices].sort((a, b) =>
    a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : 0,
  );
  const groups = new Map<string, LineGroup>();
  for (const inv of sorted) {
    for (const line of inv.lines) {
      if (IGNORE_LINE_TYPES.has(line.lineType)) continue;
      const key = lineKey(line);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          key,
          description: line.description,
          sku: line.sku,
          earliest: { inv, line },
          latest: { inv, line },
          monthsSeen: 1,
        });
      } else {
        existing.latest = { inv, line };
        existing.monthsSeen += 1;
      }
    }
  }
  return [...groups.values()];
}

/**
 * The per-period amount that escalated. Use the LINE TOTAL (qty x unit price),
 * not the unit price, so the escalation base reflects actual per-period spend on
 * qty>1 recurring lines. The applied-percentage ratio is unaffected (qty cancels
 * when quantity is constant across periods).
 */
function periodAmount(line: InvoiceLine): number {
  return line.lineTotalCents;
}

interface Jump {
  group: LineGroup;
  earlierAmount: number;
  laterAmount: number;
  appliedPct: number;
}

/** Among recurring lines, the one with the largest positive YoY price jump. */
function largestJump(groups: LineGroup[]): Jump | null {
  let best: Jump | null = null;
  for (const g of groups) {
    if (g.monthsSeen < 2) continue; // not recurring across months
    const earlierAmount = periodAmount(g.earliest.line);
    const laterAmount = periodAmount(g.latest.line);
    if (earlierAmount <= 0) continue;
    const appliedPct = (laterAmount - earlierAmount) / earlierAmount;
    if (appliedPct <= PCT_TOL) continue; // flat or decreasing
    if (!best || appliedPct > best.appliedPct) {
      best = { group: g, earlierAmount, laterAmount, appliedPct };
    }
  }
  return best;
}

/** How many months in the series were billed at the post-jump (later) amount. */
function postJumpMonths(group: LineGroup, invoices: Invoice[], laterAmount: number): number {
  let n = 0;
  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (lineKey(line) === group.key && periodAmount(line) === laterAmount) n += 1;
    }
  }
  return n;
}

function detect(vendor: VendorRecord, ctx: RuleContext): Finding[] {
  const contract = vendor.contract;
  if (!contract) return [];
  if (vendor.invoices.length < 2) return [];

  const groups = groupRecurringLines(vendor.invoices);
  const jump = largestJump(groups);
  if (!jump) return [];

  const { group, earlierAmount, laterAmount, appliedPct } = jump;
  const priorAnnualBase = earlierAmount * 12;
  const capPct = contract.escalator?.capPct ?? null;
  const aboveMarketPct = ctx.config.escalatorAboveMarketPct;

  let savingsType: "recovery" | "avoidance";
  let benchmarkPct: number;
  let challengeableCents: number;
  let kind: "breach" | "above_market";

  if (capPct != null && appliedPct > capPct + PCT_TOL) {
    // (a) Contract breach: applied uplift exceeds the contract's own cap.
    kind = "breach";
    savingsType = "recovery";
    benchmarkPct = capPct;
    challengeableCents = Math.round((appliedPct - capPct) * priorAnnualBase);
  } else if (appliedPct > aboveMarketPct + PCT_TOL) {
    // (b) Above-market: compliant (or uncapped) but beyond the fair band.
    kind = "above_market";
    savingsType = "avoidance";
    benchmarkPct = aboveMarketPct;
    challengeableCents = Math.round(appliedPct * priorAnnualBase);
  } else {
    return [];
  }

  if (challengeableCents <= 0) return [];

  const earlierMonth = formatMonthYear(group.earliest.inv.invoiceDate);
  const laterMonth = formatMonthYear(group.latest.inv.invoiceDate);
  const overUpliftPerMonth =
    kind === "breach"
      ? laterAmount - Math.round(earlierAmount * (1 + (capPct as number)))
      : laterAmount - earlierAmount;
  const monthsAtBadRate = postJumpMonths(group, vendor.invoices, laterAmount);
  const recoverableToDateCents =
    kind === "breach" ? Math.max(0, overUpliftPerMonth * monthsAtBadRate) : 0;

  const escType = contract.escalator?.type ?? "none";
  const capLabel =
    capPct != null ? formatPct(capPct) : "no cap";

  const evidence: Evidence[] = [
    {
      label: "Contract escalator clause",
      value:
        capPct != null
          ? `Escalator type "${escType}", capped at ${formatPct(capPct)} (anniversary month ${
              contract.escalator?.anniversaryMonth ?? "n/a"
            })`
          : `Escalator type "${escType}", ${capLabel}; market fair band is 3-5% (CPI ${formatPct(
              ctx.cpi.pct,
            )})`,
      sourceDoc: contract.sourceDoc,
    },
    {
      label: `Prior-period rate (${earlierMonth})`,
      value: `${group.description}: ${formatUSDPrecise(earlierAmount)}/mo (= ${formatUSD(
        priorAnnualBase,
      )}/yr base)`,
      sourceDoc: group.earliest.inv.sourceDoc,
    },
    {
      label: `Escalated rate (${laterMonth})`,
      value: `${group.description}: ${formatUSDPrecise(laterAmount)}/mo (+${formatPct(
        appliedPct,
      )} year-over-year)`,
      sourceDoc: group.latest.inv.sourceDoc,
    },
    {
      label: "Benchmark applied",
      value:
        kind === "breach"
          ? `Contract cap ${formatPct(benchmarkPct)} — applied ${formatPct(
              appliedPct,
            )} exceeds the cap by ${formatPct(appliedPct - benchmarkPct)}`
          : `Above-market threshold ${formatPct(benchmarkPct)} — applied ${formatPct(
              appliedPct,
            )} (CPI ${formatPct(ctx.cpi.pct)}, ${ctx.cpi.label})`,
      sourceDoc: kind === "breach" ? contract.sourceDoc : null,
    },
  ];

  if (kind === "breach") {
    evidence.push({
      label: "Over-uplift billed to date",
      value: `${formatUSDPrecise(overUpliftPerMonth)}/mo over the cap-allowed rate x ${monthsAtBadRate} month(s) billed = ${formatUSD(
        recoverableToDateCents,
      )} recoverable`,
      sourceDoc: group.latest.inv.sourceDoc,
    });
  }

  const title =
    kind === "breach"
      ? `Escalator breach: ${formatPct(appliedPct)} uplift exceeds the ${formatPct(
          benchmarkPct,
        )} contract cap`
      : `Above-market renewal: ${formatPct(appliedPct)} uplift on ${group.description}`;

  const summary =
    kind === "breach"
      ? `${vendor.vendor.name} applied a ${formatPct(
          appliedPct,
        )} year-over-year increase to "${group.description}" (${formatUSDPrecise(
          earlierAmount,
        )} -> ${formatUSDPrecise(
          laterAmount,
        )}/mo), but the contract caps escalation at ${formatPct(
          benchmarkPct,
        )}. The portion above the cap — (${formatPct(appliedPct)} - ${formatPct(
          benchmarkPct,
        )}) of the ${formatUSD(
          priorAnnualBase,
        )} prior-year base — is a breach of the contract's own ceiling and is recoverable as a credit/refund: ${formatUSD(
          challengeableCents,
        )}/yr.`
      : `${vendor.vendor.name} raised "${group.description}" ${formatPct(
          appliedPct,
        )} year-over-year (${formatUSDPrecise(earlierAmount)} -> ${formatUSDPrecise(
          laterAmount,
        )}/mo), far above the ${formatPct(
          benchmarkPct,
        )} above-market threshold and the fair 3-5% band (CPI ${formatPct(
          ctx.cpi.pct,
        )}). With no contractual cap, the full ${formatUSD(
          challengeableCents,
        )}/yr uplift is challengeable at renewal — convert it to a hard cap.`;

  const recommendedAsk =
    kind === "breach"
      ? `Demand a credit/refund of ${formatUSD(
          recoverableToDateCents,
        )} for the over-cap amount billed to date, roll "${group.description}" back to the cap-compliant rate of ${formatUSDPrecise(
          Math.round(earlierAmount * (1 + (capPct as number))),
        )}/mo, and correct the base going forward (${formatUSD(
          challengeableCents,
        )}/yr).`
      : `Cap the renewal increase at "lesser of CPI or 5%" and roll the ${formatPct(
          appliedPct,
        )} uplift back toward fair market, recovering ${formatUSD(
          challengeableCents,
        )}/yr of above-market spend.`;

  const finding = makeFinding({
    ruleId: "R04",
    ruleName: "Price-Escalator / Above-Market Challenge",
    category: "price_escalator",
    vendorId: vendor.vendor.id,
    vendorName: vendor.vendor.name,
    title,
    summary,
    savingsType,
    annualizedSavingsCents: challengeableCents,
    recoverableToDateCents,
    atRiskCents: kind === "above_market" ? challengeableCents : 0,
    confidence: kind === "breach" ? 0.95 : 0.82,
    severity: challengeableCents >= 2_000_000 ? "high" : "medium",
    leverage:
      kind === "breach"
        ? "A documented increase above the contract's own cap is a breach: demand the over-cap cash back and a corrected base, not just a forward fix. Escalators compound, so present the 3-year NPV of the corrected base."
        : "A compliant-but-above-market uplift is the renewal ask: convert it to a hard cap ('lesser of CPI or 5%'), traded for a multi-year commitment. A vendor's refusal to cap signals its pricing trajectory.",
    evidence,
    recommendedAsk,
  });

  return [finding];
}

const rule: Rule = perVendorRule(
  "R04",
  "Price-Escalator / Above-Market Challenge",
  "price_escalator",
  detect,
);

export default rule;
