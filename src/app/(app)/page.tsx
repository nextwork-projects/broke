import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Amount, CountUp, HideMoney } from "@/components/Amount";
import { CashChart } from "@/components/CashChart";
import { CategoryCheck, type Checks } from "@/components/CategoryCheck";
import { CountryBanner } from "@/components/CountryPicker";
import { EmptyBank } from "@/components/EmptyBank";
import { GoLiveCard } from "@/components/GoLiveCard";
import { Merchant } from "@/components/Merchant";
import { PayFound } from "@/components/PayFound";
import { PayQuestion } from "@/components/PayQuestion";
import { SyncButton } from "@/components/PlaidButtons";
import { TxnList } from "@/components/TxnList";
import { WeekCard } from "@/components/WeekCard";
import { accountName, categories, getUser, isIncome, isSpend, moneyByMonth, today, transactionsSince, TXN_SELECT, withAccountNames, type Txn } from "@/lib/data";
import { dateLabel, money, money0, monthStart, ymd } from "@/lib/format";
import { addDays, cashSeries, flows, forecast, relDay, weekVsUsual } from "@/lib/home";
import { deterministicMoves, ladder } from "@/lib/plan";
import { myPlanFacts } from "@/lib/plan-facts";
import { payGuess } from "@/lib/pay";
import { moneyPicture } from "@/lib/steps";
import { fetchChecks } from "@/lib/unsure";

// "Is this right?", collapsed to one line, only when a category waits to be checked. It streams, so it never holds the page.
async function HomeCheck({ checks }: { checks: Promise<Checks> }) {
  const c = await checks;
  return c.total > 0 ? <CategoryCheck initial={c} closed /> : null;
}

// Pay the bank filed as something else (lib/pay.ts). Streams in beside the rest.
async function PayCheck({ uid, today, notPay }: { uid: string; today: string; notPay: string[] }) {
  const { supabase } = await getUser();
  const since = ymd(new Date(Date.parse(today) - 90 * 864e5));
  const { data } = await supabase.from("transactions").select("date, amount, name, merchant_name, custom_name, category:categories(id, key, label, kind)")
    .eq("user_id", uid).eq("ignored", false).lt("amount", -200).gte("date", since).limit(500);
  type R = { date: string; amount: number; name: string; merchant_name: string | null; custom_name: string | null; category: { key: string; label: string; kind: string } | null };
  const rows = (data ?? []) as unknown as R[];
  const name = (r: R) => r.merchant_name ?? r.name;
  const pay = payGuess(rows.map((r) => ({ name: name(r), date: r.date, amount: Number(r.amount), kind: r.category?.kind ?? null })), notPay);
  if (!pay) return null;
  const { data: income } = await supabase.from("categories").select("id").eq("key", "INCOME").is("user_id", null).maybeSingle();
  if (!income) return null;
  const filedAs = rows.find((r) => name(r) === pay.name)?.category?.label ?? "something else";
  return <PayFound pay={pay} filedAs={filedAs} incomeId={income.id as string} notPay={notPay} />;
}

