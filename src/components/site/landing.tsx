"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Footer } from "@/components/site/footer";
import { Container, Button, Eyebrow, Stat, Hairline, SectionIndex } from "@/components/ui/primitives";

/* ------------------------------------------------------------------ */
/* Two products, one ledger. The floating toggle swaps the whole page  */
/* and FLIPS the palette: Revenue Leakage is green-dominant (dark      */
/* forest ground, light type), Cost Reduction inverts to paper-        */
/* dominant (light ground, forest-green type). Both stay editorial.    */
/* ------------------------------------------------------------------ */

type Mode = "revenue" | "cost";

interface Accent {
  /* toggle + top bar */
  indicator: string;
  bar: string;
  /* hero ground/type */
  heroBg: string;
  heroGlow: string;
  heroText: string;
  heroSub: string;
  heroFee: string;
  heroEyebrow: string;
  heroEmph: string;
  /* top header (wordmark + cta) */
  headerText: string;
  headerCta: string;
  heroBtn: "cream" | "forest";
  /* stat strip */
  statTone: "ink" | "cream";
  statBorder: string;
  /* light mid-sections */
  eyebrowLight: string;
  rule: string;
  /* "what we find" ground/cards */
  findBg: string;
  findText: string;
  findHeadText: string;
  findEyebrow: string;
  findCard: string;
  findCardTitle: string;
  findCardBody: string;
  findRule: string;
  findHover: string;
}

interface ModeContent {
  name: string;
  dashHref: string;
  accent: Accent;
  hero: { eyebrow: string; pre: string; emph: string; post: string; sub: string; fee: string };
  stats: { value: string; label: string }[];
  pitch: { eyebrow: string; body1: React.ReactNode; body2: React.ReactNode };
  method: { headline: string; steps: { n: string; title: string; body: string }[] };
  find: { eyebrow: string; headline: string; items: { t: string; d: string }[] };
  closing: { eyebrow: string; headline: string; sub: string };
}

