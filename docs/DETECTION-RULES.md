# Detection Rules (R01–R14)

> The corpus answer key is the source of truth: each planted finding must fire its rule at the expected dollar figure. All money in integer cents; thresholds are version-pinned config.

## R01 — Auto-Renewal / Evergreen Notice-Window Alert

**Category:** `auto_renewal`

**What it finds:** Contracts auto-renewing within 90 days whose cancellation-notice deadline is imminent or has effectively passed, locking the buyer into another full term they may not want. ~69% of software contracts carry an auto-renew clause with a 30-90 day notice period.

**Detection logic:** INPUTS: ContractTerm.autoRenew, endDate, noticeWindowDays, renewalTermMonths. DERIVE noticeDeadline = endDate - noticeWindowDays; daysToRenewal = endDate - today; daysToDeadline = noticeDeadline - today. TRIGGER when autoRenew == true AND 0 <= daysToRenewal <= 90. SEVERITY: CRITICAL if daysToDeadline <= 0 (window closed, locked in); URGENT if 0 < daysToDeadline <= 14; WATCH if > 14. Run as a daily cron so the 90-day window slides forward.

**Savings formula:** annualRenewalValue = (renewalTermMonths/12) * currentAnnualContractValue. Surface annualRenewalValue as '$ at risk if you miss the window' (avoidance). If acting before deadline enables cancel/renegotiate, captured saving = annualRenewalValue - bestAlternative (switch cost or renegotiated price from R02/R04/R03). Add earlyTermFee to exposure if buyer would otherwise exit mid-term.

**Inputs needed:**
- ContractTerm.autoRenew
- ContractTerm.endDate
- ContractTerm.noticeWindowDays
- ContractTerm.noticeMethod
- ContractTerm.renewalTermMonths
- ContractTerm.earlyTermFee
- currentAnnualContractValue
- trailing-12-month vendor spend (fallback for stale contract value)

**Leverage:** Acting before the deadline converts an automatic renewal into a competitive renewal event - the highest-leverage moment in the relationship. Even when keeping the tool, an open window lets you demand price holds, escalator caps (R04), and seat right-sizing (R03). Fallback: poorly-disclosed 60/90-day evergreen windows can be unenforceable under several state auto-renewal laws, an escape lever if the window was already missed.

---

## R02 — Invoice Rate Mismatch (overcharge vs contracted rate)

**Category:** `rate_mismatch`

**What it finds:** Invoice line items billed above the contracted unit price or rate-card rate for that SKU/period - the classic three-way-match failure (promo rate reverted to list, or vendor price-master drifted). Repeats across months, so dollar value per case exceeds duplicate-payment work.

**Detection logic:** Resolve the applicable RateCardLine via the shared date- and tier-aware line-matcher (exact SKU, else normalized-description fuzzy match >= 0.85). GUARD: uom and currency must match (else normalize/flag). COMPUTE expectedUnitPrice = matchedRateCardLine.contractedUnitPrice; unitDelta = invoicedUnitPrice - expectedUnitPrice. TRIGGER when unitDelta > tolerance (tolerance = max(1 cent, 0.5% of expected)). Also recompute expectedLineTotal = qty * expectedUnitPrice and trigger if lineTotal - expectedLineTotal > tolerance to catch quantity/extension errors. Gate auto-assertion on matchConfidence; route low confidence to review.

**Savings formula:** perLineOvercharge = (invoicedUnitPrice - expectedUnitPrice) * qty. recoverableToDate = sum of perLineOvercharge over all matching historical lines (last 12+ months) -> cash refund/credit. annualizedForward = perLineOvercharge_perPeriod * periodsPerYear. totalClaim = recoverableToDate + annualizedForward.

**Inputs needed:**
- RateCardLine (sku, contractedUnitPrice, uom, currency, effectiveFrom/To, tierMin/Max)
- InvoiceLine.sku or description
- InvoiceLine.uom
- InvoiceLine.qty
- InvoiceLine.invoicedUnitPrice
- InvoiceLine.lineTotal
- InvoiceLine.invoiceDate

