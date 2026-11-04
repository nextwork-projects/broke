// One file per icon: the package barrel pulls in all ~1,500 icons and slowed every dev compile.
import { AirplaneTiltIcon } from "@phosphor-icons/react/dist/ssr/AirplaneTilt";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowsLeftRight";
import { BankIcon } from "@phosphor-icons/react/dist/ssr/Bank";
import { CarIcon } from "@phosphor-icons/react/dist/ssr/Car";
import { CreditCardIcon } from "@phosphor-icons/react/dist/ssr/CreditCard";
import { DotsThreeCircleIcon } from "@phosphor-icons/react/dist/ssr/DotsThreeCircle";
import { FilmSlateIcon } from "@phosphor-icons/react/dist/ssr/FilmSlate";
import { ForkKnifeIcon } from "@phosphor-icons/react/dist/ssr/ForkKnife";
import { HeartbeatIcon } from "@phosphor-icons/react/dist/ssr/Heartbeat";
import { HouseIcon } from "@phosphor-icons/react/dist/ssr/House";
import { LightningIcon } from "@phosphor-icons/react/dist/ssr/Lightning";
import { MoneyIcon } from "@phosphor-icons/react/dist/ssr/Money";
import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr/Receipt";
import { ScalesIcon } from "@phosphor-icons/react/dist/ssr/Scales";
import { ShoppingBagIcon } from "@phosphor-icons/react/dist/ssr/ShoppingBag";
import { ShoppingCartIcon } from "@phosphor-icons/react/dist/ssr/ShoppingCart";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { WrenchIcon } from "@phosphor-icons/react/dist/ssr/Wrench";

// Phosphor fill (MIT).
// The ssr entry works in server and client components.
const CATEGORY_ICONS: Record<string, typeof MoneyIcon> = {
  income: MoneyIcon,
  transfer: ArrowsLeftRightIcon,
  credit_card: CreditCardIcon,
  loan: BankIcon,
  fees: ReceiptIcon,
  entertainment: FilmSlateIcon,
  dining: ForkKnifeIcon,
  groceries: ShoppingCartIcon,
  shopping: ShoppingBagIcon,
  home: HouseIcon,
  health: HeartbeatIcon,
  personal_care: SparkleIcon,
  services: WrenchIcon,
  taxes: ScalesIcon,
  transport: CarIcon,
  travel: AirplaneTiltIcon,
  bills: LightningIcon,
  other: DotsThreeCircleIcon,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

// Category icon: a solid tile in the category colour with a white glyph.
export function CategoryIcon({ icon, color, size = 32 }: { icon?: string | null; color?: string | null; size?: number }) {
  const Glyph = CATEGORY_ICONS[icon ?? "other"] ?? DotsThreeCircleIcon;
  const c = color ?? "#78716c";
  return (
    <span className="grid place-items-center shrink-0 text-white" style={{ width: size, height: size, borderRadius: "30%", background: c }}>
      <Glyph size={Math.round(size * 0.56)} weight="fill" />
    </span>
  );
}

export function CategoryLabel({ icon, color, label }: { icon?: string | null; color?: string | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-sm">
      <CategoryIcon icon={icon} color={color} size={28} />
      {label}
    </span>
  );
}
