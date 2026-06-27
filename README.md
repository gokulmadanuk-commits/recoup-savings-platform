# RECOUP — Hidden Savings Recovery

**We read every vendor contract and twelve months of invoices, then find the money hiding inside them. Free unless we find you savings.**

RECOUP ingests a company's vendor contracts and 12+ months of invoices (PDF, Excel, Word), parses the tables and rate schedules buried inside hundreds of documents *without choking on a single bad file*, cross-references every invoice line against the contract that governs it, and produces a **ranked, dollar-quantified book of findings** — each tied to its source document, with the vendor email already drafted.

The engagement is contingency: **30% of realized cash recovery, 20% of validated run-rate avoidance, nothing unless savings land.**

---

## What it finds (14 forensic rules)

| | Rule | What it catches |
|---|---|---|
| R01 | Auto-renewal | Evergreen contracts renewing inside 90 days whose cancellation window is closing |
| R02 | Rate mismatch | Invoices billed above the contracted rate, month after month |
| R03 | Idle licences | Seats paid for that no one logs into (vs utilization export) |
| R04 | Price escalator | Uplifts above the contract cap (breach) or the market (challenge) |
| R05 | Overage | Punitive overage / out-of-scope hours above the included allowance |
| R06 | Duplicate billing | The same invoice paid twice (exact + fuzzy match) |
| R07 | Volume discount | Spend crossed a tier breakpoint that was never applied |
| R08 | Early-pay | Forfeited 2/10-net-30 discounts |
| R09 | Minimum commitment | Take-or-pay floors the buyer pays but doesn't consume |
| R10 | Tier downgrade | Premium plans whose tier-only features go unused |
| R11 | Zombie line | Decommissioned circuits / meters / returned units still billing |
| R12 | Overbilling | Holiday premiums on non-holidays, OT over schedule, accessorial leakage, unperformed seasonal work |
| R13 | Redundant tool | Two vendors billing for the same capability |
| R14 | Headcount fee | PEPM on a stale roster; %-of-spend at the wrong rate |

Full methodology, detection logic, and the negotiation email playbook are in [`docs/`](docs/).

## The sample portfolio

A synthetic mid-size logistics company, **Northwind Logistics Group** — 22 vendors, **302 generated documents** (229 PDF, 66 Excel, 7 Word), with **$479,275/yr** of planted savings (≈7% of $6.8M spend) across 25 findings. Every document is downloadable at `/documents`; the answer key lives in `public/seed/ground-truth.json`.

## Architecture

All-Node / TypeScript, deployable to Vercel.

```
src/lib/
  types.ts            canonical zod model (contracts, invoices, usage, findings)
  money.ts dates.ts   integer-cent money + ISO date helpers
  config.ts cpi.ts    version-pinned thresholds + CPI benchmark
  docmodel/           lossless canonical <-> DocModel layout contract
  render/{pdf,excel,word}.ts    generate realistic documents
  parsing/{pdf,excel,word}.ts   parse them back (pdfjs positional tables, exceljs, mammoth)
  parsing/index.ts    resilient batch dispatcher (allSettled + p-limit)
  rules/r01..r14.ts   the 14 detection rules + registry
  email/              vendor email drafting (playbook templates)
  analyze.ts          parse -> assemble -> detect -> draft -> summarize
src/app/              Next.js App Router (landing, /analyze, /documents, /api)
scripts/generate-seed.ts   renders the corpus + parses it back as a stress test
```

The seam between generation and parsing is a single format-agnostic `DocModel`; the canonical↔DocModel mapping is proven lossless by round-trip tests, so generators and parsers can't silently drift.

## Verification

Every layer ships with a check (207 tests across 45 files):

- **Layout contract** — canonical → DocModel → canonical is the identity (per vendor).
- **Formats** — `parse(render(doc))` reproduces fields + tables exactly (PDF/Excel/Word).
- **Corpus** — 302 documents render and parse back with **0 failures**.
- **Engine** — running all 14 rules over the parsed corpus reproduces **all 25 answer-key findings with zero false positives**, matching every dollar figure.

```bash
npm test            # 207 tests
npm run seed        # regenerate the corpus + re-run the parse->detect proof
npm run build       # production build
```

## Run locally

```bash
npm install
npm run seed        # generate public/seed/** (documents + manifest + analysis)
npm run dev         # http://localhost:3000
```

- `/` — the editorial landing page
- `/analyze` — load the sample portfolio or upload your own contracts + invoices
- `/documents` — browse and download the sample corpus

## Deploy (Vercel)

Standard Next.js 16 app; `vercel` (or the Vercel GitHub integration) builds it as-is. The generated corpus under `public/seed/` is committed, so no build-time generation is required.

---

_Editorial finance aesthetic: paper ivory + deep forest green, Fraunces / Newsreader / Inter. All figures shown are from a synthetic sample portfolio._
