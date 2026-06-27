/**
 * R13 — Cross-Vendor Redundant / Overlapping Tool.
 *
 * Unlike the per-vendor rules, R13 reasons across the whole portfolio: it scans
 * every active contract's `capabilityTags` for the SAME capability appearing on
 * two or more separately-billed vendors. When such an overlap exists, the
 * eliminable vendor is the standalone subscription whose ENTIRE spend is that
 * one capability (versus a peer where the same capability ships bundled as one
 * tag among many). Dropping the standalone subscription at its renewal/cancel
 * window avoids its full annual cost — a clean consolidation lever ("this is
 * already covered under our cloud agreement's security add-on").
 *
 * Seed instance: "Managed Detection & Response (MDR)" appears on both
 * AtlasCloud (bundled add-on inside an IaaS agreement) and RedShield Cyber (a
 * standalone managed-SOC subscription). RedShield is the redundant, eliminable
 * tool (~$28K/yr).
 */
import type { Rule, RuleContext } from "./types";
import { makeFinding } from "./types";
import type { Finding, VendorRecord, Evidence } from "../types";
import { formatUSD } from "../money";
import { invoicesTotal } from "./util";
import { addDays, daysBetween, type ISODate } from "../dates";

const RULE_ID = "R13";
const RULE_NAME = "Cross-Vendor Redundant Tool";

/** Annualize a vendor's billed run-rate from its invoice series. */
function annualizedSpend(rec: VendorRecord): number {
  const invs = rec.invoices;
  if (invs.length === 0) {
    return rec.contract?.currentAnnualValueCents ?? 0;
  }
  const total = invoicesTotal(invs);
  // Monthly invoice series => annualize the average monthly bill.
  const avgPerInvoice = total / invs.length;
  return Math.round(avgPerInvoice * 12);
}

/**
 * A vendor is a "standalone" instance of `tag` when that capability is the
 * essence of the contract rather than one add-on among many — i.e. the contract
 * carries only a small number of capability tags and the tag is one of them.
 * AtlasCloud's MDR is one of four tags on a broad IaaS agreement (bundled);
 * RedShield's MDR is the headline of a focused security subscription.
 */
function isStandalone(rec: VendorRecord, tag: string): boolean {
  const tags = rec.contract?.capabilityTags ?? [];
  if (!tags.includes(tag)) return false;
  // Standalone subscriptions are narrowly scoped (the capability and a couple
  // of closely-related ones); bundled add-ons live on a broad, multi-domain
  // contract. Use a small tag-count cutoff to separate the two.
  return tags.length <= 3;
}

/** The renewal/cancellation deadline for the eliminable contract (tie to R01). */
function noticeDeadline(rec: VendorRecord, analysisDate: ISODate): ISODate | null {
  const c = rec.contract;
  if (!c) return null;
  // First end-of-term on/after the analysis date, minus the notice window.
  let termEnd = c.endDate;
  // Walk forward by renewal terms if the contract already ended (auto-renew).
  if (c.autoRenew) {
    while (daysBetween(analysisDate, termEnd) < 0) {
      termEnd = addDays(termEnd, Math.round((c.renewalTermMonths || 12) * 30.4375));
    }
  }
  const deadline = addDays(termEnd, -(c.noticeWindowDays || 0));
  return deadline;
}

