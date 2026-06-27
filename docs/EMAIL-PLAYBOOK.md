# Vendor Email Playbook

## Auto-Renewal — Cancellation / Renegotiation (R01)

**Leverage:** The auto-renewal/notice clause and whether the vendor met its obligations (SLA, uptime, support) - non-performance is the strongest exit lever. State evergreen-clause law (several states require clear-and-conspicuous notice and may render a silent 60-90 day auto-renew unenforceable). The vendor's incentive: re-papering keeps recurring revenue, so they would rather adjust the term than fight a churn.

**Ask framing:** Don't ask 'can we cancel?'. Ask for one specific outcome: (a) release from the renewed term with a pro-rata credit, or (b) convert to month-to-month at the current rate while you evaluate. If the window was missed, anchor on a 3-month bridge rather than a full year. Always set a ~10-business-day deadline and pair with a face-saving path.

**Template:**

```
Subject: {Company} – {Vendor} renewal {contract #}: term adjustment request

Hi {name},

We value the partnership and want to keep working together, but I need to flag the {date} auto-renewal under Section {X} of our MSA. {Choose: We notified you of non-renewal on {date} / The notice window does not appear to meet the 'clear and conspicuous' standard required under {state} law / Our SLA experience this term — {specific, e.g. three SLA-credit events in Q1} — has materially changed our position}.

Rather than dispute the renewal, I'd like to propose a clean path: {convert the renewed term to month-to-month at the current ${X}/mo rate / release us from the {N}-month renewal with a pro-rata credit of ${Y}}, effective {date}. This keeps us as a customer while we right-size our footprint.

Can you confirm by {date, ~10 business days out}? Happy to jump on a call — we'd like to resolve this collaboratively before it escalates to a formal contract review.

Best, {name}, {title}
```

---

## Invoice Overcharge / Refund Claim (R02, R11, R14)

**Leverage:** The contract/PO/rate card versus the invoiced amount - a documented variance is a near-automatic concession. Cite invoice number, date, total billed, the specific charges disputed, amounts, and why they are incorrect; attach the PO, signed order form, and usage/service logs. Invoke the audit-rights clause if present. Remedy options the vendor can offer painlessly: a credit note or a corrected invoice.

**Ask framing:** State the exact dollar overcharge and the remedy - a credit note for ${delta} or a refund. Itemize precisely ('billed for 12 units, contracted for 10'); precision signals you've done the math. Offer to pay the undisputed portion immediately as good faith. Frame it as 'your records and ours don't match' so it's easy to fix without losing face.

**Template:**

```
Subject: Billing discrepancy – Invoice {#}, ${total} – correction requested

Hi {name},

We're reviewing Invoice {#} dated {date} for ${total} and identified a discrepancy against {PO {#} / our rate card / MSA Section {X}}:

- Charged: {line item} at ${charged}
- Contracted/ordered: ${correct}
- Overcharge: ${delta}

Supporting documentation attached ({PO, signed order form, usage export}). Please issue a {credit note / refund} for ${delta} and a corrected invoice. We'll remit the undisputed balance of ${undisputed} on standard terms upon receipt.

Please confirm the correction by {date, ~10 business days out}. If helpful, we can exercise the audit-records provision under Section {X} to reconcile jointly.

Thanks, {name}, {title}
```

---

## Unused-Seat / License Reduction at Renewal (R03, R10)

**Leverage:** Your own utilization export - export actual seat activity over the prior 90 days; if you pay for 200 licenses and 130 show no meaningful usage, you have a document-backed argument (up to 30% of SaaS spend is recoverable; ~49% of licenses go unused within 30 days). Renewal timing is the only window. Churn risk: most vendors right-size rather than lose the customer entirely.

**Ask framing:** Anchor on the active-usage number, not the provisioned number. Ask to renew at {active seats} instead of {provisioned}, and propose a true-up clause to add seats later at the same unit price. Offer to hold the per-seat price flat in exchange for the reduction - that protects their headline rate and makes 'yes' easy.

**Template:**

```
Subject: {Vendor} renewal – right-sizing to actual usage ({active}/{provisioned} seats)

Hi {name},

Ahead of our {date} renewal, we pulled 90-day utilization from the admin console. Of {provisioned} provisioned seats, {active} show meaningful activity — {idle} are idle.

For renewal we'd like to right-size to {active} seats. To keep this simple and protect your unit economics, we'll hold the per-seat rate flat at ${rate} and add a true-up provision so we can re-add seats at the same price as we grow. Net renewal value: ${new total} vs ${old total} today.

Usage export attached. Can you have the revised order form to us by {date, ~10 business days out}? We'd rather expand this relationship from a clean baseline than carry shelfware into another term.

Best, {name}, {title}
```

---

