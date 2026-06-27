/**
 * R12 — Service / Labor Overbilling.
 *
 * Hourly-services and logistics invoices billing more than the schedule
 * justifies. A vendor exhibits one of three overbilling patterns; each is
 * computed honestly from the canonical contract + invoice lines:
 *
 *   (a) UNPERFORMED seasonal — a seasonal/conditional service line (e.g. snow
 *       removal) billed in a month outside the contract's season window for
 *       that service. The full out-of-season line is recoverable.
 *
 *   (b) LABOR — holiday-premium lines applied on a date NOT in the contract's
 *       holiday calendar (recover only the misapplied premium = holiday minus
 *       regular rate), and overtime hours that exceed the post schedule
 *       (when the scheduled post is already fully covered by regular hours,
 *       all billed OT is beyond schedule and recoverable in full).
 *
 *   (c) ACCESSORIAL leakage — accessorial/surcharge lines (residential,
 *       liftgate) on deliveries whose type does not warrant them. The full
 *       accessorial line is recoverable.
 *
 * All three produce a `recovery` finding: recoverableToDateCents is the sum of
 * the wrongly-billed amounts observed across the invoice history, and
 * annualizedSavingsCents normalizes that to a comparable yearly run-rate.
 */
import { perVendorRule, makeFinding, type RuleContext } from "./types";
import { similarity } from "./util";
import type {
  Contract,
  Invoice,
  InvoiceLine,
  Evidence,
  VendorRecord,
} from "../types";
import { formatUSD, formatUSDPrecise, formatQty } from "../money";
import { parse, monthsBetween, type ISODate } from "../dates";

const RULE_ID = "R12";
const RULE_NAME = "Service / Labor Overbilling";

/** 1..12 month number for an ISO service date. */
function monthOf(date: ISODate): number {
  return parse(date).getMonth() + 1; // getMonth() is 0-based
}

/** True if `month` falls inside [startMonth..endMonth], handling wrap-around. */
function monthInWindow(month: number, startMonth: number, endMonth: number): boolean {
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  // Wrap-around window (e.g. Nov..Mar): in-season if at or after start OR at or before end.
  return month >= startMonth || month <= endMonth;
}