**Leverage:** Documented, repeated overcharges on the same SKU are near-incontestable - demand a credit memo or cash refund for the back period, not just a forward fix. Pattern evidence ('billed $X above contract for 7 consecutive months') exposes a vendor price-master control failure and justifies a contractual audit-rights clause going forward.

---

## R03 — Unused Seats / Idle Licenses

**Category:** `unused_seats`

**What it finds:** Gap between paid/contracted seats and seats with genuine recent activity. Average org uses only ~47% of SaaS licenses; 30-53% go unused/underutilized; ~49% of users are inactive within 30 days.

**Detection logic:** INPUTS: contractedSeats (ContractTerm/CommitmentTerm), invoicedSeats (InvoiceLine.qty where uom=='seat'), UsageRecord[] (per-seat lastActiveDate from admin export / SSO / IdP). DEFINE INACTIVE if lastActiveDate == null OR (today - lastActiveDate) > 30 days (default; expose 60/90-day conservative variants); NEVER_USED if provisioned == true AND lastActiveDate == null. COMPUTE paidSeats = max(contractedSeats, invoicedSeats); activeSeats = count(ACTIVE); idleSeats = paidSeats - activeSeats. TRIGGER when idleSeats > 0; rank by idleSeats and idleSeats/paidSeats ratio.

**Savings formula:** pricePerSeat = invoicedSeatLineTotal / invoicedSeats (or contracted rate). annualIdleCost = idleSeats * pricePerSeat * billingPeriodsPerYear. Sanity-bound against ~$1,785/idle-seat/yr benchmark. Realizable value = full at renewal if seats reducible; partial/zero mid-term if locked (route to R09 minimum-commitment).

**Inputs needed:**
- contractedSeats or minCommitQty
- per-seat price
- seat-reducibility flag (mid-term vs renewal)
- InvoiceLine seat qty / lineTotal / uom
- per-user activity export from admin console / SSO / IdP (required third source)

**Leverage:** Hard utilization data ('128 of 400 seats never logged in') is the strongest right-sizing lever at renewal. Pair with R01 timing - present the reclaim before the notice deadline so the vendor must reduce seats or hold price. Anchor on active seats, not provisioned. Offer to hold per-seat rate flat plus a true-up clause to add seats later at the same price - protects their unit economics and makes 'yes' easy. Routinely justifies 20-30% pre-renewal seat reductions.

---

## R04 — Price Escalator / CPI Ratchet Challenge

**Category:** `price_escalator`

**What it finds:** Year-over-year price uplifts exceeding a fair benchmark - any fixed escalator >8%/yr, or a CPI-linked clause applied above CPI + a fair margin. Fair band is 3-5% ('lesser of CPI or 3%'); actual SaaS increases hit ~12% in 2026 vs ~3% CPI.

**Detection logic:** INPUTS: priorPeriodUnitPrice, currentPeriodUnitPrice (same SKU, consecutive annual periods), EscalatorTerm (type, fixedPct, cpiPlusPct, capPct), cpiPct (BLS CPI-U, cached, stored with finding). COMPUTE actualIncreasePct = (current - prior)/prior. DETERMINE contractuallyAllowedPct: fixed->fixedPct; cpi->cpiPct; cpi_plus->cpiPct+cpiPlusPct; greater_of->max(components); apply capPct as ceiling. TRIGGERS: (a) CONTRACT BREACH if actualIncreasePct > contractuallyAllowedPct + tol; (b) ABOVE-MARKET if actualIncreasePct > 0.08; (c) CPI GAP if actualIncreasePct > cpiPct + fairMarginPct (fairMargin 0.03-0.05).

