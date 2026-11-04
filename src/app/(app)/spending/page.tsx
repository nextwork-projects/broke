import { ChevronLeft, ChevronRight, CircleMinus, CirclePlus, Landmark, PiggyBank, ReceiptText, Scale, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Breakdown } from "@/components/Donut";
import { EmptyBank } from "@/components/EmptyBank";
import { MonthBars } from "@/components/MonthBars";
import { PageDates } from "@/components/PageDates";
import { Merchant } from "@/components/Merchant";
import { categories, displayName, getUser, isIncome, isSpend, loanPayments, moneyByMonth, savedByMonth, sumOf, today, transactionsSince, type MonthRow, type Txn } from "@/lib/data";
import { dateLabel, money, money0, monthLabel, monthStart, ymd } from "@/lib/format";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

type Row = { icon: LucideIcon; label: string; sub: string; v: number };
function Summary({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-3">
      <div className="section-label px-1">Summary</div>
      <section className="card overflow-hidden">
        {rows.map(({ icon: Icon, label, sub, v }, i) => (
          <div key={label} className={`flex items-center gap-4 px-5 py-4 ${i ? "border-t border-line" : ""}`}>
            <Icon size={20} strokeWidth={1.6} className="text-chart" />
            <div className="flex-1">
              <div>{label}</div>
              <div className="text-xs text-muted">{sub}</div>
            </div>
            <span className="tabular font-medium">{money(v)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

// Where the money came from: one row per source and currency (never add currencies together), biggest first.
function IncomeSources({ txns, range }: { txns: Txn[]; range: string }) {
  const by = new Map<string, { v: number; n: number; t: Txn }>();
  for (const t of txns.filter(isIncome)) {
    const k = `${displayName(t)}|${t.currency ?? ""}`;
    const f = by.get(k) ?? { v: 0, n: 0, t };
    by.set(k, { v: f.v - t.amount, n: f.n + 1, t });
  }
  const rows = [...by].filter(([, f]) => f.v > 0).sort((a, b) => b[1].v - a[1].v);
  return (
    <div className="space-y-3">
      <div className="section-label px-1">Income breakdown</div>
      <section className="card overflow-hidden">
        {rows.length ? rows.map(([k, f]) => (
          <Link key={k} href={`/transactions?q=${encodeURIComponent(displayName(f.t))}${range}`} className="row-hover flex items-center gap-4 px-5 py-3 border-b border-line last:border-0">
            <Merchant name={displayName(f.t)} logo={f.t.logo_url} color={f.t.category?.color} icon={f.t.category?.icon} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{displayName(f.t)}</div>
              <div className="text-xs text-muted">{f.n === 1 ? "1 payment" : `${f.n} payments`}</div>
            </div>
            <span className="tabular font-medium text-good">{money(f.v, f.t.currency)}</span>
          </Link>
        )) : <p className="px-5 py-5 text-sm text-muted">No income in these dates.</p>}
      </section>
    </div>
  );
}

// Any dates the user picks: the same totals and breakdown, added up from the transactions themselves.
async function CustomRange({ from, to, today }: { from: string; to: string; today: string }) {
  const { supabase, user } = await getUser();
  const start = from || "2000-01-01", end = to || today;
  const [txns, cats, savedMonths] = await Promise.all([transactionsSince(start, nextDay(end)), categories(), savedByMonth(supabase, user!.id, start, end)]);
  const spend = txns.filter(isSpend);
  const total = sumOf(spend, (t) => t.amount);
  const income = -sumOf(txns.filter(isIncome), (t) => t.amount);
  const loans = sumOf(txns.filter((t) => t.category?.key === "LOAN_PAYMENTS" && t.amount > 0 && !t.ignored), (t) => t.amount);
  const saved = [...savedMonths.values()].reduce((s, n) => s + n, 0);
  const by = new Map<string, number>();
  for (const t of spend) if (t.category_id) by.set(t.category_id, (by.get(t.category_id) ?? 0) + t.amount);
  const slices = [...by].flatMap(([id, v]) => {
    const c = cats.find((x) => x.id === id);
    return c ? [{ id, label: c.label, color: c.color, icon: c.icon, v, prev: 0 }] : [];
  }).sort((a, b) => b.v - a.v);
  const left = income - total - loans;
  const label = (d: string) => dateLabel(d, { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="space-y-6">
      <PageDates path="/spending" from={from} to={to} today={today} />
      <p className="text-center font-medium">{from ? label(from) : "The start"} to {label(end)}</p>
      <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.6fr_1fr] items-start">
        <div className="space-y-6">
        <div className="space-y-3">
          <div className="section-label px-1">Spending breakdown</div>
          <section className="card p-6">
            {slices.length ? <Breakdown slices={slices} total={total} change={null} prevLabel="" monthParam={`&${new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v))}`} /> : <p className="text-sm text-muted text-center py-10">No spending in these dates.</p>}
          </section>
        </div>
        <IncomeSources txns={txns} range={`&${new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v))}`} />
        </div>
        <Summary rows={[
          { icon: CirclePlus, label: "Income", sub: "Money that came in", v: income },
          { icon: CircleMinus, label: "Spending", sub: `${spend.length} purchases`, v: total },
          ...(loans >= 1 ? [{ icon: Landmark, label: "Loan payments", sub: "Paid toward loans", v: loans }] : []),
          { icon: Scale, label: left >= 0 ? "Left over" : "Spent more than came in", sub: "Income minus everything that went out", v: Math.abs(left) },
          ...(saved >= 1 ? [{ icon: PiggyBank, label: "Saved and invested", sub: "Into savings and investment accounts", v: saved }] : []),
        ]} />
      </div>
    </div>
  );
}

export default async function Spending({ searchParams }: { searchParams: Promise<{ m?: string; bills?: string; from?: string; to?: string; span?: string }> }) {
  const { m, bills, from: rawFrom, to: rawTo, span } = await searchParams;
  const from = DAY.test(rawFrom ?? "") ? rawFrom! : "", to = DAY.test(rawTo ?? "") ? rawTo! : "";
  const includeBills = bills !== "0";
  const now = await today();
  if (from || to) return <CustomRange from={from} to={to} today={ymd(now)} />;
  const { supabase, user } = await getUser();
  // m = "YYYY-MM" (the arrows or a bar), "last" or "now"; anything else = this month. Up to 5 years back.
  const ym = /^\d{4}-\d{2}$/.test(m ?? "") ? m!.split("-").map(Number) : null;
  // The first days of a month open on last month: this one is still empty. m=now asks for this month anyway.
  const offset = m === "last" || (!m && now.getUTCDate() <= 3) ? -1 : ym ? Math.max(-59, Math.min(0, (ym[0] - now.getUTCFullYear()) * 12 + ym[1] - 1 - now.getUTCMonth())) : 0;
  const month = monthStart(now, offset);
  const prevMonth = monthStart(now, offset - 1);
  // The chart and table: the picked month's whole year by default, or the last 12 or 6 months (the 6 or 12 ending at the
  // picked month once it's older than that). A year stops at this month, so there are never empty months ahead.
  const n = span === "6" ? 6 : span === "12" ? 12 : 0;
  const end = n && offset <= -n ? offset : 0;
  const year = month.getUTCFullYear();
  const yearLen = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
  const months = n ? Array.from({ length: n }, (_, i) => monthStart(now, end + i - n + 1)) : Array.from({ length: yearLen }, (_, i) => new Date(Date.UTC(year, i, 1)));
  const first = months[0] < prevMonth ? months[0] : prevMonth;

  // Totals come from SQL over every own row (migration 0014); only the month's own rows are fetched, for the lists.
  const [rows, allCats, monthTxns, loans, savedMonths] = await Promise.all([
    moneyByMonth(supabase, ymd(first)),
    categories(),
    transactionsSince(ymd(month), ymd(monthStart(now, offset + 1))),
    loanPayments(supabase, user!.id, ymd(first)),
    savedByMonth(supabase, user!.id, ymd(first)),
  ]);
  // ponytail: "no transactions in 6 months" is treated as "no bank yet"; split the copy if linked-but-quiet accounts show up.
  if (!rows.length) return <EmptyBank title="See where your money goes" body="Link a bank to get a monthly breakdown by category." />;
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const BILLS = ["RENT_AND_UTILITIES", "LOAN_PAYMENTS"];
  const isBillCat = (id: string | null) => BILLS.includes(catById.get(id ?? "")?.key ?? "");
  const inMonth = (r: MonthRow, d: Date) => r.month.startsWith(ymd(d).slice(0, 7));
  const countedRow = (r: MonthRow) => includeBills || !isBillCat(r.category_id);
  const counted = (t: Txn) => isSpend(t) && (includeBills || !isBillCat(t.category_id));

  const loansIn = (d: Date) => loans.get(ymd(d).slice(0, 7)) ?? 0;
  // Everything that went out, whatever the Include bills switch says: loan payments too, since the money is gone.
  const bars = months.map((d) => ({ d, v: sumOf(rows.filter((r) => inMonth(r, d)), (r) => r.spend) + loansIn(d), income: sumOf(rows.filter((r) => inMonth(r, d)), (r) => r.income) }));

  const of = (d: Date, f: (r: MonthRow) => number, keep: (r: MonthRow) => boolean = () => true) => sumOf(rows.filter((r) => inMonth(r, d) && keep(r)), f);
  const total = of(month, (r) => r.spend, countedRow);
  const prevTotal = of(prevMonth, (r) => r.spend, countedRow);
  const income = of(month, (r) => r.income);
  const prevIncome = of(prevMonth, (r) => r.income);
  const billTotal = of(month, (r) => r.spend, (r) => isBillCat(r.category_id));
  const prevBills = of(prevMonth, (r) => r.spend, (r) => isBillCat(r.category_id));
  const spend = monthTxns.filter(counted);
  const allOut = of(month, (r) => r.spend) + loansIn(month);
  const savedIn = (d: Date) => savedMonths.get(ymd(d).slice(0, 7)) ?? 0;
  const anySaved = months.some((d) => savedIn(d) >= 1);
  const active = Math.max(1, bars.filter((b) => b.v > 0 || b.income > 0).length); // months before the first data don't drag the average down

  const byCat = new Map<string, { id: string; label: string; color: string; icon: string; v: number; prev: number }>();
  for (const [d, field] of [[month, "v"], [prevMonth, "prev"]] as const) {
    for (const r of rows.filter((r) => inMonth(r, d) && countedRow(r) && r.spend)) {
      const c = catById.get(r.category_id);
      if (!c) continue;
      const row = byCat.get(c.id) ?? { id: c.id, label: c.label, color: c.color, icon: c.icon, v: 0, prev: 0 };
      row[field] += r.spend;
      byCat.set(c.id, row);
    }
  }
  const cats = [...byCat.values()].filter((c) => c.v > 0).sort((a, b) => b.v - a.v);

  const largest = [...spend].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const freq = new Map<string, { n: number; v: number; t: Txn }>();
  for (const t of spend) {
    const k = `${displayName(t)}|${t.currency ?? ""}`; // one row per merchant and currency: never add currencies together
    const f = freq.get(k) ?? { n: 0, v: 0, t };
    freq.set(k, { n: f.n + 1, v: f.v + t.amount, t });
  }
  const frequent = [...freq].filter(([, f]) => f.n > 1).sort((a, b) => b[1].n - a[1].n).slice(0, 3);

  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const vs = (a: number, b: number) => (Math.abs(a - b) < 1 ? `Same as ${monthLabel(prevMonth)}` : `${money0(Math.abs(a - b))} ${a > b ? "more" : "less"} than ${monthLabel(prevMonth)}`);
  const qs = (o: Record<string, string | undefined>) => "/spending?" + new URLSearchParams(Object.entries({ m, bills, span, ...o }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2">
        {offset > -59 ? (
          <Link scroll={false} href={qs({ m: ymd(prevMonth).slice(0, 7) })} aria-label="Earlier month" className="size-9 rounded-full border border-line grid place-items-center text-muted hover:text-ink row-hover"><ChevronLeft size={18} /></Link>
        ) : <span className="size-9" />}
        <span className="min-w-36 text-center font-medium tabular-nums">{dateLabel(month, { month: "long", year: "numeric" })}</span>
        {offset < 0 ? (
          <Link scroll={false} href={qs({ m: offset === -1 ? "now" : ymd(monthStart(now, offset + 1)).slice(0, 7) })} aria-label="Later month" className="size-9 rounded-full border border-line grid place-items-center text-muted hover:text-ink row-hover"><ChevronRight size={18} /></Link>
        ) : <span className="size-9" />}
        {offset < -1 && <Link scroll={false} href={qs({ m: "now" })} className="text-sm text-muted hover:text-ink underline underline-offset-4 ml-1">This month</Link>}
      </div>

      <PageDates path="/spending" from="" to="" today={ymd(now)} />

      <nav aria-label="How much to show" className="pill-tabs max-w-full overflow-x-auto">
        {[
          { label: String(now.getUTCFullYear()), on: !n && year === now.getUTCFullYear(), href: qs({ span: undefined, m: "now" }) },
          { label: String(now.getUTCFullYear() - 1), on: !n && year === now.getUTCFullYear() - 1, href: qs({ span: undefined, m: `${now.getUTCFullYear() - 1}-12` }) },
          { label: "Last 12 months", on: n === 12, href: qs({ span: "12" }) },
          { label: "Last 6 months", on: n === 6, href: qs({ span: "6" }) },
        ].map((t) => <Link key={t.label} scroll={false} href={t.href} aria-current={t.on ? "true" : undefined} className={`pill-tab !py-1 !px-3 whitespace-nowrap ${t.on ? "pill-tab-active" : ""}`}>{t.label}</Link>)}
      </nav>

      <section className="card px-4 @lg:px-8 pt-6 pb-5">
        <MonthBars
          bars={bars.map((b) => ({
            key: ymd(b.d),
            label: monthLabel(b.d),
            v: b.v,
            income: b.income,
            active: ymd(b.d) === ymd(month),
            href: qs({ m: ymd(b.d).slice(0, 7) }),
          }))}
        />
      </section>

      <div className="space-y-3">
        <div className="section-label px-1">Month by month</div>
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="font-normal text-left pl-5 py-2.5">Month</th>
                <th className="font-normal text-right px-3">Income</th>
                <th className="font-normal text-right px-3">Expenses</th>
                <th className="font-normal text-right px-3">Left over</th>
                {anySaved && <th className="font-normal text-right pr-5 pl-3">Saved and invested</th>}
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => {
                const left = b.income - b.v;
                return (
                  <tr key={ymd(b.d)} className="border-b border-line last:border-0 tabular">
                    <td className="pl-5 py-3"><Link scroll={false} href={qs({ m: ymd(b.d).slice(0, 7) })} className="hover:underline underline-offset-2">{monthLabel(b.d)}</Link></td>
                    <td className="text-right px-3">{money0(b.income)}</td>
                    <td className="text-right px-3">{money0(b.v)}</td>
                    <td className={`text-right px-3 font-medium ${left < 0 ? "text-bad" : ""}`}>{left < 0 ? "-" : ""}{money0(Math.abs(left))}</td>
                    {anySaved && <td className="text-right pr-5 pl-3">{money0(savedIn(b.d))}</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="tabular font-medium border-t border-line">
                <td className="pl-5 py-3">Total</td>
                <td className="text-right px-3">{money0(sumOf(bars, (b) => b.income))}</td>
                <td className="text-right px-3">{money0(sumOf(bars, (b) => b.v))}</td>
                <td className={`text-right px-3 ${sumOf(bars, (b) => b.income - b.v) < 0 ? "text-bad" : ""}`}>{sumOf(bars, (b) => b.income - b.v) < 0 ? "-" : ""}{money0(Math.abs(sumOf(bars, (b) => b.income - b.v)))}</td>
                {anySaved && <td className="text-right pr-5 pl-3">{money0(sumOf(bars, (b) => savedIn(b.d)))}</td>}
              </tr>
              <tr className="tabular text-muted border-t border-line">
                <td className="pl-5 py-3">Average a month</td>
                <td className="text-right px-3">{money0(sumOf(bars, (b) => b.income) / active)}</td>
                <td className="text-right px-3">{money0(sumOf(bars, (b) => b.v) / active)}</td>
                <td className="text-right px-3">{sumOf(bars, (b) => b.income - b.v) < 0 ? "-" : ""}{money0(Math.abs(sumOf(bars, (b) => b.income - b.v)) / active)}</td>
                {anySaved && <td className="text-right pr-5 pl-3">{money0(sumOf(bars, (b) => savedIn(b.d)) / active)}</td>}
              </tr>
            </tfoot>
          </table>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.6fr_1fr] items-start">
        <div className="space-y-6">
        <div className="space-y-3">
          <div className="section-label px-1">Spending breakdown</div>
          <section className="card p-6 space-y-6">
            <div className="flex justify-end">
              <Link scroll={false} href={qs({ bills: includeBills ? "0" : undefined })} className="flex items-center gap-2 text-sm">
                Include bills
                <span className={`w-10 h-6 rounded-full p-0.5 transition ${includeBills ? "bg-good" : "bg-line"}`}>
                  <span className={`block size-5 rounded-full bg-white shadow transition ${includeBills ? "translate-x-4" : ""}`} />
                </span>
              </Link>
            </div>
            {cats.length ? (
              <Breakdown slices={cats} total={total} change={change} prevLabel={monthLabel(prevMonth)} monthParam="" />
            ) : (
              <p className="text-sm text-muted text-center py-10">No spending in {monthLabel(month)} yet.</p>
            )}
          </section>
        </div>
        <IncomeSources txns={monthTxns} range={`&from=${ymd(month)}&to=${ymd(new Date(monthStart(now, offset + 1).getTime() - 864e5))}`} />
        </div>

        <div className="space-y-6">
          <Summary rows={[
            { icon: CirclePlus, label: "Income", sub: vs(income, prevIncome), v: income },
            { icon: ReceiptText, label: "Bills", sub: vs(billTotal, prevBills), v: billTotal },
            { icon: CircleMinus, label: "Spending", sub: vs(total, prevTotal), v: total },
            ...(loansIn(month) >= 1 || loansIn(prevMonth) >= 1 ? [{ icon: Landmark, label: "Loan payments", sub: vs(loansIn(month), loansIn(prevMonth)), v: loansIn(month) }] : []),
            { icon: Scale, label: income - allOut >= 0 ? "Left over" : "Spent more than came in", sub: "Income minus everything that went out", v: Math.abs(income - allOut) },
            ...(savedIn(month) >= 1 || savedIn(prevMonth) >= 1 ? [{ icon: PiggyBank, label: "Saved and invested", sub: vs(savedIn(month), savedIn(prevMonth)), v: savedIn(month) }] : []),
          ]} />

          {!!frequent.length && (
            <div className="space-y-3">
              <div className="section-label px-1">Frequent Spend</div>
              <section className="card overflow-hidden">
                <p className="px-5 py-4 text-sm text-muted border-b border-line">
                  You&apos;ve spent at {displayName(frequent[0][1].t)} {frequent[0][1].n} times {offset ? `in ${dateLabel(month, { month: "long" })}` : "this month"}.
                </p>
                {frequent.map(([k, f]) => (
                  <div key={k} className="flex items-center gap-4 px-5 py-3 border-b border-line last:border-0">
                    <span className="size-9 rounded-full bg-canvas grid place-items-center text-xs font-semibold">{f.n}x</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{displayName(f.t)}</div>
                      <div className="text-xs text-muted">Average {money(f.v / f.n, f.t.currency)}</div>
                    </div>
                    <span className="tabular font-medium">{money(f.v, f.t.currency)}</span>
                  </div>
                ))}
              </section>
            </div>
          )}

          {!!largest.length && (
            <div className="space-y-3">
              <div className="section-label px-1">Largest Purchases</div>
              <section className="card overflow-hidden">
                {largest.map((t) => (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-3 border-b border-line last:border-0">
                    <Merchant name={displayName(t)} logo={t.logo_url} color={t.category?.color} icon={t.category?.icon} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{displayName(t)}</div>
                      <div className="text-xs text-muted">{Math.round((t.amount / total) * 100)}% of spend</div>
                    </div>
                    <span className="tabular font-medium">{money(t.amount, t.currency)}</span>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