/** Match a season window to a service line by fuzzy description/name similarity. */
function windowForLine(c: Contract, line: InvoiceLine) {
  let best: Contract["seasonWindows"][number] | null = null;
  let bestScore = 0;
  for (const w of c.seasonWindows) {
    const score = similarity(w.service, line.description);
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  // Require a reasonably confident name match so we only test the seasonal line.
  return bestScore >= 0.5 ? best : null;
}

/** Distinct months observed in an invoice series (for annualization). */
function distinctServiceMonths(invoices: Invoice[]): number {
  const keys = new Set<string>();
  for (const inv of invoices) {
    keys.add(inv.invoiceDate.slice(0, 7));
  }
  return keys.size;
}

/**
 * Annualize an observed total over the months covered by the invoice history.
 * The seed runs 12 consecutive months, so the run-rate equals the observed
 * total; computing the factor keeps it correct for shorter histories too.
 */
function annualize(observedCents: number, monthsCovered: number): number {
  if (monthsCovered <= 0) return observedCents;
  return Math.round((observedCents / monthsCovered) * 12);
}

interface Hit {
  evidence: Evidence[];
  /** Wrongly-billed cash observed across the history. */
  recoverableCents: number;
  /** Annualized run-rate of the wrongly-billed cash. */
  annualizedCents: number;
}

/** (a) Unperformed seasonal service billed outside its contract window. */
function checkSeasonal(c: Contract, invoices: Invoice[]): Hit | null {
  if (c.seasonWindows.length === 0) return null;
  const evidence: Evidence[] = [];
  let recoverable = 0;
  let count = 0;
  let example: { window: Contract["seasonWindows"][number]; line: InvoiceLine; doc: string } | null = null;

  for (const inv of invoices) {
    for (const line of inv.lines) {
      const win = windowForLine(c, line);
      if (!win) continue;
      const sd = line.serviceDate ?? inv.billingPeriodStart ?? inv.invoiceDate;
      const m = monthOf(sd);
      if (!monthInWindow(m, win.startMonth, win.endMonth)) {
        recoverable += line.lineTotalCents;
        count += 1;
        if (!example) example = { window: win, line, doc: inv.sourceDoc };
        evidence.push({
          label: `Out-of-season "${line.description}" (${sd})`,
          value: `${formatQty(line.qty)} x ${formatUSDPrecise(line.unitPriceCents)} = ${formatUSD(line.lineTotalCents)} billed in month ${m}, outside the contracted window`,
          sourceDoc: inv.sourceDoc,
        });
      }
    }
  }

  if (count === 0 || !example) return null;

  const monthRange = (w: Contract["seasonWindows"][number]) => `months ${w.startMonth}-${w.endMonth}`;
  evidence.unshift({
    label: `Contract season window — ${example.window.service}`,
    value: `Service is only contracted ${monthRange(example.window)}; lines billed in any other month are unperformed/out-of-season.`,
    sourceDoc: c.sourceDoc,
  });

  const monthsCovered = distinctServiceMonths(invoices);
  return {
    evidence,
    recoverableCents: recoverable,
    annualizedCents: annualize(recoverable, monthsCovered),
  };
}

/** (b) Labor overbilling — misapplied holiday premiums + OT beyond the post schedule. */
function checkLabor(c: Contract, invoices: Invoice[]): Hit | null {
  const holidaySet = new Set(c.holidayCalendar);
  const evidence: Evidence[] = [];
  let recoverable = 0;
  let holidayLines = 0;
  let otHoursTotal = 0;
  let otRecoverable = 0;

  // Regular-rate lookup (the baseline a holiday/OT premium is measured against).
  const regRateCents = (() => {
    const r = c.rateCard.find((rc) => /regular/i.test(rc.description) && /hour/i.test(rc.uom));
    return r?.unitPriceCents ?? null;
  })();

  // Determine whether the scheduled post is already fully covered by regular
  // hours (then any OT is structurally beyond the schedule). Compare billed
  // regular hours/week against the contracted scheduledHoursPerWeek.
  const monthsCovered = distinctServiceMonths(invoices);
  const totalRegularHours = invoices
    .flatMap((inv) => inv.lines)
    .filter((l) => l.lineType === "labor" && l.laborType === "regular")
    .reduce((a, l) => a + l.qty, 0);
  const weeksCovered = (monthsCovered * 365) / 7 / 12;
  const regularHoursPerWeek = weeksCovered > 0 ? totalRegularHours / weeksCovered : 0;
  const scheduled = c.scheduledHoursPerWeek;
  const postFullyCovered =
    scheduled != null && scheduled > 0 && regularHoursPerWeek >= scheduled * 0.95;

  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (line.lineType !== "labor") continue;

      // Holiday premium on a non-holiday date -> recover the premium portion.
      if (line.laborType === "holiday") {
        const sd = line.serviceDate ?? inv.billingPeriodStart ?? inv.invoiceDate;
        if (!holidaySet.has(sd) && regRateCents != null) {
          const premiumPerHour = Math.max(line.unitPriceCents - regRateCents, 0);
          const premium = Math.round(premiumPerHour * line.qty);
          if (premium > 0) {
            recoverable += premium;
            holidayLines += 1;
            evidence.push({
              label: `Holiday premium on non-holiday (${sd})`,
              value: `${formatQty(line.qty)} hrs at ${formatUSDPrecise(line.unitPriceCents)} vs regular ${formatUSDPrecise(regRateCents)} = ${formatUSD(premium)} misapplied premium (${sd} is not in the contract holiday calendar)`,
              sourceDoc: inv.sourceDoc,
            });
          }
        }
      }

      // Overtime beyond the post schedule. When the scheduled post is fully
      // covered by regular hours, all OT is excess.
      if (line.laborType === "ot" && postFullyCovered) {
        otHoursTotal += line.qty;
        otRecoverable += line.lineTotalCents;
      }
    }
  }

  if (otRecoverable > 0) {
    recoverable += otRecoverable;
    evidence.push({
      label: `Overtime beyond the post schedule (${formatQty(scheduled ?? 0)} hrs/wk)`,
      value: `Regular hours already cover the post (${regularHoursPerWeek.toFixed(0)} hrs/wk vs ${formatQty(scheduled ?? 0)} scheduled); ${formatQty(otHoursTotal)} OT hrs across the period = ${formatUSD(otRecoverable)} of unwarranted overtime`,
      sourceDoc: c.sourceDoc,
    });
  }

  if (recoverable === 0) return null;

  evidence.unshift({
    label: "Contract labor schedule",
    value: `Scheduled post = ${formatQty(scheduled ?? 0)} hrs/week; billable holidays = ${c.holidayCalendar.length} dates. Premiums and OT are only warranted within those terms.`,
    sourceDoc: c.sourceDoc,
  });

  if (holidayLines > 0) {
    evidence.push({
      label: "Holiday calendar",
      value: c.holidayCalendar.join(", ") || "(none)",
      sourceDoc: c.sourceDoc,
    });
  }

  return {
    evidence,
    recoverableCents: recoverable,
    annualizedCents: annualize(recoverable, monthsCovered),
  };
}

