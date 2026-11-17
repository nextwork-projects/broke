import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/Icons";
import { Merchant } from "@/components/Merchant";
import { displayName, type Txn } from "@/lib/data";
import { dateLabel, homeCurrency, money, signed } from "@/lib/format";
import { pairTransfers } from "@/lib/transfers";

const fullDate = (iso: string) => dateLabel(iso, { month: "short", day: "numeric", year: "numeric" });

// Transactions grouped under a grey date band with that day's spend total (left out when the day mixes currencies).
// today: the user's date. A row dated after it (Plaid dates in UTC) goes under today, never under a future day.
export function TxnList({ txns, today }: { txns: Txn[]; today: string }) {
  const days = new Map<string, Txn[]>();
  const pairs = pairTransfers(txns); // a card payment shows once, on the account it left
  for (const t of txns.filter((x) => !pairs.hidden.has(x.id))) {
    const d = t.date > today ? today : t.date;
    days.set(d, [...(days.get(d) ?? []), t]);
  }
  const home = homeCurrency();
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  const curOf = (list: Txn[]) => { const c = new Set(list.map((t) => t.currency ?? home)); return c.size === 1 ? [...c][0] : null; };
  return (
    <div>
      {[...days].map(([date, list]) => (
        <div key={date}>
          <div className="flex justify-between bg-canvas/70 px-6 py-2.5 text-xs text-muted">
            <span className="text-ink">{date === today ? "Today" : date === yesterday ? "Yesterday" : fullDate(date)}</span>
            {curOf(list) && <span className="tabular money">{money(list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), curOf(list))}</span>}
          </div>
          {list.map((t) => (
            <Link key={t.id} href={`/transactions?q=${encodeURIComponent(displayName(t))}`} className="flex items-center gap-4 px-4 @lg:px-6 py-3 border-b border-line last:border-0 row-hover group">
              <Merchant name={displayName(t)} logo={t.logo_url} color={t.category?.color} icon={t.category?.icon} />
              <span className="flex-1 min-w-0 truncate">{displayName(t)}{t.pending && <span className="text-xs text-muted"> · Pending</span>}{pairs.to.has(t.id) && <span className="text-xs text-muted"> · To {pairs.to.get(t.id)}</span>}</span>
              <span className="hidden @lg:block"><CategoryIcon icon={t.category?.icon} color={t.category?.color} /></span>
              <span className={`w-24 text-right tabular font-medium money ${t.amount < 0 ? "text-good" : ""}`}>{signed(t.amount, t.currency)}</span>
              <span className="size-8 rounded-full border border-line hidden @lg:grid place-items-center text-muted transition-all duration-150 group-hover:border-ink group-hover:text-ink group-hover:translate-x-0.5"><ChevronRight size={16} /></span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
