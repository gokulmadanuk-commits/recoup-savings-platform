import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { Container, Button, Eyebrow, Card, Stat, Hairline, SectionIndex } from "@/components/ui/primitives";

const METHOD = [
  {
    n: "01",
    title: "Read everything",
    body: "Upload your vendor contracts and twelve months of invoices — PDF, Excel, Word. We parse the tables, rate cards and schedules buried inside hundreds of documents without choking on a single bad file.",
  },
  {
    n: "02",
    title: "Cross-reference",
    body: "Every invoice line is matched back to the contract that governs it. Rates, seat counts, escalators, renewal dates, minimum commitments — reconciled across the whole portfolio.",
  },
  {
    n: "03",
    title: "Quantify & rank",
    body: "Fourteen forensic rules surface auto-renewals, off-contract rates, idle seats, aggressive escalators, duplicates and zombie line items — each one annualized to the dollar and ranked by what it's worth.",
  },
  {
    n: "04",
    title: "Hand you the leverage",
    body: "For the top findings we draft the exact email to the vendor — the clause, the benchmark, and the precise number to ask for. You send it. We bill only on what lands.",
  },
];

const CATEGORIES = [
  { t: "Auto-renewals", d: "Evergreen contracts renewing inside 90 days whose cancellation window is about to close — or already has." },
  { t: "Off-contract rates", d: "Invoices billed above the rate you actually signed, month after month, recoverable as a credit." },
  { t: "Idle licences", d: "Seats you pay for that no one has logged into — quantified against real utilization data." },
  { t: "Price escalators", d: "Annual uplifts ratcheting above your contract cap or the market, challengeable at renewal." },
  { t: "Duplicate & zombie billing", d: "The same charge paid twice; circuits, meters and units billing long after they were retired." },
  { t: "Overage & overbilling", d: "Punitive overage, misapplied holiday premiums, accessorial leakage, headcount drift on per-employee fees." },
];

export default function Home() {
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
            <Eyebrow className="text-gold">Contract &amp; Payables Recovery</Eyebrow>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight md:text-7xl">
              The contracts no one has read since signing are quietly{" "}
              <span className="italic text-cream/95">overcharging</span> you.
            </h1>
            <p className="mt-8 max-w-2xl font-body text-lg leading-relaxed text-cream/80 md:text-xl">
              Auto-renewals firing in ninety days. Invoices drifting above your rate
              card. Seats you pay for and no one uses. We read every table and
              schedule across your vendors and rank what you can claw back — to the
              dollar.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button href="/dashboard" newTab variant="cream">
                See it in action
              </Button>
            </div>
            <p className="mt-6 font-ui text-sm tracking-wide text-cream/60">
              Free unless we find you money. We take a share only of what actually lands.
            </p>
          </div>
        </Container>

        {/* Stat strip */}
        <div className="relative border-t border-cream/15">
          <Container className="grid grid-cols-2 gap-8 py-10 md:grid-cols-4">
            <Stat tone="cream" value="$487K" label="Identified in the sample" />
            <Stat tone="cream" value="22" label="Vendors reconciled" />
            <Stat tone="cream" value="312" label="Documents read" />
            <Stat tone="cream" value="7.2%" label="Of annual spend" />
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
            <p className="font-body text-lg leading-relaxed text-ink-soft">
              Mid-market companies lose an estimated five to ten percent of profit to
              vendor overbilling and procurement drift — none of it exotic fraud,
              just promo rates that reverted to list, escalators compounding above
              CPI, and renewals that closed the negotiation window.
            </p>
            <p className="mt-5 font-body text-lg leading-relaxed text-ink-soft">
              RECOUP works on contingency. There is no fee to read your portfolio.
              We take <span className="text-ink">30% of cash we recover</span> and{" "}
              <span className="text-ink">20% of run-rate savings</span> we lock in —
              and we bill only on dollars that actually post.
            </p>
            <div className="mt-8">
              <Hairline className="mb-6" />
              <Button href="/dashboard" newTab>See it in action</Button>
            </div>
          </div>
        </Container>
      </section>

      {/* Method */}
      <section id="method" className="bg-bone">
        <Container className="py-24 md:py-32">
          <div className="max-w-2xl">
            <Eyebrow>The method</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              From a pile of PDFs to a ranked book of claims.
            </h2>
          </div>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 md:grid-cols-2">
            {METHOD.map((m) => (
              <div key={m.n} className="bg-paper p-8 md:p-10">
                <div className="flex items-baseline gap-4">
                  <SectionIndex n={m.n} />
                  <h3 className="font-display text-2xl text-forest">{m.title}</h3>
                </div>
                <p className="mt-4 font-body text-ink-soft">{m.body}</p>
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
              The money hides in the tables nobody reads.
            </h2>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {CATEGORIES.map((c) => (
              <div
                key={c.t}
                className="rounded-2xl border border-cream/15 bg-pine/40 p-7 transition-colors duration-300 hover:border-gold/50"
              >
                <h3 className="font-display text-xl text-cream">{c.t}</h3>
                <hr className="my-4 border-0 border-t border-gold/30" />
                <p className="font-body text-cream/75">{c.d}</p>
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
            See what your last twelve months are hiding.
          </h2>
          <p className="mx-auto mt-6 max-w-xl font-body text-lg text-ink-soft">
            Load the sample portfolio, or bring your own contracts and invoices.
            Findings appear immediately, ranked by what they're worth.
          </p>
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
