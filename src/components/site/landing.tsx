import Link from "next/link";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { Container, Button, Eyebrow, Stat, Hairline, SectionIndex } from "@/components/ui/primitives";
import { PRODUCT, type Product } from "@/lib/product";

/* ------------------------------------------------------------------ */
/* Single-product landing. Two RECOUP products share this shell and    */
/* the same green editorial theme; only the copy differs by PRODUCT.    */
/* ------------------------------------------------------------------ */

interface Content {
  hero: { eyebrow: string; pre: string; emph: string; post: string; sub: string; fee: string };
  stats: { value: string; label: string }[];
  pitch: { body1: React.ReactNode; body2: React.ReactNode };
  method: { headline: string; steps: { n: string; title: string; body: string }[] };
  find: { headline: string; items: { t: string; d: string }[] };
  closing: { headline: string; sub: string };
}

const CONTENT: Record<Product, Content> = {
  revenue: {
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
      headline: "See what your customers aren't paying you.",
      sub: "Load the sample book, or bring your own contracts and billing export. Findings appear immediately, ranked by what they're worth and graded by how to ask.",
    },
  },
  cost: {
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
      headline: "See what your last twelve months are hiding.",
      sub: "Load the sample portfolio, or bring your own contracts and invoices. Findings appear immediately, ranked by what they're worth.",
    },
  },
};

export function Landing() {
  const c = CONTENT[PRODUCT];

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-forest text-cream">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 90% at 70% 0%, rgba(0,129,104,0.35), transparent 55%), radial-gradient(80% 60% at 10% 100%, rgba(22,39,31,0.9), transparent 60%)",
          }}
        />
        <Nav tone="dark" />
        <Container className="relative pb-24 pt-40 md:pb-32 md:pt-52">
          <div className="max-w-3xl">
            <Eyebrow className="text-gold">{c.hero.eyebrow}</Eyebrow>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight md:text-7xl">
              {c.hero.pre}
              <span className="italic text-cream/95">{c.hero.emph}</span>
              {c.hero.post}
            </h1>
            <p className="mt-8 max-w-2xl font-body text-lg leading-relaxed text-cream/80 md:text-xl">
              {c.hero.sub}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button href="/dashboard" newTab variant="cream">
                See it in action
              </Button>
            </div>
            <p className="mt-6 font-ui text-sm tracking-wide text-cream/60">{c.hero.fee}</p>
          </div>
        </Container>

        {/* Stat strip */}
        <div className="relative border-t border-cream/15">
          <Container className="grid grid-cols-2 gap-8 py-10 md:grid-cols-4">
            {c.stats.map((s) => (
              <Stat key={s.label} tone="cream" value={s.value} label={s.label} />
            ))}
          </Container>
        </div>
      </section>

      {/* Pitch */}
      <section className="bg-paper">
        <Container className="grid gap-12 py-24 md:grid-cols-12 md:py-32">
          <div className="md:col-span-5">
            <Eyebrow>The engagement</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              We only get paid when <span className="italic">you</span> do.
            </h2>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <p className="font-body text-lg leading-relaxed text-ink-soft">{c.pitch.body1}</p>
            <p className="mt-5 font-body text-lg leading-relaxed text-ink-soft">{c.pitch.body2}</p>
            <div className="mt-8">
              <Hairline className="mb-6" />
              <Button href="/dashboard" newTab>
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
            <Eyebrow>The method</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">{c.method.headline}</h2>
          </div>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 md:grid-cols-2">
            {c.method.steps.map((step) => (
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

      {/* What we find */}
      <section id="what-we-find" className="bg-forest text-cream">
        <Container className="py-24 md:py-32">
          <div className="max-w-2xl">
            <Eyebrow className="text-gold">What we find</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight text-cream md:text-5xl">
              {c.find.headline}
            </h2>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {c.find.items.map((item) => (
              <div
                key={item.t}
                className="rounded-2xl border border-cream/15 bg-pine/40 p-7 transition-colors duration-300 hover:border-gold/50"
              >
                <h3 className="font-display text-xl text-cream">{item.t}</h3>
                <hr className="my-4 border-0 border-t border-gold/30" />
                <p className="font-body text-cream/75">{item.d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Closing CTA */}
      <section className="bg-paper">
        <Container className="py-24 text-center md:py-32">
          <Eyebrow className="mx-auto">No find, no fee</Eyebrow>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl leading-tight md:text-6xl">
            {c.closing.headline}
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-body text-lg text-ink-soft">{c.closing.sub}</p>
          <div className="mt-10 flex justify-center">
            <Button href="/dashboard" newTab variant="forest">
              See it in action
            </Button>
          </div>
        </Container>
      </section>

      <Footer />
    </main>
  );
}
