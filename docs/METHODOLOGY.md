# Contract & Payables Savings Platform — Methodology

## 1. The Opportunity and Our Thesis

Mid-market companies systematically overpay vendors. Across the three adjacent industries that already monetize this — SaaS spend optimization, accounts-payable / profit-recovery audit, and telecom/utility expense management (TEM) — the pattern is consistent: organizations lose **5–10% of profit** to procurement and payment errors, a standard AP recovery audit returns on the order of **$1M per $1B of supplier spend**, the average company **overpays ~30%** versus market on SaaS, **30–53% of software licenses go unused**, and Gartner-cited figures put **~80% of telecom bills** in error. None of this is exotic fraud; it is drift — promo rates that reverted to list, seats provisioned and forgotten, escalators compounding above CPI, auto-renewals that closed the negotiation window, duplicate payments across channels, and minimum commitments nobody right-sized.

Our platform ingests a company's contracts and twelve-plus months of invoices, normalizes them into a canonical data model, runs a deterministic battery of detection rules against that model, and produces a ranked book of findings — each one tied to a source document, with the dollar figure and the negotiation lever pre-computed. We then draft the vendor-facing recovery or renegotiation email. We charge nothing up front and take a percentage only of money that actually lands.

## 2. Two Kinds of Savings, and Why the Distinction Governs Everything

CFOs treat two categories of "savings" very differently, and our commercial model is built on the distinction:

- **Recovery (hard cash).** Money already spent that comes back as a refund or credit memo with a vendor's name on it — duplicate payments, billed-above-contract overcharges, missed credits, misapplied overage, escalators above a contractual cap. This is auditable and bankable, and it is what makes contingency selling easy.
- **Avoidance / cost reduction (soft savings).** Money you *would* have spent at the old run-rate but won't — a killed auto-renewal, a right-sized seat count, a capped escalator, a lowered minimum commitment. Real, but baseline-dependent and easier for a vendor (or a skeptical CFO) to dispute.

The credibility ladder a CFO applies, in priority order: (1) cash beats avoidance; (2) vendor-validated beats self-asserted; (3) traceable to a specific invoice/PO/clause beats a model estimate; (4) an explicit, agreed baseline with a measurement window for any run-rate claim; (5) an auditable trail from finding → dispute → posted credit; (6) aligned incentives and near-zero downside to saying yes. Every architectural decision below serves this ladder.

## 3. How Each Savings Category Is Detected and Quantified

We ship a deterministic rule engine — defined inputs → comparison → trigger → savings formula — with all money handled as integer cents (`bigint`) or `decimal.js`, never floats, so cumulative overcharges don't drift. Every threshold (tolerance, activity window, fair-margin %, fuzzy-match cutoff) is a named, version-pinned config value, so findings are reproducible and auditable.

The rules cluster into the credibility tiers above:

**Hard recovery (strongest, bill on posted cash):**
- **Invoice rate mismatch** — invoiced unit price exceeds the contracted rate-card price for that SKU/period. The repeat nature ("billed $X above contract for seven consecutive months") makes it near-incontestable and demands a credit memo for the back period plus a forward fix.
- **Duplicate / double billing** — exact match (vendor + invoice number + amount) catches only 30–40% of duplicates; we layer fuzzy matching (entity normalization, ±0.5% amount, ±7 days, ≥0.85 invoice-number similarity) and same-period recurring-charge detection. Low-controversy, fast, establishes credibility.
- **Price escalators above cap** — when the applied year-over-year uplift exceeds the contract's own cap, that's a straightforward breach and refund.
- **Misapplied overage / wrong-tier rates** and **missed volume discounts** — usage charged above a bundled allowance that wasn't breached, or a crossed volume tier that kept billing the higher rate; both yield retroactive credits.

**Avoidance / run-rate (bill on a defined window against an agreed baseline):**
- **Auto-renewal window** — a daily sliding-window job flags contracts auto-renewing within 90 days whose cancellation-notice deadline is imminent or passed. The "savings" is the optionality preserved; we surface the full annual renewal value as "$ at risk if you miss the window."
- **Unused seats / idle licenses** — paid seats minus seats with genuine recent activity (30-day default; 60/90-day exposed as conservative variants). Requires a third data source: a per-user activity export from the admin console / SSO / IdP.
- **Tier downgrade / right-sizing** — active seats paying for a premium tier whose tier-exclusive features show zero adoption.
- **Minimum commitments not met** — a take-or-pay floor the buyer pays but doesn't consume; in-term often unrecoverable, so the saving is realized by right-sizing at renewal.
- **Above-market escalators** that are contract-compliant but exceed the 3–5% fair band (SaaS hit ~12% in 2026 vs ~3% CPI) — these *create* the renewal ask for a hard cap.

**Process recovery:** **missed early-pay discounts** (a forfeited 2/10 net 30 discount ≈ borrowing at ~36% APR) — quantified retrospectively and prospectively.

Every rule depending on the shared line-matcher (rate mismatch, overage, volume discount) records a `matchConfidence`; only matches above threshold auto-assert a savings claim, the rest queue for human review. This protects against false overcharge claims from a bad SKU match. Each rule emits an **evidence bundle**: the exact contract clause / rate-card row, the invoice line(s), the computed expected value, the delta, and the formula used. That bundle *is* the negotiation artifact and the refund-demand exhibit.

## 4. The Canonical Data Model and Annualization

All rules read from a normalized TypeScript model, never raw documents: `ContractTerm` (term, auto-renew, notice window, early-term fee), `RateCardLine` (SKU, UoM, contracted unit price, tier bounds, effective dates), `CommitmentTerm` (minimum commit, included allowance, overage price), `EscalatorTerm` (fixed / CPI / CPI-plus / greater-of, cap, anniversary), `PaymentTerm` (net days, discount), `InvoiceLine`, and `UsageRecord` (per-seat last-active). A shared `annualize(amountPerPeriod, period)` helper makes every rule's output a comparable yearly figure. CPI benchmarking pulls the BLS CPI-U series and stores the exact value used with each finding for auditability.