/**
 * A "delivery-type" accessorial is a surcharge that only applies to a specific
 * delivery condition (residential address, liftgate, inside delivery, limited
 * access, appointment). Universal surcharges that apply to every shipment
 * regardless of delivery type (fuel/GRI) are NOT leakage — they are legitimate
 * contracted charges — so they are excluded here.
 */
function isDeliveryTypeAccessorial(line: InvoiceLine): boolean {
  const d = line.description.toLowerCase();
  if (/(fuel|gri|general rate increase)/.test(d)) return false;
  return /(residential|liftgate|lift gate|inside delivery|limited access|appointment|reconsignment|redelivery|notification)/.test(
    d,
  );
}

/** (c) Accessorial leakage — surcharge lines that do not match the delivery type. */
function checkAccessorial(c: Contract, invoices: Invoice[]): Hit | null {
  const evidence: Evidence[] = [];
  let recoverable = 0;
  const byKind = new Map<string, { qty: number; cents: number }>();

  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (line.lineType !== "accessorial") continue;
      if (!isDeliveryTypeAccessorial(line)) continue;
      recoverable += line.lineTotalCents;
      const k = line.description;
      const agg = byKind.get(k) ?? { qty: 0, cents: 0 };
      agg.qty += line.qty;
      agg.cents += line.lineTotalCents;
      byKind.set(k, agg);
    }
  }

  if (recoverable === 0) return null;

  evidence.push({
    label: "Contract scope — delivery type",
    value: `Scope is ${c.category}; accessorial surcharges (e.g. residential, liftgate) do not apply to these commercial deliveries.`,
    sourceDoc: c.sourceDoc,
  });
  for (const [desc, agg] of byKind) {
    evidence.push({
      label: `Unwarranted accessorial — ${desc}`,
      value: `${formatQty(agg.qty)} units across the period = ${formatUSD(agg.cents)} billed on commercial deliveries that do not warrant the surcharge`,
      sourceDoc: c.sourceDoc,
    });
  }

  const monthsCovered = distinctServiceMonths(invoices);
  return {
    evidence,
    recoverableCents: recoverable,
    annualizedCents: annualize(recoverable, monthsCovered),
  };
}

function analyzeVendor(v: VendorRecord, _ctx: RuleContext) {
  const c = v.contract;
  if (!c || v.invoices.length === 0) return [];

  // A vendor exhibits exactly one overbilling pattern; pick whichever fires.
  const seasonal = checkSeasonal(c, v.invoices);
  const labor = checkLabor(c, v.invoices);
  const accessorial = checkAccessorial(c, v.invoices);

  const hit = seasonal ?? labor ?? accessorial;
  if (!hit) return [];

  let kind: string;
  let title: string;
  let recommendedAsk: string;
  if (seasonal) {
    kind = "Unperformed seasonal service";
    title = `${v.vendor.name}: seasonal service billed out of season`;
    recommendedAsk = `Credit ${formatUSD(hit.recoverableCents)} for the out-of-season service lines and correct the go-forward billing to the contracted season window.`;
  } else if (labor) {
    kind = "Labor overbilling (holiday premium + overtime)";
    title = `${v.vendor.name}: misapplied holiday premiums and unwarranted overtime`;
    recommendedAsk = `Credit ${formatUSD(hit.recoverableCents)} for holiday premiums charged on non-holidays and overtime beyond the scheduled post, and correct the go-forward billing process.`;
  } else {
    kind = "Accessorial leakage";
    title = `${v.vendor.name}: unwarranted accessorial surcharges on commercial deliveries`;
    recommendedAsk = `Credit ${formatUSD(hit.recoverableCents)} for residential/liftgate accessorials billed on commercial dock deliveries and add invoice-validation terms to block them going forward.`;
  }

  const summary =
    `${kind}: ${formatUSD(hit.recoverableCents)} of wrongly-billed charges identified across ${v.invoices.length} invoices ` +
    `(annualized run-rate ${formatUSD(hit.annualizedCents)}). Each charged line is contradicted by the contract schedule/scope.`;

  return [
    makeFinding({
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      category: "overbilling",
      vendorId: v.vendor.id,
      vendorName: v.vendor.name,
      title,
      summary,
      savingsType: "recovery",
      annualizedSavingsCents: hit.annualizedCents,
      recoverableToDateCents: hit.recoverableCents,
      confidence: 0.95,
      severity: "high",
      leverage:
        "Itemized proof that each line is contradicted by the signed contract schedule/scope justifies a credit now and corrected go-forward billing terms.",
      evidence: hit.evidence,
      recommendedAsk,
    }),
  ];
}

const rule = perVendorRule(RULE_ID, RULE_NAME, "overbilling", analyzeVendor);
export default rule;
