import Link from "next/link";
import { DebtFields } from "@/components/DebtFields";
import { PageDates } from "@/components/PageDates";
import { allRows, getUser, loanPayments, today } from "@/lib/data";
import { debtFacts, debtMonths, monthsAfter, payoff, type DebtRow } from "@/lib/debt";
import { dateLabel, money0, monthStart, plural, ymd } from "@/lib/format";

type Acct = { id: string; name: string; custom_name: string | null; type: string; subtype: string | null; balance: number | null; apr: number | null; debt_payment: number | null };
const KIND: Record<string, string> = { student: "Student loan", auto: "Car loan", mortgage: "Mortgage" };
const span = (months: number) => (months < 12 ? plural(months, "month") : `${plural(Math.floor(months / 12), "year")}${months % 12 ? `, ${plural(months % 12, "month")}` : ""}`);

// What you owe, what you've been paying and what it costs. Interest comes from the transactions; a loan's interest is
// usually inside its payment, so that part needs the rate the user types in. There's no balance history to chart yet.
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function Debt({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const from = DAY.test(sp.from ?? "") ? sp.from! : "", to = DAY.test(sp.to ?? "") ? sp.to! : "";
  const { supabase, user } = await getUser();
  const uid = user!.id;
  const now = await today();
  const yearAgo = ymd(monthStart(now, -11));
  // The window for the totals and chart: the last 12 months, or the dates picked. Balances and payoffs are always as of today.
  const custom = !!(from || to);
  const start = from || yearAgo, end = to || ymd(now);
  const [{ data }, loans] = await Promise.all([
    supabase.from("accounts").select("id, name, custom_name, type, subtype, balance:home_balance, apr, debt_payment").eq("user_id", uid).in("type", ["credit", "loan"]),
    loanPayments(supabase, uid, start, end),
  ]);
  const accounts = (data ?? []) as Acct[];
  const debts = accounts.map((a) => ({ ...a, owed: Math.abs(Number(a.balance ?? 0)) })).filter((a) => a.owed >= 1);

  if (!debts.length)
    return (
      <div className="card p-8 max-w-xl space-y-3">
        <h2 className="text-xl font-semibold">No debt to track</h2>
        <p className="text-sm text-muted">Link a card or loan, or add one by hand, and this page shows what you owe, what you&apos;re paying and what it costs.</p>
        <Link href="/accounts/add" className="btn-primary inline-block">Add a debt</Link>
      </div>
    );

  const raw = await allRows<{ date: string; amount: number; name: string; plaid_category: string | null; account_id: string; category: { key: string } | null }>((a, b) =>
    supabase.from("transactions").select("date, amount, name, plaid_category, account_id, category:categories(key)").eq("user_id", uid).eq("ignored", false).gte("date", from && from < yearAgo ? from : yearAgo).in("account_id", accounts.map((x) => x.id)).order("id").range(a, b));
  const rows: DebtRow[] = raw.map((r) => ({ date: r.date, amount: Number(r.amount), name: r.name, plaid_category: r.plaid_category, account_id: r.account_id, key: r.category?.key ?? null }));

  const inRange = rows.filter((r) => r.date >= start && r.date <= end);
  const monthCount = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
  const months = Array.from({ length: Math.max(1, monthCount) }, (_, i) => monthsAfter(start, i));
  const history = debtMonths(inRange, accounts, loans, months);
  const firstUsed = history.findIndex((m) => m.paid > 0 || m.interest > 0);
  const shown = firstUsed < 0 ? [] : history.slice(firstUsed);
  const top = Math.max(1, ...shown.map((m) => m.paid));
  const last12 = Array.from({ length: 12 }, (_, i) => monthsAfter(yearAgo, i));
  const fullMonths = last12.slice(-4, -1); // the last 3 finished months, whatever dates are picked: "usual" means lately

  const items = debts.map((d) => {
    const f = debtFacts(rows, d.id, fullMonths);
    const rangeInterest = debtFacts(inRange, d.id, []).interest;
    // A card's payment often just clears new spending, so only what the user typed predicts its payoff.
    const payment = d.debt_payment != null ? Number(d.debt_payment) : d.type === "loan" && f.usualPayment >= 1 ? f.usualPayment : null;
    const apr = d.apr == null ? null : Number(d.apr);
    const plan = payoff(d.owed, apr, payment);
    const faster = plan && !plan.never ? payoff(d.owed, apr, payment! + 50) : null;
    return { ...d, f, rangeInterest, payment, apr, plan, faster, monthlyInterest: apr == null ? null : (d.owed * apr) / 1200 };
  }).sort((a, b) => (b.apr ?? -1) - (a.apr ?? -1) || b.owed - a.owed);

  const owed = debts.reduce((s, d) => s + d.owed, 0);
  const counted = history.slice(0, -1).slice(-3);
  const monthly = counted.reduce((s, m) => s + m.paid, 0) / Math.max(1, counted.length);
  const paidTotal = history.reduce((s, m) => s + m.paid, 0);
  const label = (d: string) => dateLabel(d, { month: "short", day: "numeric", year: "numeric" });
  const when = custom ? `${label(start)} to ${label(end)}` : "last 12 months";
  const yearInterest = history.reduce((s, m) => s + m.interest, 0);
  const toGo = items.reduce((s, d) => s + (d.plan && !d.plan.never ? d.plan.interest : 0), 0);
  const known = items.filter((d) => d.plan && !d.plan.never).length;
  const worst = items.find((d) => d.apr != null);

  return (
    <div className="max-w-4xl space-y-6">
      <PageDates path="/debt" from={from} to={to} today={ymd(now)} />
      <section className="card overflow-hidden">
        {[
          { label: "You owe", value: money0(owed) },
          custom ? { label: `Paid, ${when}`, value: money0(paidTotal) } : { label: "Paid each month, on average", value: money0(monthly) },
          { label: `Interest charged, ${when}`, value: money0(yearInterest), bad: yearInterest >= 1 },
          ...(known ? [{ label: `Interest still to pay on ${plural(known, "debt")}, at these payments`, value: money0(toGo), bad: toGo >= 1 }] : []),
        ].map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line last:border-0">
            <span>{s.label}</span>
            <span className={`tabular font-medium ${s.bad ? "text-bad" : ""}`}>{s.value}</span>
          </div>
        ))}
      </section>

      {!!shown.length && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="section-label">What you paid each month{custom ? `, ${when}` : ""}</div>
            <div className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart)" }} />Payments</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--bad)" }} />Interest</span>
            </div>
          </div>
          <section className="card p-5 md:p-6">
            <div className="flex items-end gap-1.5 @lg:gap-3 h-40" role="img" aria-label={shown.map((m) => `${m.month}: paid ${money0(m.paid)}, interest ${money0(m.interest)}`).join("; ")}>
              {shown.map((m) => (
                <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] tabular text-muted truncate max-w-full">{m.paid >= 1 ? money0(m.paid) : ""}</span>
                  <div className="w-full max-w-10 flex-1 flex items-end justify-center gap-0.5">
                    <div className="flex-1 rounded-t" style={{ height: `${(m.paid / top) * 100}%`, minHeight: 2, background: "var(--chart)" }} />
                    {m.interest >= 1 && <div className="flex-1 rounded-t" style={{ height: `${Math.max(3, (m.interest / top) * 100)}%`, background: "var(--bad)" }} />}
                  </div>
                  <span className="text-[11px] text-muted">{dateLabel(`${m.month}-01`, { month: "short" })}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="space-y-3">
        <div className="section-label px-1">Your debts</div>
        {items.map((d) => (
          <section key={d.id} className="card p-5 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.custom_name || d.name}</div>
                <div className="text-sm text-muted">{d.type === "credit" ? "Credit card" : KIND[d.subtype ?? ""] ?? "Loan"}{d.id === worst?.id && items.filter((x) => x.apr != null).length > 1 ? " · highest rate, so extra money usually does most here" : ""}</div>
              </div>
              <div className="text-xl font-semibold tabular shrink-0">{money0(d.owed)}</div>
            </div>
            <div className="space-y-1 text-sm">
              {d.type === "credit" && (d.f.carrying
                ? <p>You&apos;ve been charged interest lately, so you&apos;re <span className="text-bad font-medium">carrying a balance</span>.</p>
                : <p>No interest in the last 3 months. Paying it in full each month costs you nothing.</p>)}
              {d.rangeInterest >= 1 && <p>{money0(d.rangeInterest)} in interest, {when}.</p>}
              {d.monthlyInterest != null && d.monthlyInterest >= 1 && <p>About {money0(d.monthlyInterest)} of interest a month at this balance.</p>}
              {d.plan?.never && <p className="text-bad">This payment doesn&apos;t cover the interest, so the balance won&apos;t go down.</p>}
              {d.plan && !d.plan.never && <p>Paid off in <span className="font-medium">{span(d.plan.months)}</span> ({dateLabel(`${monthsAfter(ymd(now), d.plan.months)}-01`, { month: "short", year: "numeric" })}), with <span className="font-medium">{money0(d.plan.interest)}</span> of interest still to pay.</p>}
              {d.plan && !d.plan.never && d.faster && !d.faster.never && d.plan.months - d.faster.months >= 1 && <p className="text-muted">Paying {money0(50)} more a month: {span(d.plan.months - d.faster.months)} sooner, {money0(d.plan.interest - d.faster.interest)} less interest.</p>}
              {d.apr == null && <p className="text-muted">Add the rate from your statement to see when this is paid off and what it will cost.</p>}
              {d.apr != null && d.payment == null && <p className="text-muted">Add what you pay each month to see when this is paid off.</p>}
            </div>
            <DebtFields id={d.id} apr={d.apr} payment={d.debt_payment == null ? null : Number(d.debt_payment)} guess={d.f.usualPayment} />
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/accounts/add" className="btn">Add a debt</Link>
        <p className="text-xs text-muted">Estimates from what you entered. A rate can change, and new spending on a card changes the date. Not financial advice.</p>
      </div>
    </div>
  );
}
