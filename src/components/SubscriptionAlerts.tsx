import { dateLabel, money } from "@/lib/format";
import type { Alert } from "@/lib/subscriptions";

const short = (iso: string) => dateLabel(iso, { month: "short", day: "numeric" });

// ["Spotify", "Apple Music", "Spotify"] -> "Spotify (2), Apple Music"
const counted = (names: string[]) =>
  [...new Set(names)].map((n) => { const k = names.filter((x) => x === n).length; return k > 1 ? `${n} (${k})` : n; }).join(", ");

export function SubscriptionAlerts({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <div className="space-y-3">
      <div className="section-label px-1">Heads up</div>
      <section className="card overflow-hidden">
        {alerts.map((a, i) => (
          <div key={i} className="flex items-start gap-3 px-6 py-4 border-b border-line last:border-0">
            <span className="mt-1.5 size-2 rounded-full bg-bad shrink-0" />
            {a.kind === "price_hike" ? (
              <p className="text-sm">
                <span className="font-medium">{a.merchant} went up</span> from <span className="tabular">{money(a.from)}</span> to{" "}
                <span className="tabular font-medium">{money(a.to)}</span> on {short(a.date)}. That is <span className="tabular">{money(a.to - a.from)}</span> more each charge.
              </p>
            ) : (
              <p className="text-sm">
                <span className="font-medium">You pay for {a.merchants.length} {a.group} subscriptions</span>
                {a.same ? "" : `: ${counted(a.merchants)}`}. Together <span className="tabular font-medium">{money(a.monthly)}</span> a month.
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
