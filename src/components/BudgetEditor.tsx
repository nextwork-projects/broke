"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CircleDashed, LayoutList, Minus, Plus, Sparkles, Table2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { createCategory, SETUP, writeBudgets, type Changes } from "@/components/BudgetOffer";
import { Dropdown } from "@/components/Dropdown";
import { PageDates } from "@/components/PageDates";
import { CATEGORY_ICON_KEYS, CategoryIcon } from "@/components/Icons";
import { CountUp, EASE, firstVisit, reduced } from "@/components/motion";
import { toast } from "@/components/Toast";
import { budgetContext, daysBetween, merge, month, perDay, scaleBudget, startPeriod, step, tone, yearView, type MonthSpend } from "@/lib/budget";
import { useMoney } from "@/components/Money";

export type BudgetRange = { from: string; to: string; start: string; end: string; spent: Record<string, number> };
export type BudgetCat = { id: string; label: string; icon: string; color: string; spent: number; last: number; avg: number; suggested: number; main: boolean };

// Missing table (setup not finished) gets a friendly pointer (SETUP), never the technical cause.
// Bars use the app's chart blue, like the rest of the app; only an overspend turns red.
const TEXT = { ok: "text-muted", near: "text-ink", over: "text-bad" };

export function BudgetEditor({ cats: all, initial, year, range, today, income, now, tableMissing, aside }: { cats: BudgetCat[]; initial: Record<string, number>; year: MonthSpend[]; range: BudgetRange | null; today: string; income: number; now: string; tableMissing: boolean; aside?: React.ReactNode }) {
  const { money0, dateLabel } = useMoney();
  const root = useRef<HTMLDivElement>(null);
  const [budgets, setBudgets] = useState(initial);
  const [error, setError] = useState(tableMissing ? SETUP : "");
  const [sheet, setSheet] = useState<"add" | "suggest" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  // List or table, remembered on this device. Read after mount so the server and first client render agree.
  const [view, setView] = useState<"list" | "table">("list");
  useEffect(() => {
    try { if (localStorage.getItem("budget-view") === "table") setView("table"); } catch {}
  }, []);
  const pickView = (v: "list" | "table") => {
    setView(v);
    try { localStorage.setItem("budget-view", v); } catch {}
  };

  const m = month(new Date(now));
  const d = new Date(now);
  const lastMonth = dateLabel(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10), { month: "long" });
  // This month or last: the same rows with "spent" swapped, so the list, table and summary all follow.
  const [period, setPeriod] = useState<"this" | "last" | "year" | "custom">(() => range ? "custom" : startPeriod(m.day, all.filter((c) => c.id in initial).reduce((s, c) => s + c.last, 0)));
  const past = period === "last";
  const cats = past ? all.map((c) => ({ ...c, spent: c.last, last: c.spent })) : all;
  const budgeted = cats.filter((c) => c.id in budgets).sort((a, b) => a.label.localeCompare(b.label));
  const open = cats.filter((c) => !(c.id in budgets)).sort((a, b) => b.avg - a.avg || a.label.localeCompare(b.label));
  const unbudgeted = open.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = budgeted.reduce((s, c) => s + budgets[c.id], 0);
  const spent = budgeted.reduce((s, c) => s + c.spent, 0);
  const outside = unbudgeted.reduce((s, c) => s + c.spent, 0);
  const t = tone(spent, total);
  const hasBudget = budgeted.length > 0;

  useGSAP(
    () => {
      if (reduced() || !firstVisit("budget-bars")) return;
      gsap.from("[data-fill]", { scaleX: 0, transformOrigin: "left", duration: 0.6, ease: "power3.out", stagger: 0.03, clearProps: "transform" });
    },
    { scope: root, dependencies: [hasBudget] },
  );
  useGSAP(
    () => {
      if (fresh && !reduced()) gsap.from(`[data-row="${fresh}"]`, { opacity: 0, y: -8, duration: 0.3, ease: EASE, clearProps: "transform,opacity" });
    },
    { scope: root, dependencies: [fresh] },
  );

  // Optimistic: the screen changes first, the save runs after, and a failed save puts the old values back.
  // ponytail: rapid nudges send overlapping upserts, last-to-land wins; queue writes if that ever shows.
  async function apply(changes: Changes, done?: string) {
    const prev: Changes = Object.fromEntries(Object.keys(changes).map((k) => [k, budgets[k] ?? null]));
    setBudgets((b) => merge(b, changes));
    const err = await writeBudgets(changes);
    if (err) {
      setBudgets((b) => merge(b, prev));
      if (err === SETUP) setError(SETUP);
      else toast(err);
    } else if (done) toast(done, () => apply(prev));
  }

  function add(c: BudgetCat) {
    setSheet(null);
    setFresh(c.id);
    if (!c.suggested) setEditing(c.id);
    apply({ [c.id]: c.suggested }, c.suggested ? `Added ${c.label} · ${money0(c.suggested)}` : undefined);
  }

  // Fills main categories that have no budget yet; amounts you set stay.
  const suggestion = cats.filter((c) => c.main && !(c.id in budgets)).sort((a, b) => b.suggested - a.suggested);
  const useSuggested = () => {
    setSheet(null);
    apply(Object.fromEntries(suggestion.map((c) => [c.id, c.suggested])), `Added ${suggestion.length} budgets`);
  };

  const sheets = (
    <>
      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add a budget">
        {open.length ? (
          <ul>
            {open.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 md:px-6 py-3 border-t border-line">
                <CategoryIcon icon={c.icon} color={c.color} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.label}</div>
                  <div className="text-xs text-muted tabular">Last month {money0(c.last)} · 3-mo avg {money0(c.avg)}</div>
                </div>
                <button className="btn tabular shrink-0" onClick={() => add(c)}>
                  {c.suggested ? <>+ {money0(c.suggested)}</> : "Set amount"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 pb-6 text-sm text-muted">Every category has a budget.</p>
        )}
        <NewCategory taken={cats.map((c) => c.label)} onDone={(id, label, amount) => { setSheet(null); setBudgets((x) => ({ ...x, [id]: amount })); setFresh(id); toast(`Added ${label}`); }} />
      </Sheet>
      <Sheet open={sheet === "suggest"} onClose={() => setSheet(null)} title="Suggested budgets">
        <Suggest cats={suggestion} income={0} onUse={useSuggested} disabled={error === SETUP} sticky />
      </Sheet>
    </>
  );

  if (!hasBudget)
    return (
      <div ref={root} className="space-y-6">
      <div className="card overflow-hidden">
        <div className="p-6 md:p-8 pb-4 md:pb-4 max-w-xl space-y-2">
          <h2 className="text-2xl font-semibold">Set a budget from how you really spend</h2>
          <p className="text-sm text-muted">These are your averages for the last 3 months, rounded up, and never less than you&apos;ve spent this month. Use them as they are, or add one category at a time.</p>
        </div>
        <Suggest cats={suggestion} income={income} onUse={useSuggested} disabled={error === SETUP} alt={<button className="btn" onClick={() => setSheet("add")}>Add one at a time</button>} />
        {error && <div className="px-6 md:px-8 pb-6"><ErrorNote error={error} /></div>}
        {sheets}
      </div>
      <AskBudget cats={budgeted} budgets={budgets} />
      {aside}
      </div>
    );

  const left = total - spent;
  return (
    <div ref={root} className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.6fr_1fr] items-start">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="section-label">Your budgets</div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="View">
              {([["list", LayoutList, "List"], ["table", Table2, "Table"]] as const).map(([v, Icon, name]) => (
                <button key={v} aria-label={name} aria-pressed={view === v} title={name} onClick={() => pickView(v)} className={`size-7 grid place-items-center rounded-full ${view === v ? "bg-ink text-on-ink" : "text-muted hover:bg-[var(--hover)]"}`}><Icon size={15} /></button>
              ))}
            </div>
            <button className="btn inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => setSheet("suggest")} disabled={error === SETUP}><Sparkles size={15} /> Suggest</button>
            <button className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap !py-1.5" onClick={() => setSheet("add")} disabled={error === SETUP}><Plus size={16} /> Add budget</button>
          </div>
        </div>
        <div className="pill-tabs" role="group" aria-label="Month">
          {([["this", "This month"], ["last", "Last month"], ["year", "This year"], ["custom", "Custom dates"]] as const).map(([p, name]) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)} className={`pill-tab !py-1 !px-3 ${period === p ? "pill-tab-active" : ""}`}>{name}</button>
          ))}
        </div>
        <AskBudget cats={budgeted} budgets={budgets} />
        {period === "custom" ? (
          <div className="space-y-3">
            <PageDates path="/budgets" from={range?.from ?? ""} to={range?.to ?? ""} today={today} />
            {range && <RangeView range={range} cats={budgeted} budgets={budgets} />}
          </div>
        ) : period === "year" ? (
          <YearView months={year} cats={budgeted} budgets={budgets} />
        ) : view === "table" ? (
          <BudgetTable cats={budgeted} open={open} budgets={budgets} total={total} spent={spent} past={past} apply={apply} onAdd={(c, n) => { setFresh(c.id); apply({ [c.id]: n }, `Added ${c.label} · ${money0(n)}`); }} />
        ) : (
        <section className="card overflow-hidden">
          <ul>
            {budgeted.map((c) => (
              <Row
                key={c.id}
                c={c}
                past={past}
                amount={budgets[c.id]}
                editing={editing === c.id}
                onEdit={() => setEditing(c.id)}
                onCancel={() => setEditing(null)}
                onSave={(n) => {
                  setEditing(null);
                  if (n !== budgets[c.id]) apply({ [c.id]: n });
                }}
                onDelete={() => {
                  setEditing(null);
                  apply({ [c.id]: null }, `Removed ${c.label} budget`);
                }}
              />
            ))}
            {outside > 0 && (
              <li className="border-t border-line">
                <button onClick={() => setSheet("add")} className="row-hover w-full flex items-center gap-3 px-5 md:px-6 py-4 text-left">
                  <span className="size-9 rounded-[30%] border border-dashed border-muted/50 text-muted grid place-items-center shrink-0"><CircleDashed size={16} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium">Unbudgeted spending</span>
                    <span className="block text-xs text-muted truncate tabular">{unbudgeted.slice(0, 3).map((c) => `${c.label} ${money0(c.spent)}`).join(" · ")}</span>
                  </span>
                  <span className="tabular font-medium">{money0(outside)}</span>
                </button>
              </li>
            )}
          </ul>
        </section>
        )}
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="section-label px-1">Summary</div>
          <section className="card p-6 space-y-5">
            <div>
              <div className="card-title">{past ? lastMonth : dateLabel(now.slice(0, 10), { month: "long" })}</div>
              <div className="figure mt-1">
                {left >= 0 ? <CountUp value={left} format="money0" /> : money0(-left)}{" "}
                <span className={`text-base font-medium tracking-normal ${left >= 0 ? "text-muted" : "text-bad"}`}>{left >= 0 ? (past ? "under" : "left") : "over"}</span>
              </div>
              <div className="text-sm text-muted tabular">{money0(spent)} spent of {money0(total)}</div>
            </div>
            <div>
              <Bar used={total ? spent / total : 1} pace={past ? undefined : m.pace} tone={t} color="var(--chart)" thick />
              {!past && (
                <div className="relative h-4 mt-1.5 text-[11px] text-muted">
                  <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(90, Math.max(10, m.pace * 100))}%` }}>Today</span>
                </div>
              )}
            </div>
            {error && <ErrorNote error={error} />}
          </section>
          <section className="card overflow-hidden">
            {!past && <Stat label="Days left" value={String(m.left)} />}
            {!past && <Stat label="Left to spend per day" value={money0(perDay(total, spent, m.left))} />}
            <Stat label={past ? `Unbudgeted in ${lastMonth}` : "Unbudgeted this month"} value={money0(outside)} />
            {income > 0 && (
              <p className="px-5 py-4 border-t border-line text-sm text-muted">
                Income about <span className="text-ink tabular">{money0(income)}</span>/mo.{" "}
                {outside > 0 && <>Your budgets plus <span className="text-ink tabular">{money0(outside)}</span> of unbudgeted spending {past ? `in ${lastMonth}` : "this month"} </>}
                {outside > 0
                  ? income >= total + outside ? <>leave <span className="text-ink tabular">{money0(income - total - outside)}</span> to save.</> : <>come to <span className="text-ink tabular">{money0(total + outside - income)}</span> more than you earn.</>
                  : income >= total ? <>Your budgets leave <span className="text-ink tabular">{money0(income - total)}</span> to save.</> : <>Your budgets are <span className="text-ink tabular">{money0(total - income)}</span> more than you earn.</>}
              </p>
            )}
          </section>
        </div>
        {aside}
      </div>
      {sheets}
    </div>
  );
}

// Any dates against the budget. Monthly amounts are scaled to the number of days, so 2 weeks gets about half a month's budget.
function RangeView({ range, cats, budgets }: { range: BudgetRange; cats: BudgetCat[]; budgets: Record<string, number> }) {
  const { money0, dateLabel } = useMoney();
  const days = daysBetween(range.start, range.end);
  const rows = cats.map((c) => ({ c, budget: scaleBudget(budgets[c.id], days), spent: range.spent[c.id] ?? 0 }));
  const spent = rows.reduce((s, r) => s + r.spent, 0), budget = rows.reduce((s, r) => s + r.budget, 0);
  const diff = budget - spent;
  const label = (d: string) => dateLabel(d, { month: "short", day: "numeric", year: "numeric" });
  return (
    <section className="card p-5 md:p-6 space-y-4">
      <div>
        <div className="card-title">{money0(spent)} spent of {money0(budget)}</div>
        <p className={`text-sm ${diff < 0 ? "text-bad" : "text-muted"}`}>{money0(Math.abs(diff))} {diff < 0 ? "over" : "under"}, {label(range.start)} to {label(range.end)}</p>
      </div>
      <ul className="space-y-3">
        {rows.map(({ c, budget: b, spent: s }) => {
          const over = s - b;
          return (
            <li key={c.id}>
              <div className="flex justify-between gap-3 text-sm mb-1.5">
                <span className="flex items-center gap-2.5 min-w-0"><CategoryIcon icon={c.icon} color={c.color} size={24} /><span className="truncate">{c.label}</span></span>
                <span className="tabular text-right shrink-0"><span className={over >= 1 ? "text-bad" : "text-muted"}>{money0(Math.abs(over))} {over >= 1 ? "over" : "under"}</span><span className="text-muted"> · {money0(s)} / {money0(b)}</span></span>
              </div>
              <Bar used={b ? s / b : 1} tone={tone(s, b)} color="var(--chart)" />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Your monthly budgets scaled to {days === 1 ? "1 day" : `${days} days`}. To change an amount, go to This month.</p>
    </section>
  );
}

// Each month so far this year against the budget, for all budgets or one. Every month uses today's amounts: budgets keep no history.
function YearView({ months, cats, budgets }: { months: MonthSpend[]; cats: BudgetCat[]; budgets: Record<string, number> }) {
  const { money0, dateLabel } = useMoney();
  const [only, setOnly] = useState("");
  const y = yearView(months, budgets, only || null);
  const diff = y.budget - y.spent;
  const options = [{ value: "", label: "All budgets" }, ...cats.map((c) => ({ value: c.id, label: c.label }))];
  return (
    <section className="card p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="card-title">{money0(y.spent)} spent of {money0(y.budget)}</div>
          {!!y.rows.length && <p className={`text-sm ${diff < 0 ? "text-bad" : "text-muted"}`}>{money0(Math.abs(diff))} {diff < 0 ? "over" : "under"} budget this year</p>}
        </div>
        <div className="w-48"><Dropdown label="Which budget" placeholder="All budgets" value={only} options={options} onChange={setOnly} searchable /></div>
      </div>
      {y.rows.length ? (
        <ul className="space-y-3">
          {y.rows.map((r) => {
            const over = r.spent - r.budget;
            return (
              <li key={r.month}>
                <div className="flex justify-between gap-3 text-sm mb-1.5">
                  <span>{dateLabel(`${r.month}-01`, { month: "long" })}</span>
                  <span className="tabular text-right"><span className={over > 0 ? "text-bad" : "text-muted"}>{money0(Math.abs(over))} {over > 0 ? "over" : "under"}</span><span className="text-muted"> · {money0(r.spent)} / {money0(r.budget)}</span></span>
                </div>
                <Bar used={r.budget ? r.spent / r.budget : 1} tone={tone(r.spent, r.budget)} color="var(--chart)" />
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted">No spending in this budget this year.</p>}
      <p className="text-xs text-muted">Each month is compared with your budget as it is today.</p>
    </section>
  );
}

// Say the change in plain words. The AI answers with a budget block; nothing saves until Apply (BudgetOffer).
// Only the category names and the user's own budget amounts go in the message; spending comes through the AI's own gated tools.
function AskBudget({ cats, budgets }: { cats: BudgetCat[]; budgets: Record<string, number> }) {
  const { ask } = useAssistant();
  const [q, setQ] = useState("");
  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    ask(`${q.trim()}${budgetContext(cats.map((c) => [c.label, budgets[c.id]]))}`);
    setQ("");
  }
  return (
    <form onSubmit={send} className="flex gap-2">
      <label className="flex-1 min-w-0 flex items-center gap-2 border border-line rounded-full px-3.5 h-10 bg-surface focus-within:border-ink">
        <Sparkles size={15} className="text-muted shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask AI to change your budget" placeholder="Ask AI: cut eating out by 100 and add a Pets budget of 50" className="w-full text-sm outline-none bg-transparent" />
      </label>
      <button disabled={!q.trim()} className="btn shrink-0">Ask</button>
    </form>
  );
}

// The same budgets as a sheet: type an amount and press Enter or Tab away to save it, Esc puts it back.
function BudgetTable({ cats, open, budgets, total, spent, past, apply, onAdd }: {
  cats: BudgetCat[]; open: BudgetCat[]; budgets: Record<string, number>; total: number; spent: number; past: boolean; apply: (c: Changes, done?: string) => void; onAdd: (c: BudgetCat, n: number) => void;
}) {
  const { money0, symbol } = useMoney();
  const [pick, setPick] = useState("");
  const [amount, setAmount] = useState("");
  const chosen = open.find((c) => c.id === pick);
  const n = Math.round(Number(amount));
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || !amount.trim() || !(n >= 0)) return;
    onAdd(chosen, n);
    setPick(""); setAmount("");
  };
  const num = "px-3 py-2.5 text-right tabular whitespace-nowrap";
  const extra = "hidden @2xl:table-cell";
  const wide = "hidden @lg:table-cell"; // phones keep Budget and Left
  return (
    <section className="card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted text-left border-b border-line">
            <th className="font-normal pl-5 pr-3 py-2.5">Category</th>
            <th className={`font-normal ${num}`}>Budget</th>
            <th className={`font-normal ${num} ${wide}`}>Spent</th>
            <th className={`font-normal ${num}`}>{past ? "Under" : "Left"}</th>
            <th className={`font-normal ${num} ${extra}`}>{past ? "This month" : "Last month"}</th>
            <th className={`font-normal ${num} ${extra}`}>3-mo avg</th>
            <th className="w-10" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => {
            const left = budgets[c.id] - c.spent;
            return (
              <tr key={c.id} data-row={c.id} className="border-b border-line">
                <td className="pl-5 pr-3 py-1.5">
                  <Link href={`/transactions?category=${c.id}&range=30`} className="flex items-center gap-2.5 min-w-0 font-medium hover:underline underline-offset-2">
                    <CategoryIcon icon={c.icon} color={c.color} size={26} /><span className="truncate">{c.label}</span>
                  </Link>
                </td>
                <td className="px-1.5 py-1.5 text-right">
                  <AmountCell key={budgets[c.id]} label={c.label} value={budgets[c.id]} symbol={symbol} onSave={(v) => apply({ [c.id]: v })} />
                </td>
                <td className={`${num} ${wide}`}>{money0(c.spent)}</td>
                <td className={`${num} ${left < 0 ? "text-bad" : ""}`}>{left < 0 ? `-${money0(-left)}` : money0(left)}</td>
                <td className={`${num} ${extra} text-muted`}>{money0(c.last)}</td>
                <td className={`${num} ${extra} text-muted`}>{money0(c.avg)}</td>
                <td className="pr-2 text-right">
                  <button onClick={() => apply({ [c.id]: null }, `Removed ${c.label} budget`)} aria-label={`Remove ${c.label} budget`} className="size-8 inline-grid place-items-center rounded-full text-muted hover:text-bad hover:bg-[var(--hover-strong)]"><Trash2 size={15} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-medium border-b border-line">
            <td className="pl-5 pr-3 py-2.5">Total</td>
            <td className={num}>{money0(total)}</td>
            <td className={`${num} ${wide}`}>{money0(spent)}</td>
            <td className={`${num} ${total - spent < 0 ? "text-bad" : ""}`}>{total - spent < 0 ? `-${money0(spent - total)}` : money0(total - spent)}</td>
            <td className={extra} /><td className={extra} /><td />
          </tr>
        </tfoot>
      </table>
      {!!open.length && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 px-5 py-3">
          <div className="basis-full @lg:basis-0 flex-1 min-w-0">
            <Dropdown label="Category to add" value={pick} placeholder="Add a category" searchable options={open.map((c) => ({ value: c.id, label: c.label }))}
              onChange={(id) => { setPick(id); setAmount(String(open.find((c) => c.id === id)?.suggested || "")); }} />
          </div>
          <label className="flex items-center border border-line rounded-xl px-3 h-10 bg-surface focus-within:border-ink w-28 shrink-0">
            <span className="text-sm text-muted">{symbol}</span>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label="Monthly budget" className="w-full ml-1 text-sm tabular outline-none bg-transparent" />
          </label>
          <button disabled={!chosen || !amount.trim()} className="btn shrink-0 inline-flex items-center gap-1.5"><Plus size={15} /> Add</button>
        </form>
      )}
    </section>
  );
}

function AmountCell({ label, value, symbol, onSave }: { label: string; value: number; symbol: string; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    const n = Math.round(Number(v));
    if (v.trim() === "" || !Number.isFinite(n) || n < 0) setV(String(value));
    else if (n !== value) onSave(n);
  };
  return (
    <label className="inline-flex items-center justify-end gap-0.5 rounded-lg border border-transparent hover:border-line focus-within:border-ink px-1.5 h-8">
      <span className="text-muted">{symbol}</span>
      <input inputMode="numeric" value={v} aria-label={`${label} budget`} onFocus={(e) => e.target.select()} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setV(String(value)); requestAnimationFrame(() => (document.activeElement as HTMLElement)?.blur()); }
        }}
        style={{ width: `${Math.max(v.length, 2) + 1}ch` }} className="text-right tabular outline-none bg-transparent" />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line last:border-0">
      <span>{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

// Progress bar with a thin pace marker: where you'd be today if you spent evenly through the month.
export function Bar({ used, pace, tone: t, color, thick }: { used: number; pace?: number; tone: "ok" | "near" | "over"; color: string; thick?: boolean }) {
  return (
    <div className={`relative ${thick ? "h-2.5" : "h-1.5"} rounded-full`} style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}>
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <div data-fill className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(used, 1) * 100}%`, background: t === "over" ? "var(--bad)" : color }} />
      </div>
      {pace != null && <div className="absolute inset-y-0 w-[3px] -ml-[1.5px] bg-surface" style={{ left: `${pace * 100}%` }} title="Where you'd be at an even pace" />}
    </div>
  );
}

