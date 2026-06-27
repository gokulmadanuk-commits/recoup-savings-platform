import Link from "next/link";
import { Container } from "../ui/primitives";

export function Footer() {
  return (
    <footer className="bg-pine text-cream">
      <Container className="py-16">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="max-w-sm">
            <div className="font-display text-2xl tracking-[0.2em]">RECOUP</div>
            <p className="mt-4 font-body text-cream/70">
              We read every vendor contract and twelve months of invoices, then
              find the money hiding inside them. Free unless we find you savings.
            </p>
          </div>
          <div className="flex gap-16">
            <div>
              <div className="eyebrow text-gold">Platform</div>
              <ul className="mt-4 space-y-2 font-ui text-sm text-cream/80">
                <li>
                  <Link href="/analyze" className="hover:text-cream">
                    Analyze a portfolio
                  </Link>
                </li>
                <li>
                  <Link href="/#method" className="hover:text-cream">
                    The method
                  </Link>
                </li>
                <li>
                  <Link href="/#what-we-find" className="hover:text-cream">
                    What we find
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="eyebrow text-gold">Engagement</div>
              <ul className="mt-4 space-y-2 font-ui text-sm text-cream/80">
                <li>30% of realized recovery</li>
                <li>20% of validated avoidance</li>
                <li>No find, no fee</li>
              </ul>
            </div>
          </div>
        </div>
        <hr className="my-10 border-0 border-t border-cream/15" />
        <div className="flex flex-col justify-between gap-2 font-ui text-xs text-cream/50 md:flex-row">
          <span>© {new Date().getFullYear()} RECOUP. A synthetic demonstration platform.</span>
          <span>Figures shown are from a synthetic sample portfolio.</span>
        </div>
      </Container>
    </footer>
  );
}
