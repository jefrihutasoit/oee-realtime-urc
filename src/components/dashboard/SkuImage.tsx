import { assetUrl } from "@/lib/api";
import type { Sku } from "@/types/oee";

const THUMB_COLORS = ["#1E6FD9", "#0F9D8A", "#7C3AED", "#D97706", "#DB2777", "#0891B2", "#65A30D", "#DC2626"];

/** Same SKU, same colour. */
function colorOf(code: string) {
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return THUMB_COLORS[Math.abs(hash) % THUMB_COLORS.length];
}

/** Up to two letters from the product name ("King stick Jagung Bakar" → "KS"), else the SKU code. */
function initialsOf(sku: Sku) {
  const words = sku.name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  const fromName = words.slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (fromName || sku.code).slice(0, 3);
}

/**
 * Photo of the running SKU, or a generated thumbnail (initials on a colour) when it has none.
 * Renders nothing without a SKU, so no product picture appears for an idle machine.
 */
export default function SkuImage({ sku, className }: { sku: Sku | null | undefined; className: string }) {
  if (!sku || sku.code === "-") return null;
  const title = `${sku.code} · ${sku.name}`;
  const photo = assetUrl(sku.image);

  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- photos are served by the backend
    return <img src={photo} alt={sku.name} title={title} className={`shrink-0 object-contain ${className}`} />;
  }
  const initials = initialsOf(sku);
  return (
    <svg viewBox="0 0 40 40" role="img" aria-label={sku.name} className={`shrink-0 ${className}`}>
      <title>{title}</title>
      <rect width="40" height="40" rx="8" fill={colorOf(sku.code)} />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={initials.length > 2 ? 12 : 15}
        fontWeight="600"
        fontFamily="inherit"
      >
        {initials}
      </text>
    </svg>
  );
}
