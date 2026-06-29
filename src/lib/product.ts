/**
 * Which product this build is. RECOUP ships as TWO standalone products from one
 * codebase — Cost Reduction (vendor overpayment) and Revenue Leakage (customer
 * underpayment) — each its own Vercel deployment. The deployment sets
 * NEXT_PUBLIC_PRODUCT at build time; everything user-facing reads PRODUCT to
 * render a single product (no cross-product nav or toggle). They share the same
 * green editorial theme.
 *
 * Local dev defaults to "cost" unless NEXT_PUBLIC_PRODUCT=revenue.
 */
export type Product = "cost" | "revenue";

export const PRODUCT: Product =
  process.env.NEXT_PUBLIC_PRODUCT === "revenue" ? "revenue" : "cost";

export const IS_REVENUE = PRODUCT === "revenue";
export const IS_COST = PRODUCT === "cost";
