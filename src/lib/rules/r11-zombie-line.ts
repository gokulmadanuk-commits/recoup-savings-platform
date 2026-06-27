/**
 * R11 — Zombie / Inactive Service Line (telecom, utility, equipment lease).
 *
 * Recurring invoice lines (MRC per asset) are reconciled against the per-asset
 * inventory/usage export (UsageRecord kind circuit/line/meter/unit). A billed
 * asset is a "zombie" when it is:
 *   (a) DECOMMISSIONED / RETURNED — its inventory status is decommissioned or
 *       returned, yet its MRC keeps billing;
 *   (b) ZERO-USAGE — its usage has been zero for >= CONFIG.zombieZeroUsageMonths
 *       consecutive months (inactive line / circuit) while still billed;
 *   (c) GHOST UNIT — the leased/returned unit count on the invoice exceeds the
 *       count of units still active in inventory (pooled lease lines that carry
 *       no per-unit assetId).
 *
 * Per asset: monthlyWaste = MRC of the inactive asset; recoverableToDate = the
 * MRC summed over the months it was billed after retirement (cash credit);
 * annualizedSavings = monthlyWaste * 12 (forward run-rate). Aggregated per
 * vendor. Category 'overbilling', savingsType 'recovery'.
 */
import { perVendorRule, makeFinding } from "./types";
import type { Rule } from "./types";
import type { Invoice, InvoiceLine, UsageRecord, Evidence } from "../types";
import { formatUSD, formatUSDPrecise } from "../money";
import { monthsBetween, type ISODate } from "../dates";

const RULE_ID = "R11";
const RULE_NAME = "Zombie / Inactive Service Line";

/** Inventory kinds that carry a physical/provisioned asset (not seats). */
const ASSET_KINDS = new Set<UsageRecord["kind"]>(["circuit", "line", "meter", "unit"]);
const RETIRED_STATUSES = new Set(["decommissioned", "returned"]);

/** A recurring (MRC) invoice line carrying a per-asset id. */
function recurringAssetLines(inv: Invoice): InvoiceLine[] {
  return inv.lines.filter(
    (l) => l.lineType === "recurring" && l.assetId != null && l.assetId !== "",
  );
}

/** Months of zero usage as of the analysis date, from the last active date. */
function zeroUsageMonths(rec: UsageRecord, analysisDate: ISODate): number {
  if (!rec.lastActiveDate) return Number.POSITIVE_INFINITY; // never active
  return monthsBetween(rec.lastActiveDate, analysisDate);
}

interface ZombieAsset {
  assetId: string;
  reason: string;
  monthlyWasteCents: number;
  monthsBilled: number;
  recoverableCents: number;
  sampleDescription: string;
  sourceDoc: string;
  retiredDate: ISODate | null;
}

