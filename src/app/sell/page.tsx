import type { Metadata } from "next";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { Container, Eyebrow, Hairline, SectionIndex } from "@/components/ui/primitives";
import { VendorMark } from "@/components/dashboard/mark";
import { TemplateCard, type OutreachTemplate } from "@/components/sell/template-card";
import gtm from "../../../docs/gtm-research.json";

export const metadata: Metadata = {
  title: "Who to sell RECOUP to — PE-backed prospect list & playbook",
};

/* ---- Local view types (the imported JSON is structurally typed/widened) ---- */
type Objection = { objection: string; rebuttal: string };
type Prospect = {
  company: string;
  companyNumber?: string;
  sector: string;
  size: string;
  peBacker: string;
  whyFit: string;
  buyerTitle: string;
  outreachAngle: string;
  source: string;
};

const ICP: string = gtm.gtm.icp;
const VALUE_PROPS: string[] = gtm.gtm.valueProps;
const OBJECTIONS: Objection[] = gtm.gtm.objections;
const TEMPLATES: OutreachTemplate[] = gtm.outreach_templates;
const PROSPECTS: Prospect[] = gtm.prospects;
const COMPANIES_HOUSE: string = gtm.companies_house;

const CH_BASE = "https://find-and-update.company-information.service.gov.uk/company/";

/* A value prop is "Headline — explanation"; split on the first em dash. */
function splitProp(p: string): { head: string; rest: string } {
  const i = p.indexOf("—");
  if (i === -1) return { head: p, rest: "" };
  return { head: p.slice(0, i).trim(), rest: p.slice(i + 1).trim() };
}

const peBackedCount = PROSPECTS.length; // every named prospect is PE-backed
const chCount = PROSPECTS.filter((p) => p.companyNumber).length;