**Savings formula:** challengeablePct = actualIncreasePct - benchmarkPct (benchmark = contractAllowed for breach, or cpi+fairMargin for above-market). overUpliftPerUnit = priorPrice * challengeablePct. annualChallenge = overUpliftPerUnit * qty * periodsPerYear. Escalators compound: present a 3-year NPV of the corrected base, not just year-1. Breach of the contract's own cap is recoverable cash; above-market-but-compliant is avoidance via renewal cap.

**Inputs needed:**
- EscalatorTerm (type, fixedPct/cpiPlusPct/capPct, anniversary)
- same-SKU unit price in two consecutive annual periods
- BLS CPI-U benchmark

**Leverage:** Two levers: (1) applied uplift exceeds the contract cap -> breach/refund; (2) compliant but above-market -> renewal ask to convert to a hard cap ('lesser of CPI or 3%' or fixed 5-7% ceiling), traded for a 2-3 year commitment (~5% discount per committed year). Caps are negotiable for virtually all enterprise SaaS but rarely offered proactively - the finding creates the ask. If a vendor refuses a cap, that itself signals their pricing trajectory.

---

## R05 — Overage / Usage-Tier Mismatch

**Category:** `tier_optimization`

**What it finds:** Usage billed at overage or wrong-tier rates when a higher-allowance tier or correct tier would be cheaper, or overage charged when the allowance was not breached.

**Detection logic:** INPUTS: includedAllowance, overageUnitPrice, tieredRateCard[], actualUsageQty (from invoice). Compute current cost as billed. SIMULATE alternative tiers: for each tierOption cost = tierBaseFee + max(0, usage - tierAllowance) * tierOverageRate. TRIGGERS: (a) cheaper tier exists if min(simulatedTierCosts) < currentBilledCost; (b) misapplied overage if usage <= includedAllowance BUT overage charged; (c) wrong tier rate if invoiced overage rate != contract overage rate for the bracket.

**Savings formula:** overageSaving = currentBilledCost - min(simulatedTierCosts) (avoidance via tier change). misappliedRefund = wronglyChargedOverageUnits * overageUnitPrice (recoverable cash). Annualize over measurement periods.

**Inputs needed:**
- CommitmentTerm.includedAllowance
- CommitmentTerm.overageUnitPrice
- full tier table (base fees + breakpoints + overage rates)
- actual usage qty per period from invoice
- overage line charges and rates from invoice

**Leverage:** If the customer consistently breaches an allowance, buy up the base allowance (cheaper per-unit) rather than pay punitive overage, or renegotiate the overage rate. Consistent under-use plus overage anomalies signals a billing-config error worth a refund.

---

## R06 — Duplicate / Double Billing

**Category:** `duplicate`

**What it finds:** The same charge invoiced and/or paid more than once. Affects ~0.8-2%+ of disbursements; exact matching alone catches only 30-40% of duplicates, so fuzzy matching is required.

**Detection logic:** EXACT: same vendorId AND same invoiceNumber AND same amount -> DUPLICATE (high conf). FUZZY (near-dup) flag if ALL: vendorId matches after entity normalization ('Acme LLC'=='Acme Limited') AND |amountA-amountB|/amountA <= 0.005 AND |dateA-dateB| <= 7 days AND invoiceNumber similarity >= 0.85 (normalize 'INV-1024' vs 'INV1024'). SAME-PERIOD: same vendor + same SKU + overlapping periodStart/periodEnd on two invoices -> recurring-charge double-bill. Normalize entities (strip legal suffixes, casefold) and numbers (strip punctuation) before comparison.

**Savings formula:** duplicateRecovery = sum of confirmed duplicate lineTotals -> cash refund / credit memo. Pure recovery, not avoidance.

**Inputs needed:**
- InvoiceLine.vendorId
- InvoiceLine.invoiceId / number
- InvoiceLine.invoiceDate
- InvoiceLine.amount / lineTotal
- InvoiceLine.sku
- period
- optional payment-clearing data to confirm both were actually paid vs one voided

**Leverage:** Low-controversy, fast recovery - vendors rarely dispute a clean duplicate. Establishes credibility and supports a 'three-way match + audit rights' clause for future invoices.

