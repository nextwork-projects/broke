/* eslint-disable @next/next/no-img-element */
import { Merchant } from "@/components/Merchant";
import { CARD_ART } from "@/lib/cards";

// The card's real art at card proportions, or the issuer's logo when there is none. w: Tailwind width class.
export function CardArt({ card, w = "w-16" }: { card: { id: string; issuer: string; name: string }; w?: string }) {
  const art = CARD_ART[card.id];
  return (
    <span className={`${w} aspect-[1.586] shrink-0 self-start grid place-items-center`}>
      {art ? <img src={art.src} alt={`${card.issuer} ${card.name}`} className="size-full border border-line object-cover" style={{ borderRadius: "4.5% / 7%" }} /> : <Merchant name={card.issuer} />}
    </span>
  );
}
