/* eslint-disable @next/next/no-img-element */
import { CategoryIcon } from "@/components/Icons";
import { isGeneric, logoFor } from "@/lib/logos";

// Plaid's logo, else a local brand logo, else the category icon for money-moving rows, else the first letter.
// icon: the row's category icon key. small: a 16px mark beside text (issuer names), not a row avatar.
export function Merchant({ name, logo, color, icon, small }: { name: string; logo?: string | null; color?: string | null; icon?: string | null; small?: boolean }) {
  const src = logo || logoFor(name);
  const size = small ? "size-4" : "size-8";
  if (src) return <img src={src} alt="" className={`${size} rounded-full border border-line bg-white object-cover shrink-0`} />;
  if (small) return null;
  if (isGeneric(name, icon)) return <CategoryIcon icon={icon} color={color} />;
  return (
    <span
      className="size-8 rounded-full grid place-items-center text-xs font-semibold text-white shrink-0"
      style={{ background: color ?? "#78716c" }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function CategoryPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border border-line">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
