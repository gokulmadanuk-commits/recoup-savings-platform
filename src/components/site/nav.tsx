import Link from "next/link";
import { clsx } from "clsx";
import { Container } from "../ui/primitives";

/** Editorial top nav. `tone="dark"` sits over a forest hero (cream text). */
export function Nav({ tone = "dark" }: { tone?: "dark" | "paper" }) {
  const dark = tone === "dark";
  const text = dark ? "text-cream" : "text-ink";
  const link = clsx(
    "font-ui text-sm tracking-wide transition-colors",
    dark ? "text-cream/80 hover:text-cream" : "text-ink-soft hover:text-ink",
  );
  return (
    <header className={clsx("absolute inset-x-0 top-0 z-40", text)}>
      <Container className="flex items-center justify-between py-6">
        <Link
          href="/"
          className={clsx("font-display text-2xl tracking-[0.2em]", text)}
        >
          RECOUP
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#method" className={link}>
            The Method
          </Link>
          <Link href="/#what-we-find" className={link}>
            What We Find
          </Link>
        </nav>
        <Link
          href="/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-ui text-sm tracking-wide transition-all duration-300",
            dark
              ? "bg-cream text-forest hover:bg-white"
              : "bg-forest text-cream hover:bg-pine",
          )}
        >
          See it in action
          <span className="transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </Link>
      </Container>
    </header>
  );
}
