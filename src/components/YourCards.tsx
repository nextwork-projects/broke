import { CardArt } from "@/components/CardArt";
import { Merchant } from "@/components/Merchant";
import { CAT_LABEL, whichCard, type Card, type Cat } from "@/lib/cards";
import { money0 } from "@/lib/format";

const rateText = (c: Card, rate: number) => (c.currency === "cash back" ? `${rate}%` : `${rate}x`);
// "3x dining, travel and gas & transport; 1x everything else"
const earnLine = (c: Card) => {
  const by = new Map<number, string[]>();
  for (const [cat, e] of Object.entries(c.earn) as [Cat, { rate: number }][]) if (cat !== "other") by.set(e.rate, [...(by.get(e.rate) ?? []), CAT_LABEL[cat].toLowerCase()]);
  const parts = [...by].sort((a, b) => b[0] - a[0]).map(([r, cats]) => `${rateText(c, r)} ${cats.join(", ")}`);
  return [...parts, `${rateText(c, c.earn.other.rate)} ${parts.length ? "everything else" : "on everything"}`].join(" · ");
};

// The cards the user holds, and which one to pay with for each kind of spending. From their linked card accounts.
export function YourCards({ mine, spend }: { mine: { name: string; mask: string | null; card: Card | null }[]; spend: Record<Cat, number> }) {
  if (!mine.length) return null;
  const known = [...new Map(mine.filter((m) => m.card).map((m) => [m.card!.id, m.card!])).values()];
  const pick = whichCard(known).filter((p) => spend[p.cat] > 0 || p.rate > 1).sort((a, b) => (spend[b.cat] ?? 0) - (spend[a.cat] ?? 0));
  const allSame = pick.length > 0 && pick.every((p) => !p.tie) && new Set(pick.map((p) => p.card.id)).size === 1;
  return (
    <section className="card p-6 space-y-5">
      <div className="card-title">Your cards</div>
      <ul className="space-y-4">
        {mine.map((m, i) => (
          <li key={i} className="flex items-center gap-4">
            {m.card ? <CardArt card={m.card} w="w-20" /> : <span className="w-20 grid place-items-center"><Merchant name={m.name} /></span>}
            <div className="min-w-0">
              <div className="font-medium">{m.card ? (m.card.name.startsWith(m.card.issuer) ? m.card.name : `${m.card.issuer} ${m.card.name}`) : m.name}{m.mask && <span className="text-muted font-normal"> ··{m.mask}</span>}</div>
              <div className="text-sm text-muted">{m.card ? `${earnLine(m.card)}${m.card.fee ? ` · ${money0(m.card.fee)} a year` : " · No annual fee"}` : "broke doesn't know this card's rewards yet."}</div>
              {m.card?.notes[0] && <div className="text-xs text-muted">{m.card.notes[0].replace(/ Not counted[^.]*\./, "")}</div>}
            </div>
          </li>
        ))}
      </ul>
      {pick.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium">Which card to use</div>
          {allSame ? (
            <p className="text-sm text-muted">Your {pick[0].card.name} earns the most on everything.</p>
          ) : (
            <table className="w-full text-sm tabular">
              <thead><tr className="text-left text-muted"><th className="font-normal py-1.5">When you pay for</th><th className="font-normal">Use</th><th className="font-normal text-right">Earns</th><th className="font-normal text-right">On your spend a year</th></tr></thead>
              <tbody>
                {pick.map((p) => (
                  <tr key={p.cat} className="border-t border-line">
                    <td className="py-1.5">{CAT_LABEL[p.cat]}</td>
                    <td>{p.tie ? "Either card" : p.card.name}</td>
                    <td className="text-right">{p.tie ? "Same on both" : rateText(p.card, p.rate)}</td>
                    <td className="text-right">{spend[p.cat] ? money0(spend[p.cat] * p.cents) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {known.some((c) => c.id === "discover-it") && (
            <p className="text-sm text-muted">Each quarter Discover names categories that earn 5% (up to $1,500). Activate them on Discover&apos;s site, and use the Discover for those while they last.</p>
          )}
          <p className="text-xs text-muted">Pay every card in full each month. Interest costs more than any of these earn.</p>
        </div>
      )}
    </section>
  );
}