## 5. The Contingency Commercial Model

We sell "free unless we find you money." Fees attach to **realized dollars, not identified amounts** — the single biggest source of contingency disputes is billing on findings that never get collected. Following the established performance-based band and the recovery-vs-avoidance split, we charge:

- **30% of realized recovery** — refunds and credit memos that post against specific historical invoices. Posted credits provide the simplest performance verification; this is the gold standard and we bill only the cash that actually lands.
- **20% of validated avoidance / run-rate savings** — the lower rate reflects that avoidance is softer and harder to validate. Each avoidance claim requires an explicit baseline (the documented "before" rate), a fixed measurement window (e.g., 24 months), and adjustment rules if the client's operations change materially.

This sits squarely in the documented range (AP/profit recovery 20–30%; utility/TEM commonly split 30% recoveries / 20% avoidance). Validation chain: each finding ships with invoice references, rationale, calculations, and correspondence; a recovery tracker follows each claim from submission to posted credit; claims are validated directly with the supplier (credit memo or direct payment) and reconciled to the client's ledger before they count. Mature firms cite ~98% vendor-upheld rates as proof the numbers are disciplined, not aggressive — a metric we track and report.

Standard objections and our rebuttals: *"We self-audit"* — external firms find what internal teams structurally can't (cross-channel duplicates, supplier-held statement credits, pricing drift) using benchmark data at scale; recovery audit is the second pass after controls, not a replacement. *"This damages vendor relationships"* — findings are presented with full documentation and collaborative dispute resolution; clean resolution of payment errors strengthens supplier trust. *"You'll claim savings we'd have gotten anyway"* — answered by tight baselines, vendor sign-off, and billing only on posted cash. *"The % is high"* — it is a share of found money that was otherwise lost; engagement ROI routinely exceeds 300%.

## 6. The Parsing Pipeline

The hard engineering problem is reading tables and rate schedules out of hundreds of heterogeneous documents without one bad file killing the batch. Our all-Node/TypeScript toolchain:

- **PDF (positional/tables):** `pdfjs-dist` `getTextContent`, which is the only library exposing per-glyph-run x/y and font size. We reconstruct tables by clustering runs into rows (dynamic y-tolerance derived from median glyph height, *not* hard-coded constants) then clustering x-starts globally into columns so sparse rows still land correctly. Critical gotcha: PDF origin is bottom-left, so sort by descending y for top-to-bottom. For serverless (Vercel) we use **`unpdf`**, a self-contained pdf.js v5 build with the worker embedded, reaching the same `getTextContent` items via `getResolvedPDFJS()`.
- **Excel:** `exceljs` (typed cells, ~6× less memory than SheetJS, streaming `WorkbookReader` for large files), with a header-detection heuristic that scores candidate rows rather than assuming row 1. SheetJS is the fallback for `.xls`/`.ods`/CSV.
- **Word:** `mammoth` `.docx`→HTML (emits `<thead>`, preserves merged cells), then a DOM walk via `node-html-parser`.
- **Normalization:** schema-first with `zod`; each parser emits raw fields, a normalizer coerces and assigns a per-field confidence (0–1) from source quality (typed Excel cell > tagged-PDF cell > clustered-PDF cell > regex), schema-validation success, cross-checks (do line amounts sum to the stated total?), and parser warnings. Documents below threshold route to a human-review queue.

**Surviving the batch:** `await loadingTask.destroy()` after every PDF and `page.cleanup()` per page (the #1 cause of unbounded heap growth), concurrency bounded with `p-limit` (4–8), `Promise.allSettled` so one rejected doc never aborts the run, and PDF parsing isolated in a `worker_threads` pool so the rare uncatchable pdf.js crash kills a worker, not the job. We avoid `pdf2json` (memory leaks, uncatchable errors). For test fixtures we generate **tagged** PDFs with PDFKit ≥0.15.0 (correct ToUnicode map, `Table`/`TR`/`TH`/`TD` structure, embedded subsettable fonts) and round-trip self-test: generate → extract → assert reconstructed cells equal source. We never rasterize tables to images.

## 7. End-to-End Platform Methodology

The pipeline runs: **ingest** (queued, concurrency-bounded, worker-isolated) → **detect type and route** (PDF / Excel / Word, flag image-only PDFs as `needs_ocr`) → **raw parse** → **normalize** to the Zod canonical schema with per-field confidence → **batch report** (`ok | partial | failed`, low-confidence fields surfaced) → **rule engine** (rate-mismatch / duplicate / overage / volume-discount fire on each new-invoice ingest; auto-renewal and prospective early-pay run daily on sliding windows; seat/tier/escalator/commitment run monthly and on-demand at renewal-prep) → **findings book** (each with evidence bundle, annualized dollar figure, recovery-vs-avoidance classification, and negotiation lever) → **email drafter** (selects the category template, injects deal-specific numbers, attaches the evidence, sets a ~10-business-day deadline) → **recovery tracker** (finding → dispute → posted credit, tied to the GL) → **billing** on realized dollars at 30% recovery / 20% avoidance.

The product surface is an editorial, finance-grade web platform — ivory paper ground, deep forest green, serif display type — deliberately *not* a white-and-blue SaaS dashboard, signaling private-markets institutional authority. Findings read like a printed prospectus: numbers in tabular figures, hairline rules, generous whitespace, each claim defensible to the dollar. The whole system is engineered so that when a CFO asks "prove it," every answer is one click from the source invoice.