export default function SellPage() {
  return (
    <main>
      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-forest text-cream">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 90% at 75% 0%, rgba(0,129,104,0.35), transparent 55%), radial-gradient(80% 60% at 8% 100%, rgba(22,39,31,0.9), transparent 60%)",
          }}
        />
        <Nav tone="dark" />
        <Container className="relative pb-20 pt-40 md:pb-28 md:pt-52">
          <div className="max-w-3xl">
            <Eyebrow className="text-gold">Internal · Go-to-market</Eyebrow>
            <h1 className="mt-6 font-display text-5xl leading-[1.04] tracking-tight md:text-7xl">
              Who to sell <span className="tracking-[0.12em]">RECOUP</span> to.
            </h1>
            <p className="mt-8 max-w-2xl font-body text-lg leading-relaxed text-cream/80 md:text-xl">
              The single best segment is{" "}
              <span className="text-cream">PE-backed mid-market portfolio companies and roll-ups</span>.
              They carry an explicit, time-boxed cost-out mandate, they are vendor-sprawl machines
              built by bolt-on acquisition, and the contingency model fits their no-upfront-spend
              posture exactly. The math closes it: on an{" "}
              <span className="text-cream">8.4x median EBITDA multiple, a recurring £1 of cost removed
              is worth ~£8 at exit</span> — so a 30% / 20% fee is trivial against enterprise value.
            </p>
            <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-cream/65">
              And the buyer is a channel. Win one portfolio CFO and the operating-partner team unlocks
              40–160 more companies with the identical problem.
            </p>
          </div>

          {/* Stat strip */}
          <div className="mt-14 grid grid-cols-2 gap-8 border-t border-cream/15 pt-10 md:grid-cols-4">
            {[
              { v: `${peBackedCount}`, l: "Named PE-backed prospects" },
              { v: "~8x", l: "Exit value per £1 saved" },
              { v: "7.59%", l: "CFO cold-email reply rate" },
              { v: "£0", l: "Upfront — contingency only" },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-display text-4xl tabular-nums text-cream md:text-5xl">{s.v}</div>
                <div className="mt-3 border-t border-gold/50 pt-2">
                  <span className="font-ui text-xs uppercase tracking-[0.12em] text-cream/70">
                    {s.l}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 2. The ICP + ranked value props */}
      <section className="bg-paper">
        <Container className="grid gap-12 py-24 md:grid-cols-12 md:py-32">
          <div className="md:col-span-5">
            <Eyebrow>The ICP</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              Who fits, and why they buy.
            </h2>
            <p className="mt-6 font-body text-base leading-relaxed text-ink-soft">{ICP}</p>
          </div>

          <div className="md:col-span-6 md:col-start-7">
            <Eyebrow>Ranked value props</Eyebrow>
            <ol className="mt-6 space-y-5">
              {VALUE_PROPS.map((p, i) => {
                const { head, rest } = splitProp(p);
                return (
                  <li key={i} className="flex gap-4">
                    <SectionIndex n={String(i + 1).padStart(2, "0")} />
                    <div className="border-b border-ink/10 pb-5">
                      <p className="font-display text-lg leading-snug text-forest">{head}</p>
                      {rest && (
                        <p className="mt-1.5 font-body text-sm leading-relaxed text-ink-soft">{rest}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Container>
      </section>

      {/* 3. Prospect target list */}
      <section id="prospects" className="bg-bone">
        <Container className="py-24 md:py-32">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <Eyebrow>The target list</Eyebrow>
              <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
                {PROSPECTS.length} named PE-backed prospects.
              </h2>
              <p className="mt-5 font-body text-base leading-relaxed text-ink-soft">
                Built top-down from Companies House and sponsor portfolio pages. Every name carries a
                live cost-out mandate — fresh carve-outs and active roll-ups where contracts are being
                re-baselined right now. {chCount} are linked to their verified Companies House record.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-forest/10 px-3 py-1.5 font-ui text-xs tracking-wide text-forest">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> PE-backed
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-sand/50 px-3 py-1.5 font-ui text-xs tracking-wide text-ink-soft">
                CH verified
              </span>
            </div>
          </div>

          {/* Desktop table */}
          <div className="mt-12 hidden overflow-hidden rounded-2xl border border-ink/10 bg-paper lg:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gold/40 bg-bone/60 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Sector &amp; size</th>
                  <th className="px-5 py-3 font-semibold">PE backer</th>
                  <th className="px-5 py-3 font-semibold">Buyer</th>
                  <th className="px-5 py-3 font-semibold">Outreach angle</th>
                </tr>
              </thead>
              <tbody>
                {PROSPECTS.map((p) => (
                  <tr key={p.company} className="border-b border-ink/5 align-top last:border-0 hover:bg-bone/30">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <VendorMark name={p.company} category={p.sector} size={34} />
                        <div className="min-w-0">
                          <div className="font-body text-ink">{p.company}</div>
                          {p.companyNumber ? (
                            <a
                              href={`${CH_BASE}${p.companyNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-ui text-xs tabular-nums text-emerald underline decoration-gold/50 underline-offset-2 hover:text-forest"
                            >
                              CH {p.companyNumber} ↗
                            </a>
                          ) : (
                            <span className="font-ui text-xs text-ink-soft/70">No CH number</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-ui text-sm text-ink">{p.sector}</div>
                      <div className="mt-0.5 font-body text-xs leading-snug text-ink-soft">{p.size}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-forest/8 px-2.5 py-1 font-ui text-xs text-forest">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />
                        {p.peBacker}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-ui text-sm text-ink-soft">{p.buyerTitle}</td>
                    <td className="px-5 py-4">
                      <p className="font-body text-sm leading-snug text-ink">{p.outreachAngle}</p>
                      <p className="mt-1.5 font-body text-xs leading-snug text-ink-soft">{p.whyFit}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:hidden">
            {PROSPECTS.map((p) => (
              <div key={p.company} className="rounded-2xl border border-ink/10 bg-paper p-5">
                <div className="flex items-start gap-3">
                  <VendorMark name={p.company} category={p.sector} size={36} />
                  <div className="min-w-0">
                    <div className="font-display text-lg leading-tight text-forest">{p.company}</div>
                    <div className="mt-0.5 font-ui text-xs text-ink-soft">{p.sector}</div>
                    {p.companyNumber && (
                      <a
                        href={`${CH_BASE}${p.companyNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-ui text-xs tabular-nums text-emerald underline decoration-gold/50 underline-offset-2"
                      >
                        CH {p.companyNumber} ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/8 px-2.5 py-1 font-ui text-xs text-forest">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                    {p.peBacker}
                  </span>
                  <span className="font-ui text-xs text-ink-soft">{p.buyerTitle}</span>
                </div>
                <p className="mt-3 font-body text-sm leading-snug text-ink">{p.size}</p>
                <Hairline className="my-3 opacity-60" />
                <p className="font-body text-sm leading-snug text-ink">
                  <span className="font-ui text-[11px] uppercase tracking-[0.1em] text-gold">Angle · </span>
                  {p.outreachAngle}
                </p>
                <p className="mt-2 font-body text-xs leading-snug text-ink-soft">{p.whyFit}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 4. Objection handling */}
      <section id="objections" className="bg-paper">
        <Container className="py-24 md:py-32">
          <div className="max-w-2xl">
            <Eyebrow>Objection handling</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              What they push back with — and the answer.
            </h2>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 md:grid-cols-2">
            {OBJECTIONS.map((o, i) => (
              <div key={i} className="bg-paper p-7 md:p-8">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-base tabular-nums text-gold/80">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-xl leading-snug text-forest">
                    &ldquo;{o.objection}&rdquo;
                  </h3>
                </div>
                <p className="mt-3 pl-9 font-body text-sm leading-relaxed text-ink-soft">{o.rebuttal}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 5. Outreach templates */}
      <section id="templates" className="bg-bone">
        <Container className="py-24 md:py-32">
          <div className="max-w-2xl">
            <Eyebrow>Outreach templates</Eyebrow>
            <h2 className="mt-5 font-display text-4xl leading-tight md:text-5xl">
              Copy, swap the brackets, send.
            </h2>
            <p className="mt-5 font-body text-base leading-relaxed text-ink-soft">
              One persona per sequence. Lead with numbers and a timeline hook (timeline hooks reply at
              10.16% vs 4.54% for problem hooks). The free first-look is the demo — make the ask small.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {TEMPLATES.map((t, i) => (
              <TemplateCard key={t.name} template={t} index={i} />
            ))}
          </div>
        </Container>
      </section>

      {/* 6. Companies House method footnote */}
      <section id="method" className="bg-forest text-cream">
        <Container className="py-20 md:py-28">
          <div className="max-w-3xl">
            <Eyebrow className="text-gold">How we built this list</Eyebrow>
            <h2 className="mt-5 font-display text-3xl leading-tight text-cream md:text-4xl">
              The Companies House method.
            </h2>
            <p className="mt-6 whitespace-pre-line font-body text-sm leading-relaxed text-cream/75">
              {COMPANIES_HOUSE}
            </p>
            <Hairline className="mt-10 border-cream/15" />
            <p className="mt-6 font-ui text-xs tracking-wide text-cream/50">
              Internal sales asset. Always verify current owner and the live CFO on the Companies House
              record before outreach — ownership shifts with secondaries.
            </p>
          </div>
        </Container>
      </section>

      <Footer />
    </main>
  );
}