## Price-Escalator / Renewal Uplift Challenge (R04)

**Leverage:** Market benchmark / public list pricing as an objective reference. Typical software renewal uplifts run 5-7%; enterprise vendors commonly accept a 3% cap (or CPI-linked with a 5-7% ceiling) in exchange for a multi-year commitment. The tell: if a vendor won't agree to a cap, that says something about their pricing trajectory - use that framing. If the applied uplift exceeded the contract's own cap, this becomes a straight breach/refund instead.

**Ask framing:** Anchor low and specific - counter a proposed uplift with '0% this year, then a 3% cap or CPI capped at 5% thereafter.' Tie the concession to a quid pro quo (each additional committed year is worth ~5% discount). Argue out-of-line-with-market and budget predictability, not 'unfair.'

**Template:**

```
Subject: {Vendor} renewal pricing – capping the annual uplift

Hi {name},

Thanks for the renewal quote. The proposed {X}% increase is above the 5-7% band we benchmark across comparable SaaS agreements, and our finance team needs budget predictability to re-sign.

Here's a structure that works for both sides: 0% uplift for the upcoming term, and a contractual cap of {3% / CPI not to exceed 5%} on any future increase. In exchange, we're prepared to commit to a {2-3}-year term, which gives you the revenue visibility to justify the cap internally.

Can you confirm whether the cap is workable by {date, ~10 business days out}? A predictable ceiling lets us expand with confidence; open-ended escalators force us to re-bid at every renewal.

Best, {name}, {title}
```

---

## Volume-Discount / Tier Optimization & Consolidation (R07, R13)

**Leverage:** Aggregated/consolidated spend increases volume and pricing power - consolidation yields 10-20% savings, and a consolidated negotiation captures 6-10 points better unit pricing than fragmented ones. Ask for the exact discount formula per spend band, with lookback periods and annual true-ups so the volume math is auditable. Cross-vendor redundancy (R13) lets you direct retained spend to one vendor to cross a tier.

**Ask framing:** Anchor on the next tier's price applied to your committed volume. Show you're just below (or can consolidate to cross) a threshold, and ask for that tier's unit price now in exchange for the commitment. Name the specific unit price or % from the tier table. Position consolidation as giving them more wallet share - a gain to them, not a squeeze.

**Template:**

```
Subject: Consolidating spend with {Vendor} – tier pricing proposal

Hi {name},

We're consolidating {categories / tools / subsidiary spend} and want to direct more of it to {Vendor}. Combined, that brings our annual commitment to ${X} — which crosses your {Tier N} threshold.

We'd like to lock the {Tier N} unit price of ${rate} (vs the ${current} we pay today) against that committed volume, with a clear band-by-band discount schedule, a {12-month} lookback, and an annual true-up so the volume math is transparent both ways.

In return you get ${delta} of incremental annual spend and fewer fragmented contracts to service. Can your team send a tiered pricing matrix by {date, ~10 business days out}? Happy to walk through the consolidation plan on a call.

Best, {name}, {title}
```

---

## Early-Pay Discount / Late-Fee Waiver (R08)

**Leverage:** Cash-flow value to the vendor - early payment accelerates their cash and positions you as a preferred buyer. The 2/10 net 30 math: a 2% discount for paying 20 days early = (0.02/0.98) x (360/20) = ~36.7% annualized, cheaper than their cost of capital. Sliding-scale/dynamic discounting if a flat 2% is resisted. For late-fee waivers: clean payment history plus relationship, settled through individual negotiation.

**Ask framing:** Early pay: anchor on 2/10 net 30 (or 2/10 net 45 for longer terms too); offer guaranteed 10-day payment for 2%, framed as you doing them a cash-flow favor. Late fee: ask for a full waiver of the ${fee} charge citing first/clean occurrence and immediate payment of principal.

**Template:**

```
Subject: Faster payment in exchange for early-pay terms

Hi {name},

We're able to pay {Vendor} invoices on an accelerated schedule and would like to formalize 2/10 net 30: a 2% discount when we settle within 10 days. On our ${annual} annual spend that's ${savings}/yr to us — and materially faster cash to you (the equivalent of a ~36% annualized return on the discount you extend).

If a flat 2% is tight, we're open to a sliding scale ({2% at 5 days / 1.5% at 10}). Can we add this to the next order form effective {date}?

[Late-fee variant] Subject: Invoice {#} – payment today, requesting late-fee waiver
Hi {name}, Invoice {#} slipped past terms on our side — apologies. We're remitting the full principal of ${principal} today. Given our clean payment history and that this is a first occurrence, could you waive the ${fee} late charge as a one-time courtesy? Happy to set up {autopay / a PO process} to prevent a repeat.

Thanks, {name}, {title}
```

---

