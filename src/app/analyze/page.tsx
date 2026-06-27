import type { Metadata } from "next";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { Workbench } from "@/components/app/workbench";

export const metadata: Metadata = {
  title: "Analyze a portfolio — RECOUP",
};

export default function AnalyzePage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="relative overflow-hidden bg-forest text-cream">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(100% 80% at 80% 0%, rgba(0,129,104,0.3), transparent 55%)",
          }}
        />
        <Nav tone="dark" />
        <Container className="relative pb-16 pt-32 md:pt-40">
          <Eyebrow className="text-gold">The workbench</Eyebrow>
          <h1 className="mt-4 font-display text-5xl tracking-tight md:text-6xl">
            Find the savings.
          </h1>
          <p className="mt-5 max-w-2xl font-body text-lg text-cream/80">
            Point RECOUP at a portfolio of contracts and invoices. It reads every table and schedule,
            cross-references them, and ranks what you can claw back — with the vendor email already
            drafted.
          </p>
        </Container>
      </div>

      <Container className="py-16 md:py-20">
        <Workbench />
      </Container>

      <Footer />
    </main>
  );
}
