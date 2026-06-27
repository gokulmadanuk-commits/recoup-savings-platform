import Link from "next/link";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/* Page container with editorial gutters. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mx-auto w-full max-w-7xl px-6 md:px-12 lg:px-20", className)}>
      {children}
    </div>
  );
}

/* Uppercase tracked kicker, emerald by default. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={clsx("eyebrow text-emerald", className)}>{children}</p>;
}

/* Oversized gold section index, e.g. "01". */
export function SectionIndex({ n }: { n: string }) {
  return (
    <span className="font-display text-2xl text-gold/80 tabular-nums">{n}</span>
  );
}

export function Hairline({ className }: { className?: string }) {
  return <hr className={clsx("border-0 border-t border-gold/40", className)} />;
}

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "cream" | "forest" | "ghost";
  className?: string;
  type?: "button" | "submit";
  arrow?: boolean;
};

/* Signature cream pill with a nudging arrow. */
export function Button({
  children,
  href,
  onClick,
  variant = "forest",
  className,
  type = "button",
  arrow = true,
}: ButtonProps) {
  const base =
    "group inline-flex items-center gap-2 rounded-full px-6 py-3 font-ui text-sm tracking-wide transition-all duration-300";
  const variants = {
    cream: "bg-cream text-forest hover:bg-white hover:shadow-[0_8px_30px_rgba(22,39,31,0.15)]",
    forest: "bg-forest text-cream hover:bg-pine",
    ghost: "border border-current text-ink hover:bg-ink/5",
  } as const;
  const inner = (
    <>
      <span>{children}</span>
      {arrow && (
        <span className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={clsx(base, variants[variant], className)}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} className={clsx(base, variants[variant], className)}>
      {inner}
    </button>
  );
}

/* Hairline-bordered card that lifts on hover. */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-ink/10 bg-paper p-6 transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_8px_30px_rgba(31,58,46,0.06)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* A figure with a label and a gold rule, prospectus-style. */
export function Stat({
  value,
  label,
  tone = "ink",
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: "ink" | "cream";
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={clsx(
          "font-display text-4xl tabular-nums md:text-5xl",
          tone === "cream" ? "text-cream" : "text-forest",
        )}
      >
        {value}
      </div>
      <div className="mt-3 border-t border-gold/50 pt-2">
        <span
          className={clsx(
            "font-ui text-xs uppercase tracking-[0.12em]",
            tone === "cream" ? "text-cream/70" : "text-ink-soft",
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-sand/50 px-3 py-1 font-ui text-xs tracking-wide text-ink-soft">
      {children}
    </span>
  );
}