---

## R07 — Missed Volume Discounts

**Category:** `missed_discount`

**What it finds:** Spend/quantity crossed a contractual volume-discount breakpoint but invoices kept billing the lower-volume (higher) rate. Commonly under-claimed because rebate math relies on hard-to-access cumulative data.

**Detection logic:** INPUTS: tiered RateCardLine[] with (tierMin, tierMax, contractedUnitPrice); cumulativeQty or cumulativeSpend over the rebate measurement window (read per-order vs cumulative-annual basis from the contract). COMPUTE earnedTier = tier where cumulative falls; appliedTier = tier implied by invoicedUnitPrice. TRIGGER when earnedTier.price < appliedTier.price (qualified for a better rate but didn't get it).

**Savings formula:** missedDiscountPerUnit = appliedUnitPrice - earnedTierUnitPrice. recoverable = missedDiscountPerUnit * qtyBilledAtWrongTier (retro credit). annualizedForward = missedDiscountPerUnit * projectedAnnualQty.

**Inputs needed:**
- volume-tier table (tierMin/Max, contractedUnitPrice)
- measurement basis (per-order vs cumulative)
- rebate true-up timing
- per-line qty and unit price
- computed cumulative running totals

**Leverage:** 'We crossed the 10,000-unit tier in month 8; you billed all 12 months at the sub-10K rate' -> retroactive credit plus auto-application going forward. Justifies a contractual automatic tier-application clause with a defined lookback and annual true-up so the buyer isn't policing it.

---

## R08 — Missed Early-Pay Discounts

**Category:** `missed_discount`

**What it finds:** Invoices with discount terms (e.g., 2/10 net 30) paid after the discount window, forfeiting the discount. ~$3M of early-pay discounts go unclaimed per $1B of PO spend; skipping a 2/10 to pay 20 days later equals borrowing at ~36% APR.

**Detection logic:** INPUTS: PaymentTerm (discountPct, discountDays, netDays), invoiceDate, actualPayDate (if available). COMPUTE discountDeadline = invoiceDate + discountDays. RETROSPECTIVE TRIGGER: actualPayDate > discountDeadline AND discountPct > 0 (missed). PROSPECTIVE TRIGGER: today <= discountDeadline AND unpaid (capturable now - run daily).

**Savings formula:** discountValue = invoiceTotal * discountPct. missedToDate = sum of discountValue over missed invoices. capturableNow = sum of discountValue over still-in-window invoices. annualizedAPR = discountPct/(1-discountPct) * (365/(netDays-discountDays)) (~36.5% for 2/10 net 30) - surface to justify prioritizing early payment.

**Inputs needed:**
- PaymentTerm (discountPct, discountDays, netDays)
- invoiceDate
- invoiceTotal
- actual payDate from AP/ERP (retrospective)
- contract terms if not on invoice

**Leverage:** Mostly an internal AP process fix, but quantifying chronic misses ('you left $48K on the table last year') justifies AP automation and can be traded with the vendor for dynamic-discounting terms (e.g., 2% at 5 days, 1.5% at 10).

---

## R09 — Minimum Commitments Not Met (take-or-pay shortfall)

**Category:** `minimum_commit`

**What it finds:** A committed minimum (qty or spend) the buyer pays for but does not consume - wasted take-or-pay floor. Commit $120K, use $80K, and the $40K shortfall is still invoiced.

**Detection logic:** INPUTS: minCommitSpend (or minCommitQty), measurementPeriod, actualConsumption (sum of invoiced usage/spend over the period). COMPUTE shortfall = max(0, minCommit - actualConsumption); utilizationPct = actualConsumption / minCommit. TRIGGER when shortfall > 0; severity scales as utilization drops; flag hard if < 80%.

**Savings formula:** periodWaste = shortfall; annualizedWaste = periodWaste * periodsPerYear. rightSizedCommit = projectedActualConsumption * (1 + bufferPct). recommendedSaving = (currentCommit - rightSizedCommit) at contract rate. In-term shortfall is often unrecoverable (you owe the floor); the saving is realized by right-sizing at renewal - tie to R01 timing.

**Inputs needed:**
- CommitmentTerm.minCommitSpend or minCommitQty
- measurementPeriod
- true-up mechanics
- actual consumption/spend per period from invoices

**Leverage:** A documented utilization trend (65% of a $120K floor for 3 consecutive periods) is the lever to lower the next-term minimum or convert take-or-pay to drawdown/rollover. Over-commitment also signals the original deal was oversold - leverage for additional concessions.

---

## R10 — Tier Downgrade / Right-Sizing (over-provisioned plan)

**Category:** `tier_optimization`

**What it finds:** Buyer on a higher plan tier (e.g., E5/enterprise) but only using features available on a cheaper tier. Distinct from R03: there the seat is idle; here the seat is active but over-tiered.

**Detection logic:** INPUTS: currentTier + its pricePerSeat, featureCatalog (which features each tier unlocks), featureUsage (per-feature adoption from vendor usage export / API). COMPUTE premiumFeaturesUsed = features used that exist ONLY above the next-cheaper tier. TRIGGER when premiumFeaturesUsed == 0 (or below a usage threshold across the seat population) -> safe-to-downgrade candidate. Requires contrasting last-login with actual feature usage, not just login activity.

**Savings formula:** perSeatSaving = currentTierPrice - lowerTierPrice. annualSaving = perSeatSaving * downgradableSeats * billingPeriodsPerYear. Avoidance, realized at renewal.

**Inputs needed:**
- current tier and per-tier pricing
- feature-tier mapping / feature catalog
- tier and seat count billed
- per-feature usage telemetry from vendor admin export / API

**Leverage:** 'You sold us E5; nobody uses the E5-only features - we're downgrading to E3 unless you match the E3-equivalent price.' Strong renewal lever; pair with R01 timing and R03 seat data for a combined right-sizing package.

---

## R11 — Zombie / Inactive Service Line (telecom, utility, equipment)

**Category:** `overbilling`

**What it finds:** Recurring charges for a decommissioned site, disconnected circuit, ex-employee wireless line, returned/ghost equipment unit, or a closed location's meter still billing its monthly recurring charge (MRC). The TEM analog of idle seats.

**Detection logic:** INPUTS: active-asset inventory (circuits / lines / meters / leased units from service orders and admin systems), recurring invoice lines (MRC per asset), per-asset usage records. TRIGGER (a) ASSET NOT IN INVENTORY: invoice line bills an asset absent from the current active-asset list; (b) ZERO-USAGE: per-line/circuit usage == 0 for N consecutive months (default 3) while still billed; (c) GHOST UNIT: leased/returned unit count on invoice exceeds active deployed count.

**Savings formula:** perAssetMonthlyWaste = MRC of the inactive asset. recoverableToDate = sum of perAssetMonthlyWaste over months billed after decommission (cash credit). annualizedForward = perAssetMonthlyWaste * 12.

**Inputs needed:**
- active-asset inventory (circuit/line/meter/unit list with status)
- per-asset MRC from invoice
- per-asset usage over trailing N months
- decommission/return dates from service orders

**Leverage:** Clean, low-controversy recovery - a decommissioned circuit or closed-location meter still billing is an unarguable credit. Establishes an inventory-reconciliation discipline and audit-rights clause for future invoices.

---

## R12 — Service / Labor Overbilling (overtime, holiday, unperformed, accessorial)

**Category:** `overbilling`

**What it finds:** Hourly-services and logistics invoices billing more than the schedule justifies: overtime hours exceeding the post schedule, holiday premiums applied to non-holidays, seasonal lines billed out of season (snow removal in summer), or accessorial/surcharge lines that don't match the delivery type (residential or liftgate fees on commercial dock deliveries).

**Detection logic:** INPUTS: contract post orders / scope-of-work schedule, service calendar (holidays, season windows), delivery-type metadata, invoice labor and accessorial lines. TRIGGERS: (a) OT/HOLIDAY: invoiced OT hours > scheduled hours, OR holiday-premium line on a date not in the holiday calendar; (b) UNPERFORMED: seasonal/conditional service line billed in a period with no qualifying event (snow line in summer, per service log); (c) ACCESSORIAL LEAKAGE: surcharge line (residential, liftgate) on a delivery whose type does not warrant it.

**Savings formula:** overbillingRecovery = sum of (wronglyBilledHours * rate) + (misappliedPremiumLines) + (unwarrantedAccessorialCharges). Recoverable cash; annualize recurring patterns.

**Inputs needed:**
- post orders / scope-of-work schedule
- service calendar (holidays, season windows)
- service logs (events performed)
- delivery-type metadata
- invoice labor lines (regular/OT/holiday) and accessorial/surcharge lines

**Leverage:** Itemized 'you billed holiday premium on 6 non-holidays and OT exceeding the post schedule by 12 hrs/week' demands a credit and a corrected go-forward billing process. Accessorial leakage on logistics is a recurring, compounding recovery that also justifies tighter invoice-validation terms.

---

## R13 — Cross-Vendor Redundant / Overlapping Tool

**Category:** `tier_optimization`

**What it finds:** Two vendors billing for functionally overlapping capability (e.g., a standalone MDR/SOC subscription overlapping a security add-on already bundled in a cloud agreement). Enterprises average 5-7 functionally overlapping tools.

**Detection logic:** INPUTS: per-vendor capability tags (from contract scope / product category), active subscriptions across the vendor portfolio. COMPUTE capability overlap sets across vendors. TRIGGER when two or more active, separately-billed contracts cover the same capability tag above an overlap threshold, AND at least one is a candidate for elimination/non-renewal. Route to human review (capability equivalence is judgment-heavy).

**Savings formula:** redundancySaving = annual cost of the eliminable overlapping subscription (the cheaper-to-drop or lower-utilized one). Avoidance realized at the eliminable contract's renewal/cancellation window (tie to R01).

**Inputs needed:**
- per-vendor capability/category tags
- active subscription list with annual cost
- utilization signals per overlapping tool (to choose which to drop)

**Leverage:** 'This capability is already covered under our cloud agreement's security add-on' is a clean non-renewal justification for the redundant vendor and a consolidation lever - directing the retained spend to one vendor can earn a better tier (R07).

---

## R14 — Headcount-Based Fee Overbilling (PEPM / per-unit)

**Category:** `overbilling`

**What it finds:** Per-employee-per-month (PEPM) or per-unit fees billed on a stale or inflated count - e.g., payroll/benefits billing 640 employees when the HRIS roster is 600, or a percentage-of-spend management fee computed at the wrong rate (15% billed vs 12% contracted).

**Detection logic:** INPUTS: contract fee basis (PEPM rate, or % of a defined base), authoritative count/base (HRIS headcount roster, or contractual ad-spend base), invoice fee line and implied count/rate. TRIGGER (a) COUNT MISMATCH: invoiced billable count > authoritative roster count for the period; (b) RATE MISMATCH: invoiced fee / base != contracted percentage or PEPM rate (beyond tolerance).

**Savings formula:** countOvercharge = (invoicedCount - authoritativeCount) * PEPMRate * periods. rateOvercharge = (invoicedPct - contractedPct) * base * periods. Recoverable cash; annualize.

**Inputs needed:**
- contract PEPM rate or fee % and base definition
- authoritative count source (HRIS roster) or contractual base
- invoice fee line, implied count, and computed rate

**Leverage:** 'You billed PEPM on 640 employees; our HRIS shows 600' or 'you computed 15% of ad spend against a contracted 12%' are arithmetic-clean credits, plus a go-forward correction and a roster-reconciliation cadence.

---