function Row({ c, past, amount, editing, onEdit, onCancel, onSave, onDelete }: {
  c: BudgetCat; past: boolean; amount: number; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: (n: number) => void; onDelete: () => void;
}) {
  const { money0 } = useMoney();
  const t = tone(c.spent, amount);
  const status = t === "over" ? `${money0(c.spent - amount)} over` : `${money0(amount - c.spent)} ${past ? "under" : "left"}`;
  return (
    <li data-row={c.id} className="px-5 md:px-6 py-4 border-b border-line last:border-0">
      <div className="flex items-center gap-3">
        <CategoryIcon icon={c.icon} color={c.color} size={36} />
        <div className="flex-1 min-w-0">
          <Link href={`/transactions?category=${c.id}&range=30`} className="block font-medium truncate hover:underline underline-offset-2">{c.label}</Link>
          <div className="text-xs tabular">
            <span className={TEXT[t]}>{status}</span>
            <span className="text-muted"> · {past ? "this month" : "last month"} {money0(c.last)}</span>
          </div>
        </div>
        {!editing && (
          <button onClick={onEdit} aria-label={`Edit ${c.label} budget`} className="tabular text-right rounded-xl px-2.5 py-1.5 -mr-2.5 hover:bg-[var(--hover-strong)] shrink-0">
            <span className="font-medium">{money0(c.spent)}</span>
            <span className="text-muted"> / {money0(amount)}</span>
          </button>
        )}
      </div>
      <div className="mt-3 pl-12">
        <Bar used={amount ? c.spent / amount : 1} tone={t} color="var(--chart)" />
      </div>
      {editing && <Editor key={amount} label={c.label} value={amount} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />}
    </li>
  );
}

