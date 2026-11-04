import { loadBills } from "@/components/BillsOnCards";
import { getUser } from "@/lib/data";
import { deterministicMoves, type Move } from "@/lib/plan";
import { planFacts } from "@/lib/plan-facts";

type Line = { text: string; note?: string | null };

// The plan in a few plain lines, grouped the way people act on it: what to fix, what to move to a card, where to cut
// back, what to save and invest. Worked out live from today's data on every load, so it's never out of date.
// The full plan with steps and messages stays below it.
export async function PlanSummary({ today }: { today: string }) {
  const { supabase, user } = await getUser();
  const profile = (user?.user_metadata?.profile ?? {}) as Record<string, unknown>;
  const [facts, bills] = await Promise.all([planFacts(supabase, user!.id, profile, today), loadBills()]);
  const { money } = bills;
  const moves = deterministicMoves(facts, money);
  const has = (m: Move, ...refs: string[]) => refs.some((r) => m.ref === r || m.ref.startsWith(`${r}:`));
  const line = (m: Move): Line => ({ text: m.title, note: m.gate });

  const fix = moves.filter((m) => has(m, "interest", "fees", "overspend", "fund:starter") || m.ref === "goal:debt").map(line);

  // Bills to move, grouped by the card to move them to.
  const byCard = new Map<string, { names: string[]; gain: number }>();
  for (const x of bills.items) {
    if (!x.o?.mine || x.gainMine < 1 || x.unknownCard || x.rent) continue;
    const k = x.o.mine.card.name;
    const g = byCard.get(k) ?? { names: [], gain: 0 };
    g.names.push(x.r.merchant_name);
    g.gain += x.gainMine;
    byCard.set(k, g);
  }
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const card: Line[] = [...byCard].map(([name, g]) => ({ text: `Pay ${list(g.names)} with your ${name}`, note: `About ${money(g.gain)} a year back.` }));

  const cut: Line[] = [
    ...(facts.spikes ?? []).map((s) => ({ text: `${s.label}: back to about ${money(s.avg)} a month`, note: `${money(s.now)} so far this month.` })),
    ...moves.filter((m) => has(m, "duplicate", "hike")).map(line),
    ...moves.filter((m) => m.ref === "subs").map((m) => ({ text: m.title, note: m.why.split(". ")[0] + "." })),
  ];

  const save = moves.filter((m) => has(m, "match", "fund:full", "room", "tax:ira", "hysa", "invest") || (m.ref.startsWith("goal:") && m.ref !== "goal:debt")).map(line);

  const groups = [
    { title: "Fix this first", lines: fix },
    { title: "Move these to a card", lines: card },
    { title: "Cut back", lines: cut },
    { title: "Save and invest", lines: save },
  ].filter((g) => g.lines.length);
  if (!groups.length) return null;

  return (
    <section className="card p-6 space-y-5 mb-6">
      <div>
        <div className="card-title">Your plan</div>
        <p className="text-sm text-muted mt-0.5">From your accounts as they are today. The full plan, with steps for each, is below.</p>
      </div>
      {groups.map((g, gi) => (
        <div key={g.title} className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <span className="size-5 rounded-full border border-line text-xs text-muted grid place-items-center tabular">{gi + 1}</span>
            {g.title}
          </div>
          <ul className="space-y-1.5 pl-7">
            {g.lines.slice(0, 5).map((l) => (
              <li key={l.text} className="text-sm">
                {l.text}
                {l.note && <span className="text-muted"> · {l.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