const MODES: Record<Mode, ModeContent> = {
  revenue: {
    name: "Revenue Leakage",
    dashHref: "/dashboard",
    accent: {
      indicator: "bg-emerald",
      bar: "bg-emerald",
      // Green-dominant: dark forest ground, light type.
      heroBg: "bg-forest",
      heroGlow:
        "radial-gradient(120% 90% at 70% 0%, rgba(0,129,104,0.45), transparent 55%), radial-gradient(80% 60% at 10% 100%, rgba(22,39,31,0.92), transparent 60%)",
      heroText: "text-cream",
      heroSub: "text-cream/80",
      heroFee: "text-cream/60",
      heroEyebrow: "text-gold",
      heroEmph: "text-cream/95",
      headerText: "text-cream",
      headerCta: "bg-cream text-forest hover:bg-white",
      heroBtn: "cream",
      statTone: "cream",
      statBorder: "border-cream/15",
      eyebrowLight: "text-emerald",
      rule: "border-emerald/35",
      findBg: "bg-forest",
      findText: "text-cream",
      findHeadText: "text-cream",
      findEyebrow: "text-gold",
      findCard: "border-cream/15 bg-pine/40",
      findCardTitle: "text-cream",
      findCardBody: "text-cream/75",
      findRule: "border-gold/30",
      findHover: "hover:border-emerald/60",
    },
    hero: {
      eyebrow: "Contract & Receivables Recovery",
      pre: "The contracts no one has read since signing are quietly ",
      emph: "underbilling",
      post: " your customers.",
      sub: "RPI escalators never applied. Intro discounts that never expired. Customers who quietly blew past their tier. We read every contract and billing export and rank what your customers owe you — to the dollar, with the clause to cite.",
      fee: "Free unless we find you revenue. We take a share only of what actually lands.",
    },
    stats: [
      { value: "$1.28M", label: "Recoverable in the sample" },
      { value: "19", label: "Customers reconciled" },
      { value: "261", label: "Documents read" },
      { value: "$3.8M", label: "Enterprise value at 8×" },
    ],
    pitch: {
      eyebrow: "The engagement",
      body1: (
        <>
          Most B2B sellers leak two to four percent of revenue — none of it exotic
          fraud, just escalators that never got applied, promo prices that never
          reverted, tiers that were never re-rated, and surcharges that never made
          it onto an invoice.
        </>
      ),
      body2: (
        <>
          RECOUP works on contingency. There is no fee to read your contracts. We
          take <span className="text-ink">30% of arrears we recover</span> and{" "}
          <span className="text-ink">20% of the run-rate uplift</span> we lock in —
          and because recovered revenue is near-100% margin, it flows straight to
          EBITDA and is capitalised at your exit multiple.
        </>
      ),
    },
    method: {
      headline: "From a pile of contracts to a ranked book of claims.",
      steps: [
        { n: "01", title: "Read everything", body: "Upload your customer contracts and twelve months of billing exports — PDF, Excel, Word. We parse the rate cards, escalator clauses and tier schedules buried inside hundreds of documents without choking on a single bad file." },
        { n: "02", title: "Reconcile the terms", body: "Every billed line is matched back to the contract that governs it. Escalators, tier thresholds, minimums, discount expiries, surcharges and renewals — checked against what you actually invoiced." },
        { n: "03", title: "Quantify & grade", body: "Eleven forensic rules surface escalators never applied, expired discounts still live, tier breaches, unbilled overage and missing surcharges — each as arrears to date plus forward run-rate uplift, ranked by worth and graded by relationship risk." },
        { n: "04", title: "Hand you the action", body: "For the top findings we draft the corrected invoice or the price-increase notice — the clause, the number, and the tone matched to the relationship. You send it. We bill only on what lands." },
      ],
    },
    find: {
      eyebrow: "What we find",
      headline: "The money hides in the terms nobody re-checks.",
      items: [
        { t: "Escalators never applied", d: "RPI/CPI uplifts your contract entitles you to that were never billed — recoverable as arrears plus a permanent run-rate increase." },
        { t: "Expired discounts still live", d: "Introductory and promotional discounts that should have ended but keep coming off every invoice." },
        { t: "Tier & volume breaches", d: "Customers who blew past the volume that triggers a higher rate, still billed at the lower tier." },
        { t: "Unbilled usage & surcharges", d: "Overage above the included allowance, and contractual fuel and index surcharges that never reached an invoice." },
        { t: "Unbilled & under-billed work", d: "Services delivered but never invoiced; renewals repriced at the old rate; minimum commitments never trued-up." },
        { t: "Collections, prioritised", d: "Open AR ranked by how likely it is to actually collect — so your team works the most recoverable first, not merely the oldest." },
      ],
    },
    closing: {
      eyebrow: "No find, no fee",
      headline: "See what your customers aren't paying you.",
      sub: "Load the sample book, or bring your own contracts and billing export. Findings appear immediately, ranked by what they're worth and graded by how to ask.",
    },
  },
  cost: {
    name: "Cost Reduction",
    dashHref: "/dashboard?view=cost",
    accent: {
      indicator: "bg-gold",
      bar: "bg-gold",
      // Paper-dominant: light ground, forest-green type (the flip).
      heroBg: "bg-bone",
      heroGlow:
        "radial-gradient(110% 80% at 75% 0%, rgba(176,141,69,0.22), transparent 55%), radial-gradient(75% 60% at 6% 100%, rgba(46,125,91,0.12), transparent 60%)",
      heroText: "text-forest",
      heroSub: "text-ink-soft",
      heroFee: "text-ink-soft",
      heroEyebrow: "text-emerald",
      heroEmph: "text-emerald",
      headerText: "text-forest",
      headerCta: "bg-forest text-cream hover:bg-pine",
      heroBtn: "forest",
      statTone: "ink",
      statBorder: "border-ink/10",
      eyebrowLight: "text-[#8a6d2f]",
      rule: "border-gold/40",
      findBg: "bg-bone",
      findText: "text-ink",
      findHeadText: "text-forest",
      findEyebrow: "text-[#8a6d2f]",
      findCard: "border-ink/10 bg-paper",
      findCardTitle: "text-forest",
      findCardBody: "text-ink-soft",
      findRule: "border-gold/40",
      findHover: "hover:border-gold/60 hover:shadow-[0_8px_30px_rgba(31,58,46,0.06)]",
    },
    hero: {
      eyebrow: "Contract & Payables Recovery",
      pre: "The contracts no one has read since signing are quietly ",
      emph: "overcharging",
      post: " you.",
      sub: "Auto-renewals firing in ninety days. Invoices drifting above your rate card. Seats you pay for and no one uses. We read every table and schedule across your vendors and rank what you can claw back — to the dollar.",
      fee: "Free unless we find you money. We take a share only of what actually lands.",
    },
    stats: [
      { value: "$487K", label: "Identified in the sample" },
      { value: "22", label: "Vendors reconciled" },
      { value: "312", label: "Documents read" },
      { value: "7.2%", label: "Of annual spend" },
    ],
    pitch: {
      eyebrow: "The engagement",
      body1: (
        <>
          Mid-market companies lose an estimated five to ten percent of profit to
          vendor overbilling and procurement drift — none of it exotic fraud, just
          promo rates that reverted to list, escalators compounding above CPI, and
          renewals that closed the negotiation window.
        </>
      ),
      body2: (
        <>
          RECOUP works on contingency. There is no fee to read your portfolio. We
          take <span className="text-ink">30% of cash we recover</span> and{" "}
          <span className="text-ink">20% of run-rate savings</span> we lock in — and
          we bill only on dollars that actually post.
        </>
      ),
    },
    method: {
      headline: "From a pile of PDFs to a ranked book of claims.",
      steps: [
        { n: "01", title: "Read everything", body: "Upload your vendor contracts and twelve months of invoices — PDF, Excel, Word. We parse the tables, rate cards and schedules buried inside hundreds of documents without choking on a single bad file." },
        { n: "02", title: "Cross-reference", body: "Every invoice line is matched back to the contract that governs it. Rates, seat counts, escalators, renewal dates, minimum commitments — reconciled across the whole portfolio." },
        { n: "03", title: "Quantify & rank", body: "Fourteen forensic rules surface auto-renewals, off-contract rates, idle seats, aggressive escalators, duplicates and zombie line items — each one annualized to the dollar and ranked by what it's worth." },
        { n: "04", title: "Hand you the leverage", body: "For the top findings we draft the exact email to the vendor — the clause, the benchmark, and the precise number to ask for. You send it. We bill only on what lands." },
      ],
    },
    find: {
      eyebrow: "What we find",
      headline: "The money hides in the tables nobody reads.",
      items: [
        { t: "Auto-renewals", d: "Evergreen contracts renewing inside 90 days whose cancellation window is about to close — or already has." },
        { t: "Off-contract rates", d: "Invoices billed above the rate you actually signed, month after month, recoverable as a credit." },
        { t: "Idle licences", d: "Seats you pay for that no one has logged into — quantified against real utilization data." },
        { t: "Price escalators", d: "Annual uplifts ratcheting above your contract cap or the market, challengeable at renewal." },
        { t: "Duplicate & zombie billing", d: "The same charge paid twice; circuits, meters and units billing long after they were retired." },
        { t: "Overage & overbilling", d: "Punitive overage, misapplied holiday premiums, accessorial leakage, headcount drift on per-employee fees." },
      ],
    },
    closing: {
      eyebrow: "No find, no fee",
      headline: "See what your last twelve months are hiding.",
      sub: "Load the sample portfolio, or bring your own contracts and invoices. Findings appear immediately, ranked by what they're worth.",
    },
  },
};