function buildFinding(
  eliminable: VendorRecord,
  peer: VendorRecord,
  tag: string,
  ctx: RuleContext,
): Finding {
  const annual = annualizedSpend(eliminable);
  const elimContract = eliminable.contract!;
  const peerContract = peer.contract!;
  const deadline = noticeDeadline(eliminable, ctx.analysisDate);

  const evidence: Evidence[] = [
    {
      label: `Overlapping capability`,
      value: `"${tag}" is covered by both ${peer.vendor.name} and ${eliminable.vendor.name}.`,
      sourceDoc: null,
    },
    {
      label: `${eliminable.vendor.name} — standalone subscription (eliminable)`,
      value: `Capability tags: ${elimContract.capabilityTags.join(", ")}. Contract ${elimContract.id} runs ${elimContract.effectiveDate} → ${elimContract.endDate}, ${elimContract.noticeWindowDays}-day notice.`,
      sourceDoc: elimContract.sourceDoc,
    },
    {
      label: `${peer.vendor.name} — capability already bundled (retained)`,
      value: `Capability tags: ${peerContract.capabilityTags.join(", ")}. "${tag}" ships as a bundled add-on under contract ${peerContract.id}.`,
      sourceDoc: peerContract.sourceDoc,
    },
    {
      label: `${eliminable.vendor.name} run-rate`,
      value: `${eliminable.invoices.length} monthly invoice(s) annualizing to ${formatUSD(annual)} (contract current annual value ${formatUSD(elimContract.currentAnnualValueCents)}).`,
      sourceDoc: eliminable.invoices[0]?.sourceDoc ?? null,
    },
  ];

  // Cite the actual recurring invoice line that proves the standalone spend.
  const firstLine = eliminable.invoices[0]?.lines[0];
  if (firstLine) {
    evidence.push({
      label: `${eliminable.vendor.name} billed line`,
      value: `${firstLine.description} — ${formatUSD(firstLine.lineTotalCents)}/mo (${firstLine.lineType}).`,
      sourceDoc: eliminable.invoices[0]?.sourceDoc ?? null,
    });
  }

  const deadlineNote = deadline
    ? ` Issue the non-renewal/cancellation notice before ${deadline} (${elimContract.noticeWindowDays}-day window).`
    : "";

  return makeFinding({
    ruleId: RULE_ID,
    ruleName: RULE_NAME,
    category: "tier_optimization",
    vendorId: eliminable.vendor.id,
    vendorName: eliminable.vendor.name,
    title: `Redundant ${tag} — ${eliminable.vendor.name} duplicates ${peer.vendor.name}`,
    summary:
      `${eliminable.vendor.name}'s standalone "${tag}" subscription (${formatUSD(annual)}/yr) overlaps the same capability already bundled in ` +
      `${peer.vendor.name}'s agreement. Eliminating the redundant standalone subscription at its renewal/cancellation window avoids the full annual cost.${deadlineNote}`,
    savingsType: "avoidance",
    annualizedSavingsCents: annual,
    atRiskCents: 0,
    confidence: 0.82,
    severity: "high",
    leverage:
      `"${tag}" is already covered under our agreement with ${peer.vendor.name} — a clean non-renewal justification for ${eliminable.vendor.name} and a consolidation lever toward a single retained vendor.`,
    evidence,
    recommendedAsk:
      `Do not renew the ${eliminable.vendor.name} ${tag} subscription; eliminate the redundant ${formatUSD(annual)}/yr spend (capability already provided under the ${peer.vendor.name} agreement).`,
    deadlineDate: deadline,
  });
}

const rule: Rule = {
  id: RULE_ID,
  name: RULE_NAME,
  category: "tier_optimization",
  run(ctx: RuleContext): Finding[] {
    const vendors = ctx.dataset.vendors.filter((v) => v.contract !== null);

    // capability tag -> vendors carrying it.
    const byTag = new Map<string, VendorRecord[]>();
    for (const rec of vendors) {
      for (const tag of rec.contract!.capabilityTags) {
        const arr = byTag.get(tag) ?? [];
        arr.push(rec);
        byTag.set(tag, arr);
      }
    }

    const findings: Finding[] = [];
    const seen = new Set<string>(); // dedupe by eliminable vendorId

    for (const [tag, recs] of byTag) {
      if (recs.length < 2) continue; // no cross-vendor overlap

      // Among the overlapping vendors, the eliminable ones are the standalone
      // subscriptions; the retained peer is a non-standalone (bundled) carrier.
      const standalones = recs.filter((r) => isStandalone(r, tag));
      const bundledPeers = recs.filter((r) => !isStandalone(r, tag));
      if (standalones.length === 0 || bundledPeers.length === 0) continue;

      // Drop the cheaper-to-eliminate standalone subscription; retain a peer
      // that already bundles the capability.
      const eliminable = [...standalones].sort(
        (a, b) => annualizedSpend(a) - annualizedSpend(b),
      )[0];
      const peer = bundledPeers[0];

      if (seen.has(eliminable.vendor.id)) continue;
      seen.add(eliminable.vendor.id);

      findings.push(buildFinding(eliminable, peer, tag, ctx));
    }

    return findings;
  },
};

export default rule;