// One line pointing at the plan, or the one question broke needs answered. Streams in: the plan facts are the slow part.
async function NextStep({ profile }: { profile: Record<string, unknown> }) {
  const facts = await myPlanFacts();
  if (ladder(facts).spare == null) return <section className="card p-5 space-y-3"><p className="font-medium">What do you get paid?</p><PayQuestion profile={profile} /></section>;
  const next = deterministicMoves(facts, money0)[0];
  if (!next) return null;
  return (
    <Link href="/plan" className="card-link px-5 py-3.5 flex items-center gap-3">
      <span className="text-sm text-muted shrink-0">Next</span>
      <span className="flex-1 min-w-0 truncate">{next.title}</span>
      <ChevronRight size={18} className="text-muted shrink-0" />
    </Link>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

type Item = { institution_name: string | null; institution_logo: string | null; institution_color: string | null; last_synced_at: string | null } | null;
type Acct = { id: string; name: string; custom_name: string | null; mask: string | null; type: string; subtype: string | null; current_balance: number | null; included: boolean; item: Item };
type Stream = { id: string; merchant_name: string; logo_url: string | null; average_amount: number; last_date: string | null; next_date: string | null; is_income: boolean };

// Home is for a glance: cash and where it's heading, the accounts, what went out this month, the bills, the latest spending.
// The working pages (Spending, Budgets, Money plan) are one click away. Two-card rows stretch to one height (Max, 2026-11-10).
export default async function Dashboard() {
  const { supabase, user } = await getUser();
  const uid = user!.id;
  const profile = user?.user_metadata?.profile;
  const now = await today(); // the user's date at UTC midnight: read it with getUTC* and ymd
  const day = ymd(now), month = day.slice(0, 7);
  const checks = (fetchChecks(supabase, uid, day) as Promise<Checks>).catch(() => ({ rows: [], total: 0 })); // starts now, beside the queries below

  // Own rows only: an account a partner shares is on the Accounts page, not in your totals.
  const [{ data: recent }, { data: accounts }, { data: noRate }, { data: streams }, { data: first }, rows, cats, last62] = await Promise.all([
    supabase.from("transactions").select(TXN_SELECT).eq("user_id", uid).order("date", { ascending: false }).order("id").limit(12),
    supabase.from("accounts").select("id, name, custom_name, mask, type, subtype, current_balance:home_balance, included, item:plaid_items(institution_name, institution_logo, institution_color, last_synced_at)").eq("user_id", uid),
    supabase.rpc("fx_missing"),
    supabase.from("recurring").select("id, merchant_name, logo_url, average_amount:home_average, last_date, next_date, is_income").eq("user_id", uid).eq("active", true).neq("status", "TOMBSTONED"),
    supabase.from("transactions").select("date").eq("user_id", uid).order("date").limit(1),
    moneyByMonth(supabase, ymd(monthStart(now))),
    categories(),
    transactionsSince(addDays(day, -62)),
  ]);

  if (!accounts?.length) return <EmptyBank />;

  const accts = accounts as unknown as Acct[];
  const sum = (list: Acct[]) => list.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
  const cashAccts = accts.filter((a) => a.included && a.type === "depository" && a.subtype !== "savings");
  const cashIds = new Set(cashAccts.map((a) => a.id));
  const cash = sum(cashAccts);
  const debts = accts.filter((a) => a.included && (a.type === "credit" || a.type === "loan"));
  const owed = Math.abs(sum(debts));
  const assets = sum(accts.filter((a) => a.included && !debts.includes(a)));
  const synced = accts.map((a) => a.item?.last_synced_at).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const banks = new Set(accts.map((a) => a.item?.institution_name).filter(Boolean));

  // The cash line: today's cash balance walked back through what moved those accounts. Forecast: bills before payday, then pay.
  const series = cashSeries(cash, last62.filter((t) => t.account && cashIds.has(t.account.id)).map((t) => ({ date: t.date, amount: Number(t.amount) })), day, 31);
  const all = (streams ?? []) as unknown as Stream[];
  const pay = all.filter((s) => s.is_income && s.next_date && s.next_date > day).sort((a, b) => a.next_date!.localeCompare(b.next_date!))[0];
  const bills = all.filter((s) => !s.is_income);
  const fc = cashAccts.length ? forecast(cash, day, bills.filter((b) => b.next_date).map((b) => ({ date: b.next_date!, amount: Math.abs(Number(b.average_amount)) })), pay ? { date: pay.next_date!, amount: Math.abs(Number(pay.average_amount)) } : null) : null;
  const moneyRows = last62.filter((t) => isSpend(t) || isIncome(t)).map((t) => ({ date: t.date, amount: Number(t.amount) }));
  const flowsBy = { 7: flows(moneyRows, day, 7), 31: flows(moneyRows, day, 31) };
  const week = weekVsUsual(last62.filter(isSpend).map((t) => ({ date: t.date, amount: Number(t.amount) })), day, (first?.[0]?.date as string | undefined) ?? null);
  const under = week ? week.thisWeek <= week.usual : true;

  // Bills this month: the ones already paid (ticked, faded), then the ones still to come.
  const paid = bills.filter((b) => b.last_date?.startsWith(month) && b.last_date <= day).sort((a, b) => a.last_date!.localeCompare(b.last_date!));
  const due = bills.filter((b) => b.next_date?.startsWith(month) && b.next_date >= day && !paid.includes(b)).sort((a, b) => a.next_date!.localeCompare(b.next_date!));
  const monthBills = [...paid.map((b) => ({ b, done: true, date: b.last_date! })), ...due.map((b) => ({ b, done: false, date: b.next_date! }))];

  const pic = moneyPicture(rows, cats, month, null);
  const txns = withAccountNames((recent ?? []) as unknown as Txn[]);
  const monthName = dateLabel(day, { month: "long" });
  const short = (iso: string) => dateLabel(iso, { month: "short", day: "numeric" });
  const clean = (n: string) => n.replace(/\s*\(\s*\)\s*$/, "");
  const Soon = ({ date }: { date: string }) => (relDay(date, day) ? <span className="rounded-full bg-brand-soft text-brand text-[11px] font-medium px-2 py-0.5 shrink-0 soon">{relDay(date, day)}</span> : null);

  return (
    <div className="space-y-4">
      <GoLiveCard country={profile?.country} userId={user?.id} />
      {!profile?.country && <CountryBanner profile={profile ?? {}} />}
      {!!noRate?.length && <p className="card px-5 py-3 text-sm text-muted">Totals leave out money in {(noRate as string[]).join(", ")}. No exchange rate is available for it.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <SyncButton />
        <Link href="/transactions" className="btn">Activity</Link>
        <Link href="/transactions/rules" className="btn">Rules</Link>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted">
          {synced && <span className="flex items-center gap-2"><i className="size-1.5 rounded-full bg-good shadow-[0_0_0_3px_var(--color-green-100)]" />Synced {ago(synced)}</span>}
          <HideMoney />
        </span>
      </div>

      <Suspense fallback={null}><PayCheck uid={uid} today={day} notPay={(user?.user_metadata?.not_pay as string[] | undefined) ?? []} /></Suspense>
      <Suspense fallback={null}><NextStep profile={profile ?? {}} /></Suspense>
      <Suspense fallback={null}><HomeCheck checks={checks} /></Suspense>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[1.4fr_1fr] items-stretch">
        {cashAccts.length ? <CashChart balance={cash} series={series} forecast={fc} payday={pay?.next_date ?? null} flows={flowsBy} /> : (
          <section className="card p-5"><span className="text-sm text-muted">Cash</span><p className="text-sm text-muted mt-2">Add a checking account to see your cash over time.</p></section>
        )}
        <section className="card p-5 flex flex-col">
          <div className="flex items-baseline justify-between gap-3"><span className="text-sm text-muted">Accounts</span><Link href="/accounts" className="text-sm text-muted hover:text-ink">View all</Link></div>
          <ul className="mt-1">
            {accts.filter((a) => a.included).slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 border-b border-line/70 last:border-0">
                <Merchant name={a.item?.institution_name ?? accountName(a)} logo={a.item?.institution_logo ? `data:image/png;base64,${a.item.institution_logo}` : null} color={a.item?.institution_color} />
                <span className="flex-1 min-w-0"><span className="block truncate">{accountName(a)}</span><span className="block text-xs text-muted truncate">{[a.item?.institution_name, a.mask && `··${a.mask}`, debts.includes(a) && "owed"].filter(Boolean).join(" · ")}</span></span>
                <Amount text={money(Math.abs(Number(a.current_balance ?? 0)))} className="font-medium tabular" />
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 pt-2.5"><span className="text-muted">Net worth</span><Amount text={money(assets - owed)} className="font-medium tabular" /></li>
          </ul>
          <div className="mt-auto pt-3.5 border-t border-line/70 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{[banks.size ? `${banks.size} ${banks.size === 1 ? "bank" : "banks"}` : null, `${accts.length} ${accts.length === 1 ? "account" : "accounts"}`, synced && `synced ${ago(synced)}`].filter(Boolean).join(" · ")}</span>
            <Link href="/accounts/add" className="font-medium hover:text-ink">Add account</Link>
          </div>
        </section>
      </div>

      <h2 className="card-title pt-4">Money movement <span className="text-sm font-normal text-muted ml-1.5">{monthName}</span></h2>
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 items-stretch">
        <section className="card p-5 flex flex-col">
          <div className="flex items-baseline justify-between gap-3"><span className="text-sm text-muted">Money out</span><Link href="/spending" className="text-sm text-muted hover:text-ink">See all</Link></div>
          <CountUp value={pic.spent} className="figure" />
          {week && (
            <>
              <span className={`chip mt-1.5 w-max rounded-full px-2 py-0.5 text-xs font-medium ${under ? "bg-green-50 text-good" : "bg-red-50 text-bad"}`}>
                {under ? "↓" : "↑"} {Math.round(Math.abs(1 - week.thisWeek / week.usual) * 100)}% {under ? "under" : "over"} your usual week
              </span>
              <div className="relative h-1.5 rounded-full bg-[var(--hover-strong)] mt-3 bar" aria-hidden>
                <i className="absolute inset-y-0 left-0 rounded-full bg-chart" style={{ width: `${Math.min(100, (week.thisWeek / (week.usual * 1.2)) * 100)}%` }} />
                <b className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `${100 / 1.2}%` }} />
              </div>
              <div className="flex justify-between gap-3 text-xs text-muted mt-1"><span>Last 7 days <span className="money">{money0(week.thisWeek)}</span></span><span>Usual week <span className="money">{money0(week.usual)}</span></span></div>
            </>
          )}
          {pic.spent > 0 ? (
            <ul className="mt-4 space-y-3 text-sm">
              {pic.slices.map((s) => (
                <li key={s.label}>
                  <div className="flex justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0"><span className="size-2 rounded-full shrink-0" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span>
                    <Amount text={money(s.amount)} className="tabular" />
                  </div>
                  <div className="h-1 rounded-full bg-[var(--hover-strong)] mt-1.5 overflow-hidden bar" aria-hidden><i className="block h-full rounded-full" style={{ width: `${(s.amount / pic.slices[0].amount) * 100}%`, background: s.color }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted mt-3">Nothing yet this month.</p>}
        </section>

        <section className="card p-5 flex flex-col">
          <div className="flex items-baseline justify-between gap-3"><span className="text-sm text-muted">Bills this month</span><Link href="/recurring" className="text-sm text-muted hover:text-ink">Recurring</Link></div>
          {monthBills.length ? (
            <>
              <div className="flex items-center gap-2 text-xs text-muted mt-1">
                <span>{paid.length} of {monthBills.length} paid</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--hover-strong)] overflow-hidden bar"><i className="block h-full rounded-full bg-good" style={{ width: `${(paid.length / monthBills.length) * 100}%` }} /></div>
              </div>
              <ul className="mt-2">
                {monthBills.slice(0, 7).map(({ b, done, date }) => (
                  <li key={b.id} className={`flex items-center gap-3 py-2.5 border-b border-line/70 last:border-0 text-sm ${done ? "opacity-55" : ""}`}>
                    <Merchant name={clean(b.merchant_name)} logo={b.logo_url} />
                    <span className="flex-1 min-w-0"><span className="flex items-center gap-1.5"><span className="truncate">{clean(b.merchant_name)}</span>{done && <Check size={14} className="text-good shrink-0" aria-label="Paid" />}</span><span className="block text-xs text-muted">{done ? `Paid ${short(date)}` : short(date)}</span></span>
                    {!done && <Soon date={date} />}
                    <Amount text={money(Math.abs(Number(b.average_amount)))} className="tabular shrink-0" />
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-muted mt-2">No bills found this month yet.</p>}
          {pay && (
            <div className="mt-auto pt-4">
              <span className="text-sm text-muted">Money in</span>
              <div className="flex items-center gap-3 py-2.5 text-sm">
                <Merchant name={clean(pay.merchant_name)} logo={pay.logo_url} />
                <span className="flex-1 min-w-0"><span className="block truncate">{clean(pay.merchant_name)}</span>{pay.last_date && <span className="block text-xs text-muted">Last paid {short(pay.last_date)}</span>}</span>
                <Soon date={pay.next_date!} />
                <Amount text={`+${money(Math.abs(Number(pay.average_amount)))}`} className="tabular text-good shrink-0" />
              </div>
            </div>
          )}
        </section>
      </div>

      <WeekCard />

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
          <span className="card-title">Latest spending</span>
          <Link href="/transactions" className="text-sm text-muted hover:text-ink">See all</Link>
        </div>
        {txns.length ? <TxnList txns={txns} today={day} /> : <p className="px-5 pb-5 text-sm text-muted">No transactions yet. Press sync in a minute.</p>}
      </section>
    </div>
  );
}
