/**
 * Deterministic per-vendor branding — a brand colour, a tint, a monogram, and a
 * document-template variant. Shared by the document renderers (so a vendor's
 * logo colour is identical across its PDF/Excel/Word files) and the dashboard
 * (so the same colour identifies the vendor on screen).
 */
export interface Brand {
  /** Primary brand colour (hex, e.g. "#1D4ED8"). */
  hex: string;
  /** A pale tint of the brand colour for backgrounds/bands. */
  tintHex: string;
  /** 1–2 letter monogram, e.g. "BC". */
  initials: string;
  /** Layout variant 0|1|2 for the document templates. */
  template: 0 | 1 | 2;
}

const CATEGORY_COLORS: { match: RegExp; hex: string }[] = [
  { match: /payroll|hr software|hris/i, hex: "#1D4ED8" },
  { match: /saas|per-seat|software/i, hex: "#4338CA" },
  { match: /cloud|hosting|cdn|iaas/i, hex: "#0E7490" },
  { match: /telecom|connectivity|sd-wan/i, hex: "#0369A1" },
  { match: /wireless|mobile/i, hex: "#0F766E" },
  { match: /utilit|power|water/i, hex: "#B45309" },
  { match: /janitor|facilit/i, hex: "#15803D" },
  { match: /ground|landscap/i, hex: "#4D7C0F" },
  { match: /cyber|security \(cyber\)/i, hex: "#B91C1C" },
  { match: /security/i, hex: "#334155" },
  { match: /courier|parcel|overnight/i, hex: "#C2410C" },
  { match: /logistic|freight|ltl/i, hex: "#1E40AF" },
  { match: /benefits/i, hex: "#0D9488" },
  { match: /insurance/i, hex: "#1E3A8A" },
  { match: /agency|creative/i, hex: "#BE185D" },
  { match: /marketing|media/i, hex: "#6D28D9" },
  { match: /equipment|lease|copier/i, hex: "#92400E" },
  { match: /professional|advisory|audit/i, hex: "#115E59" },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function monogram(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function clampHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** Mix a hex colour toward white by `amount` (0..1). */
export function tint(hex: string, amount = 0.88): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = (c: number) => c + (255 - c) * amount;
  return `#${clampHex(mix(r))}${clampHex(mix(g))}${clampHex(mix(b))}`;
}

export function brandFor(vendorName: string, category = ""): Brand {
  const hay = `${category} ${vendorName}`;
  const found = CATEGORY_COLORS.find((c) => c.match.test(hay));
  const hex = found?.hex ?? "#1F3A2E";
  return {
    hex,
    tintHex: tint(hex),
    initials: monogram(vendorName),
    template: (hashString(vendorName) % 3) as 0 | 1 | 2,
  };
}