// Inline amount editor: type, Enter saves, Esc cancels, -/+ step by a round amount.
function Editor({ label, value, onSave, onCancel, onDelete }: { label: string; value: number; onSave: (n: number) => void; onCancel: () => void; onDelete: () => void }) {
  const { symbol } = useMoney();
  const [v, setV] = useState(String(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const n = Number(v);
  const commit = () => (v.trim() !== "" && Number.isFinite(n) && n >= 0 ? onSave(Math.round(n)) : onCancel());
  const nudge = (d: 1 | -1) => {
    const cur = Number.isFinite(n) ? n : value;
    setV(String(Math.max(0, Math.round(cur + d * step(d < 0 ? cur - 1 : cur)))));
    input.current?.focus();
  };
  const icon = "size-8 md:size-9 grid place-items-center rounded-full border border-line hover:bg-[var(--hover-strong)] shrink-0";
  return (
    <div className="mt-3 md:pl-12 flex items-center gap-1.5 md:gap-2">
      <button type="button" className={icon} onClick={() => nudge(-1)} aria-label="Less"><Minus size={15} /></button>
      <label className="flex items-center border border-line rounded-full px-3 h-8 md:h-9 bg-surface min-w-0 focus-within:border-ink">
        <span className="text-sm text-muted">{symbol}</span>
        <input
          ref={input}
          inputMode="numeric"
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          aria-label={`${label} budget`}
          className="w-14 text-sm tabular outline-none bg-transparent"
        />
      </label>
      <button type="button" className={icon} onClick={() => nudge(1)} aria-label="More"><Plus size={15} /></button>
      <button type="button" className="btn-primary px-4 py-1.5" onClick={commit}>Save</button>
      <span className="flex-1" />
      <button type="button" className={`${icon} text-muted hover:text-bad`} onClick={onDelete} aria-label={`Remove ${label} budget`}><Trash2 size={15} /></button>
      <button type="button" className={`${icon} text-muted`} onClick={onCancel} aria-label="Cancel"><X size={15} /></button>
    </div>
  );
}

// Preview of budgets from the 3-month average.
function Suggest({ cats, income, onUse, disabled, alt, sticky }: { cats: BudgetCat[]; income: number; onUse: () => void; disabled: boolean; alt?: React.ReactNode; sticky?: boolean }) {
  const { money0 } = useMoney();
  const total = cats.reduce((s, c) => s + c.suggested, 0);
  if (!cats.length) return <div className="px-6 md:px-8 pb-6 space-y-4"><p className="text-sm text-muted">Nothing to suggest right now.</p>{alt}</div>;
  return (
    <>
      <ul className="grid @2xl:grid-cols-2 gap-x-8 px-5 md:px-8">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5 border-b border-line">
            <CategoryIcon icon={c.icon} color={c.color} size={30} />
            <span className="flex-1 min-w-0 truncate">{c.label}</span>
            <span className="tabular text-sm">
              <span className="font-medium">{money0(c.suggested)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={`${sticky ? "sticky bottom-0" : ""} bg-surface px-5 md:px-8 py-5 space-y-3`}>
        <p className="text-xs text-muted">Each one is your 3-month average, rounded up, and never less than you&apos;ve spent this month.</p>
        {income > 0 && <p className="text-sm text-muted">You bring in about {money0(income)} a month. {income >= total ? `This leaves ${money0(income - total)} to save.` : `You're spending ${money0(total - income)} more than you earn.`}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={onUse} disabled={disabled}>Use these · {money0(total)}/mo</button>
          {alt}
        </div>
      </div>
    </>
  );
}

// Native modal: Esc and a backdrop click close it. A bottom sheet on phones, centred above md.
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      if (!reduced()) gsap.from(d, { y: 24, opacity: 0, duration: 0.3, ease: EASE, clearProps: "transform,opacity" });
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="@container w-full max-w-full md:max-w-[560px] max-h-[85vh] mx-auto mt-auto mb-0 md:my-auto rounded-t-3xl md:rounded-3xl border border-line bg-surface text-ink p-0 backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-5 md:px-6 py-4">
        <h2 className="card-title">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="size-8 grid place-items-center rounded-full text-muted hover:bg-[var(--hover-strong)]"><X size={16} /></button>
      </div>
      {children}
    </dialog>
  );
}

// Your own spending category with a budget. Built-in categories stay as they are; this adds a row owned by you.
// onDone puts the new budget in local state; router.refresh() then brings the category into `cats`.
function NewCategory({ taken, onDone }: { taken: string[]; onDone: (id: string, label: string, amount: number) => void }) {
  const router = useRouter();
  const { symbol } = useMoney();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("other");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = label.trim();
    const n = Math.round(Number(amount));
    if (!name) return setErr("Give it a name.");
    if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return setErr("You already have a category with that name.");
    if (!Number.isFinite(n) || n <= 0) return setErr("Add a monthly amount.");
    setBusy(true);
    setErr("");
    const id = await createCategory(name, icon);
    const failed = !id || (await writeBudgets({ [id]: n }));
    setBusy(false);
    if (failed) return setErr("Couldn't save that category.");
    onDone(id, name, n);
    setOpen(false);
    setLabel(""); setAmount(""); setIcon("other");
    router.refresh();
  }

  if (!open)
    return (
      <div className="px-5 md:px-6 py-4 border-t border-line">
        <button className="btn inline-flex items-center gap-1.5" onClick={() => setOpen(true)}><Plus size={15} /> New category</button>
      </div>
    );
  return (
    <form onSubmit={save} className="px-5 md:px-6 py-4 border-t border-line space-y-3">
      <div className="font-medium">New category</div>
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pets" aria-label="Category name" maxLength={40} className="select" />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
        {CATEGORY_ICON_KEYS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={icon === k} aria-label={k.replace("_", " ")} onClick={() => setIcon(k)}
            className={`rounded-full p-0.5 ${icon === k ? "ring-2 ring-ink" : "hover:bg-[var(--hover)]"}`}>
            <CategoryIcon icon={k} color="#6f8cf2" size={32} />
          </button>
        ))}
      </div>
      <label className="flex items-center border border-line rounded-xl px-3.5 py-2.5 bg-surface focus-within:border-ink w-44">
        <span className="text-sm text-muted">{symbol}</span>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label="Monthly budget" className="w-full ml-1 text-sm tabular outline-none bg-transparent" />
        <span className="text-sm text-muted">/mo</span>
      </label>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-primary">{busy ? "Saving..." : "Add category"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function ErrorNote({ error }: { error: string }) {
  return error === SETUP ? (
    <span className="text-sm text-muted">Budgets aren&apos;t switched on yet. <Link href="/setup" className="text-ink underline underline-offset-2">Finish setup</Link></span>
  ) : (
    <span className="text-sm text-bad">{error}</span>
  );
}
