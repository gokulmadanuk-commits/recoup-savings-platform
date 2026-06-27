/**
 * R01 — Auto-Renewal / Evergreen Notice-Window Alert.
 *
 * Fires when a contract auto-renews within CONFIG.autoRenewalWindowDays (90) of
 * the analysis date. Acting before the notice deadline converts an automatic
 * renewal into a competitive renewal event — the single highest-leverage moment
 * in the vendor relationship. The negotiable saving surfaced here is the
 * renewal UPLIFT (the escalator the buyer can challenge by acting on the
 * window); the full post-renewal contract value is carried as "$ at risk".
 *
 * SEVERITY ladder: CRITICAL once the notice deadline has passed (locked into
 * another term), URGENT inside the final 14 days, otherwise WATCH.
 */
import { perVendorRule, makeFinding, type Rule } from "./types";
import { addDays, daysBetween } from "../dates";
import { formatUSD, formatPct } from "../money";
import { formatLong } from "../dates";
import type { Evidence, Finding } from "../types";

const RULE_ID = "R01";
const RULE_NAME = "Auto-Renewal Notice-Window Alert";

const rule: Rule = perVendorRule(
  RULE_ID,
  RULE_NAME,
  "auto_renewal",
  (vendor, ctx): Finding[] => {
    const { contract } = vendor;
    if (!contract || !contract.autoRenew) return [];

    const today = ctx.analysisDate;
    const daysToRenewal = daysBetween(today, contract.endDate);
    // Trigger only when the renewal is in the future AND inside the window.
    if (daysToRenewal <= 0 || daysToRenewal > ctx.config.autoRenewalWindowDays) {
      return [];
    }

    const currentAnnualValueCents = contract.currentAnnualValueCents;
    const upliftPct = contract.escalator?.fixedPct ?? 0;
    const renewalValueCents = Math.round(
      currentAnnualValueCents * (1 + upliftPct),
    );
    // The negotiable saving is the uplift the buyer can challenge at renewal.
    const annualizedSavingsCents = renewalValueCents - currentAnnualValueCents;
    const atRiskCents = renewalValueCents;

    const noticeDeadline = addDays(contract.endDate, -contract.noticeWindowDays);
    const daysToDeadline = daysBetween(today, noticeDeadline);

    let severity: Finding["severity"];
    if (daysToDeadline <= 0) {
      severity = "critical";
    } else if (daysToDeadline <= ctx.config.noticeUrgentDays) {
      severity = "urgent";
    } else {
      severity = "watch";
    }

    const deadlinePassed = daysToDeadline <= 0;
    const upliftLabel = upliftPct > 0 ? formatPct(upliftPct) : "0%";

    const title = deadlinePassed
      ? `Auto-renewal notice window has CLOSED — locked into a ${formatLong(contract.endDate)} renewal`
      : `Auto-renewal notice window closing — act before ${formatLong(noticeDeadline)}`;

    const summary = deadlinePassed
      ? `${contract.vendorName} auto-renews on ${formatLong(contract.endDate)} ` +
        `(${daysToRenewal} days out). The ${contract.noticeWindowDays}-day cancellation-notice ` +
        `deadline was ${formatLong(noticeDeadline)} and has already passed, so absent renegotiation ` +
        `the buyer is locked into another ${contract.renewalTermMonths}-month term. The renewal applies ` +
        `a ${upliftLabel} uplift to the current ${formatUSD(currentAnnualValueCents)}/yr value ` +
        `(${formatUSD(renewalValueCents)}/yr), of which ${formatUSD(annualizedSavingsCents)}/yr is the ` +
        `negotiable increase. The closed/poorly-disclosed evergreen window may itself be unenforceable ` +
        `under several state auto-renewal laws — an escape lever even now.`
      : `${contract.vendorName} auto-renews on ${formatLong(contract.endDate)} ` +
        `(${daysToRenewal} days out) at a ${upliftLabel} uplift, taking the contract from ` +
        `${formatUSD(currentAnnualValueCents)}/yr to ${formatUSD(renewalValueCents)}/yr. ` +
        `Written cancellation notice is due by ${formatLong(noticeDeadline)} ` +
        `(${daysToDeadline} days away). Acting before that deadline opens a competitive renewal: ` +
        `the ${formatUSD(annualizedSavingsCents)}/yr uplift is negotiable and a price hold / escalator cap ` +
        `can be demanded as the condition of staying.`;

    const evidence: Evidence[] = [
      {
        label: "Auto-renew clause",
        value:
          `autoRenew = true; renewal term ${contract.renewalTermMonths} months; ` +
          `notice required by ${contract.noticeMethod ?? "written notice to vendor"} ` +
          `${contract.noticeWindowDays} days before term end`,
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Term end date",
        value: `${formatLong(contract.endDate)} (${daysToRenewal} days from analysis date ${formatLong(today)})`,
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Notice deadline",
        value:
          `${formatLong(noticeDeadline)} ` +
          (deadlinePassed
            ? `— already passed (${Math.abs(daysToDeadline)} days ago): window closed`
            : `— ${daysToDeadline} days away`),
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Current annual value",
        value: `${formatUSD(currentAnnualValueCents)}/yr`,
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Renewal uplift",
        value:
          `${upliftLabel} fixed escalator → renewal value ${formatUSD(renewalValueCents)}/yr; ` +
          `negotiable uplift ${formatUSD(annualizedSavingsCents)}/yr`,
        sourceDoc: contract.sourceDoc,
      },
    ];

    if (contract.earlyTermFeeCents > 0) {
      evidence.push({
        label: "Early-termination fee",
        value: `${formatUSD(contract.earlyTermFeeCents)} termination fee deepens the lock-in`,
        sourceDoc: contract.sourceDoc,
      });
    }

    const recommendedAsk = deadlinePassed
      ? `Release ${contract.vendorName} from the auto-renewal (or convert to month-to-month), ` +
        `citing the missed/poorly-disclosed evergreen window, and cap the renewal uplift at 0% — ` +
        `holding the ${formatUSD(currentAnnualValueCents)}/yr price and avoiding the ` +
        `${formatUSD(annualizedSavingsCents)}/yr increase.`
      : `Before the ${formatLong(noticeDeadline)} notice deadline, demand a price hold or convert to ` +
        `month-to-month and cap the renewal uplift — eliminating the ${upliftLabel} ` +
        `(${formatUSD(annualizedSavingsCents)}/yr) increase on the ${formatUSD(currentAnnualValueCents)}/yr base.`;

    return [
      makeFinding({
        ruleId: RULE_ID,
        ruleName: RULE_NAME,
        category: "auto_renewal",
        vendorId: vendor.vendor.id,
        vendorName: contract.vendorName,
        title,
        summary,
        savingsType: "avoidance",
        annualizedSavingsCents,
        atRiskCents,
        confidence: 0.85,
        severity,
        leverage:
          "An open (or contestable) notice window is the highest-leverage moment in the relationship: " +
          "it converts an automatic renewal into a competitive event, forcing a price hold, escalator cap, " +
          "and seat/commit right-sizing as the price of staying.",
        evidence,
        recommendedAsk,
        deadlineDate: noticeDeadline,
      }),
    ];
  },
);

export default rule;
