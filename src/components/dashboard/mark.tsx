import { brandFor } from "@/lib/brand";

/** A vendor's monogram logo chip — same colour as the vendor's documents. */
export function VendorMark({
  name,
  category = "",
  size = 36,
}: {
  name: string;
  category?: string;
  size?: number;
}) {
  const b = brandFor(name, category);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-ui font-bold text-white"
      style={{ background: b.hex, width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {b.initials}
    </span>
  );
}