const r11: Rule = perVendorRule(
  RULE_ID,
  RULE_NAME,
  "overbilling",
  (vendor, ctx) => {
    const { analysisDate, config } = ctx;
    const invoices = vendor.invoices;
    if (invoices.length === 0) return [];

    // Index usage by kind for the asset kinds R11 cares about.
    const assetUsage = vendor.usage.filter((u) => ASSET_KINDS.has(u.kind));
    if (assetUsage.length === 0) return [];

    const usageById = new Map<string, UsageRecord>();
    for (const u of assetUsage) usageById.set(u.identifier, u);

    const zombies: ZombieAsset[] = [];

    /* ---------------------------------------------------------------- */
    /* (a)/(b) Per-asset reconciliation: each billed asset line vs its    */
    /* inventory record (retired status OR zero usage >= N months).       */
    /* ---------------------------------------------------------------- */
    const seenAssetIds = new Set<string>();
    for (const inv of invoices) {
      for (const line of recurringAssetLines(inv)) {
        seenAssetIds.add(line.assetId!);
      }
    }

    for (const assetId of seenAssetIds) {
      const rec = usageById.get(assetId);
      if (!rec) continue; // no inventory signal -> cannot prove zombie

      let reason: string | null = null;
      if (rec.status && RETIRED_STATUSES.has(rec.status)) {
        reason = `inventory status "${rec.status}"${
          rec.decommissionDate ? ` on ${rec.decommissionDate}` : ""
        }`;
      } else {
        const isZeroUsage =
          rec.used === false ||
          rec.count === 0 ||
          rec.status === "inactive" ||
          rec.status === "never_used";
        const idleMonths = zeroUsageMonths(rec, analysisDate);
        if (isZeroUsage && idleMonths >= config.zombieZeroUsageMonths) {
          reason = `zero usage for ${
            Number.isFinite(idleMonths) ? idleMonths : "all"
          } months (last active ${rec.lastActiveDate ?? "never"})`;
        }
      }
      if (!reason) continue;

      // Aggregate the MRC across every billed line bearing this asset id, and
      // count the billed months (invoices) the asset appears in.
      let monthlyWaste = 0;
      let monthsBilled = 0;
      let sampleDescription = "";
      let sourceDoc = invoices[0].sourceDoc;
      for (const inv of invoices) {
        const lines = recurringAssetLines(inv).filter((l) => l.assetId === assetId);
        if (lines.length === 0) continue;
        monthsBilled += 1;
        const invMrc = lines.reduce((a, l) => a + l.lineTotalCents, 0);
        // MRC per month is steady; take the per-month figure from the first hit.
        if (monthlyWaste === 0) {
          monthlyWaste = invMrc;
          sampleDescription = lines[0].description;
          sourceDoc = inv.sourceDoc;
        }
      }
      if (monthlyWaste === 0 || monthsBilled === 0) continue;

      zombies.push({
        assetId,
        reason,
        monthlyWasteCents: monthlyWaste,
        monthsBilled,
        recoverableCents: monthlyWaste * monthsBilled,
        sampleDescription,
        sourceDoc,
        retiredDate: rec.decommissionDate ?? rec.lastActiveDate,
      });
    }

    /* ---------------------------------------------------------------- */
    /* (c) Ghost units: pooled lease lines (no per-unit assetId) whose    */
    /* billed unit count exceeds the count of active units in inventory.  */
    /* ---------------------------------------------------------------- */
    // Only meaningful for "unit" inventories with retired (returned) units.
    const unitRecs = assetUsage.filter((u) => u.kind === "unit");
    if (unitRecs.length > 0) {
      const activeUnits = unitRecs.filter((u) => u.status === "active").length;
      const retiredUnits = unitRecs.filter(
        (u) => u.status && RETIRED_STATUSES.has(u.status),
      ).length;
      if (retiredUnits > 0) {
        // Pooled lease lines: recurring "unit" lines without an assetId.
        for (const inv of invoices) {
          const pooled = inv.lines.filter(
            (l) =>
              l.lineType === "recurring" &&
              (l.uom === "unit" || /lease/i.test(l.description)) &&
              (l.assetId == null || l.assetId === ""),
          );
          if (pooled.length === 0) continue;
          // Use the first pooled lease line as the representative.
          const lease = pooled[0];
          const billedUnits = lease.qty;
          const ghostUnits = Math.max(0, billedUnits - activeUnits);
          if (ghostUnits <= 0) continue;
          const ghostCount = Math.min(ghostUnits, retiredUnits);
          const perUnit = lease.unitPriceCents;
          const monthlyWaste = perUnit * ghostCount;

          const existing = zombies.find((z) => z.assetId === "__ghost_units__");
          if (existing) {
            existing.monthsBilled += 1;
            existing.recoverableCents += monthlyWaste;
          } else {
            zombies.push({
              assetId: "__ghost_units__",
              reason: `${ghostCount} returned unit(s) still billed (${billedUnits}-unit invoice vs ${activeUnits} active in inventory)`,
              monthlyWasteCents: monthlyWaste,
              monthsBilled: 1,
              recoverableCents: monthlyWaste,
              sampleDescription: lease.description,
              sourceDoc: inv.sourceDoc,
              retiredDate: unitRecs.find(
                (u) => u.status && RETIRED_STATUSES.has(u.status),
              )?.decommissionDate ?? null,
            });
          }
        }
      }
    }

    if (zombies.length === 0) return [];

    // Aggregate per vendor.
    const monthlyWasteTotal = zombies.reduce((a, z) => a + z.monthlyWasteCents, 0);
    const annualizedSavingsCents = monthlyWasteTotal * 12;
    const recoverableToDateCents = zombies.reduce((a, z) => a + z.recoverableCents, 0);

    const assetWord =
      assetUsage[0].kind === "circuit"
        ? "circuit"
        : assetUsage[0].kind === "line"
          ? "line"
          : assetUsage[0].kind === "meter"
            ? "meter"
            : "unit";
    const count = zombies.length;

    const evidence: Evidence[] = [];
    if (vendor.contract) {
      evidence.push({
        label: "Contract MRC basis",
        value: `${vendor.contract.vendorName} recurring ${assetWord} charges — annual contract value ${formatUSD(
          vendor.contract.currentAnnualValueCents,
        )}`,
        sourceDoc: vendor.contract.sourceDoc,
      });
    }
    for (const z of zombies) {
      const idLabel =
        z.assetId === "__ghost_units__" ? "Ghost units" : `Asset ${z.assetId}`;
      evidence.push({
        label: `${idLabel} — billed ${z.monthsBilled} mo @ ${formatUSDPrecise(
          z.monthlyWasteCents,
        )}/mo`,
        value: `${z.sampleDescription} — ${z.reason}; recoverable ${formatUSD(
          z.recoverableCents,
        )}`,
        sourceDoc: z.sourceDoc,
      });
    }
    // Inventory evidence (proof the asset is retired/idle).
    for (const z of zombies) {
      if (z.assetId === "__ghost_units__") continue;
      const rec = usageById.get(z.assetId);
      if (!rec) continue;
      evidence.push({
        label: `Inventory record ${rec.identifier} (${rec.kind})`,
        value: `status=${rec.status ?? "n/a"}, lastActive=${
          rec.lastActiveDate ?? "never"
        }${rec.decommissionDate ? `, decommissioned ${rec.decommissionDate}` : ""}`,
        sourceDoc: `${vendor.vendor.id}-usage.xlsx`,
      });
    }

    const recommendedAsk = `Credit ${formatUSD(
      recoverableToDateCents,
    )} for the ${count} inactive ${assetWord}(s) billed after retirement, remove them going forward (${formatUSD(
      annualizedSavingsCents,
    )}/yr), and add an inventory-reconciliation/audit-rights clause.`;

    const summary = `${count} ${assetWord}(s) billing a combined ${formatUSDPrecise(
      monthlyWasteTotal,
    )}/mo (${formatUSD(
      annualizedSavingsCents,
    )}/yr) are decommissioned, returned, or zero-usage in the asset inventory yet still carry their monthly recurring charge. ${formatUSD(
      recoverableToDateCents,
    )} is recoverable for periods already billed after retirement.`;

    return [
      makeFinding({
        ruleId: RULE_ID,
        ruleName: RULE_NAME,
        category: "overbilling",
        vendorId: vendor.vendor.id,
        vendorName: vendor.vendor.name,
        title: `Inactive ${assetWord}(s) still billing — ${formatUSD(
          annualizedSavingsCents,
        )}/yr zombie charge`,
        summary,
        savingsType: "recovery",
        annualizedSavingsCents,
        recoverableToDateCents,
        confidence: 0.95,
        severity: "high",
        leverage:
          "A decommissioned circuit, closed-location meter, or returned lease unit still billing is an unarguable, low-controversy credit; reconciling inventory to invoices also establishes audit-rights discipline for future periods.",
        evidence,
        recommendedAsk,
      }),
    ];
  },
);

export default r11;