/* ------------------------------------------------------------------ */
/* The floating product toggle                                         */
/* ------------------------------------------------------------------ */

function ProductToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const a = MODES[mode].accent;
  return (
    <div className="fixed left-1/2 top-[4.5rem] z-[60] -translate-x-1/2 px-3 sm:top-3">
      <div className="relative flex rounded-full border border-ink/10 bg-paper/85 p-1 shadow-[0_10px_40px_rgba(22,39,31,0.18)] backdrop-blur">
        <span
          aria-hidden
          className={clsx(
            "absolute inset-y-1 left-1 w-[9rem] rounded-full transition-all duration-300 ease-out sm:w-[10rem]",
            a.indicator,
          )}
          style={{ transform: mode === "cost" ? "translateX(100%)" : "translateX(0)" }}
        />
        {(["revenue", "cost"] as const).map((mm) => (
          <button
            key={mm}
            type="button"
            onClick={() => onChange(mm)}
            aria-pressed={mode === mm}
            className={clsx(
              "relative z-10 w-[9rem] rounded-full px-3 py-2 text-center font-ui text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors duration-200 sm:w-[10rem] sm:text-[13px]",
              mode === mm
                ? mm === "revenue"
                  ? "text-cream"
                  : "text-pine"
                : "text-ink-soft hover:text-ink",
            )}
          >
            {mm === "revenue" ? "Revenue Leakage" : "Cost Reduction"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing                                                             */
/* ------------------------------------------------------------------ */

export function Landing() {
  const [mode, setMode] = useState<Mode>("revenue");
  const m = MODES[mode];
  const a = m.accent;

  return (
    <main>
      {/* Mode color bar pinned to the very top */}
      <div className={clsx("fixed inset-x-0 top-0 z-[55] h-1 transition-colors duration-300", a.bar)} aria-hidden />
      <ProductToggle mode={mode} onChange={setMode} />

      {/* Hero — ground/type flips between products */}
      <section className={clsx("relative overflow-hidden transition-colors duration-500", a.heroBg)}>
        <div className="pointer-events-none absolute inset-0 opacity-80 transition-[background] duration-500" style={{ background: a.heroGlow }} />

        {/* Top bar: wordmark + CTA (the toggle owns the centre) */}
        <header className={clsx("absolute inset-x-0 top-0 z-40", a.headerText)}>
          <Container className="flex items-center justify-between py-6">
            <Link href="/" className={clsx("font-display text-2xl tracking-[0.2em]", a.headerText)}>
              RECOUP
            </Link>
            <Link
              href={m.dashHref}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "group hidden items-center gap-2 rounded-full px-5 py-2.5 font-ui text-sm tracking-wide transition-all duration-300 md:inline-flex",
                a.headerCta,
              )}
            >
              See it in action
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
          </Container>
        </header>

        <Container className="relative pb-24 pt-44 md:pb-32 md:pt-52">
          <div className="max-w-3xl">
            <Eyebrow className={a.heroEyebrow}>{m.hero.eyebrow}</Eyebrow>
            <h1 className={clsx("mt-6 font-display text-5xl leading-[1.02] tracking-tight md:text-7xl", a.heroText)}>
              {m.hero.pre}
              <span className={clsx("italic", a.heroEmph)}>{m.hero.emph}</span>
              {m.hero.post}
            </h1>
            <p className={clsx("mt-8 max-w-2xl font-body text-lg leading-relaxed md:text-xl", a.heroSub)}>
              {m.hero.sub}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button href={m.dashHref} newTab variant={a.heroBtn}>
                See it in action
              </Button>
            </div>
            <p className={clsx("mt-6 font-ui text-sm tracking-wide", a.heroFee)}>{m.hero.fee}</p>
          </div>
        </Container>

        {/* Stat strip */}
        <div className={clsx("relative border-t", a.statBorder)}>
          <Container className="grid grid-cols-2 gap-8 py-10 md:grid-cols-4">
            {m.stats.map((sstat) => (
              <Stat key={sstat.label} tone={a.statTone} value={sstat.value} label={sstat.label} />
            ))}
          </Container>
        </div>
      </section>

      {/* Pitch */}
      <section className="bg-paper">
        <Container className="grid gap-12 py-24 md:grid-cols-12 md:py-32">
          <div className="md:col-span-5">
            <Eyebrow className={a.eyebrowLight}>{m.pitch.eyebrow}</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              We only get paid when <span className="italic">you</span> do.
            </h2>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <p className="font-body text-lg leading-relaxed text-ink-soft">{m.pitch.body1}</p>
            <p className="mt-5 font-body text-lg leading-relaxed text-ink-soft">{m.pitch.body2}</p>
            <div className="mt-8">
              <Hairline className={clsx("mb-6", a.rule)} />
              <Button href={m.dashHref} newTab>
                See it in action
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* Method */}
      <section id="method" className="bg-bone">
        <Container className="py-24 md:py-32">
          <div className="max-w-2xl">
            <Eyebrow className={a.eyebrowLight}>The method</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">{m.method.headline}</h2>
          </div>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 md:grid-cols-2">
            {m.method.steps.map((step) => (
              <div key={step.n} className="bg-paper p-8 md:p-10">
                <div className="flex items-baseline gap-4">
                  <SectionIndex n={step.n} />
                  <h3 className="font-display text-2xl text-forest">{step.title}</h3>
                </div>
                <p className="mt-4 font-body text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* What we find — ground/cards flip between products */}
      <section id="what-we-find" className={clsx("transition-colors duration-500", a.findBg, a.findText)}>
        <Container className="py-24 md:py-32">
          <div className="max-w-2xl">
            <Eyebrow className={a.findEyebrow}>{m.find.eyebrow}</Eyebrow>
            <h2 className={clsx("mt-5 font-display text-4xl leading-tight md:text-5xl", a.findHeadText)}>
              {m.find.headline}
            </h2>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {m.find.items.map((c) => (
              <div
                key={c.t}
                className={clsx("rounded-2xl border p-7 transition-all duration-300", a.findCard, a.findHover)}
              >
                <h3 className={clsx("font-display text-xl", a.findCardTitle)}>{c.t}</h3>
                <hr className={clsx("my-4 border-0 border-t", a.findRule)} />
                <p className={clsx("font-body", a.findCardBody)}>{c.d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Closing CTA */}
      <section className="bg-paper">
        <Container className="py-24 text-center md:py-32">
          <Eyebrow className={clsx("mx-auto", a.eyebrowLight)}>{m.closing.eyebrow}</Eyebrow>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl leading-tight md:text-6xl">
            {m.closing.headline}
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-body text-lg text-ink-soft">{m.closing.sub}</p>
          <div className="mt-10 flex justify-center">
            <Button href={m.dashHref} newTab variant="forest">
              See it in action
            </Button>
          </div>
        </Container>
      </section>

      <Footer />
    </main>
  );
}
