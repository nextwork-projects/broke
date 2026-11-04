import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryCheck, type Checks } from "@/components/CategoryCheck";
import { CountryBanner } from "@/components/CountryPicker";
import { EmptyBank } from "@/components/EmptyBank";
import { GoLiveCard } from "@/components/GoLiveCard";
import { Merchant } from "@/components/Merchant";
import { PayQuestion } from "@/components/PayQuestion";
import { SyncButton } from "@/components/PlaidButtons";
import { TxnList } from "@/components/TxnList";
import { categories, getUser, moneyByMonth, today, TXN_SELECT, withAccountNames, type Txn } from "@/lib/data";
import { dateLabel, money0, monthStart, ymd } from "@/lib/format";
import { deterministicMoves, ladder } from "@/lib/plan";
import { myPlanFacts } from "@/lib/plan-facts";
import { moneyPicture } from "@/lib/steps";
import { fetchChecks } from "@/lib/unsure";

// "Is this right?", collapsed to one line, only when a category waits to be checked. It streams, so it never holds the page.
async function HomeCheck({ checks }: { checks: Promise<Checks> }) {
  const c = await checks;
  return c.total > 0 ? <CategoryCheck initial={c} closed /> : null;
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

// Home is for a glance: what you have, what went out this month, what's coming up, what you spent last.
// The working pages (Spending, Budgets, Money plan) are one click away.
export default async function Dashboard() {
  const { supabase, user } = await getUser();
  const uid = user!.id;
  const profile = user?.user_metadata?.profile;
  const now = await today(); // the user's date at UTC midnight: read it with getUTC* and ymd
  const day = ymd(now), soon = ymd(new Date(now.getTime() + 14 * 864e5));
  const checks = (fetchChecks(supabase, uid, day) as Promise<Checks>).catch(() => ({ rows: [], total: 0 })); // starts now, beside the queries below

  // Own rows only: an account a partner shares is on the Accounts page, not in your totals.
  const [{ data: recent }, { data: accounts }, { data: noRate }, { data: bills }, rows, cats] = await Promise.all([
    supabase.from("transactions").select(TXN_SELECT).eq("user_id", uid).order("date", { ascending: false }).order("id").limit(5),
    supabase.from("accounts").select("type, subtype, current_balance:home_balance, included").eq("user_id", uid),
    supabase.rpc("fx_missing"),
    supabase.from("recurring").select("id, merchant_name, logo_url, average_amount:home_average, next_date").eq("user_id", uid).eq("active", true).eq("is_income", false).neq("status", "TOMBSTONED").gte("next_date", day).lte("next_date", soon).order("next_date").limit(4),
    moneyByMonth(supabase, ymd(monthStart(now))),
    categories(),
  ]);

  if (!accounts?.length) return <EmptyBank />;

  const txns = withAccountNames((recent ?? []) as unknown as Txn[]);
  type Acct = { type: string; subtype: string | null };
  const bal = (pred: (a: Acct) => boolean) => {
    const list = accounts.filter((a) => a.included && pred(a));
    return list.length ? list.reduce((s, a) => s + Number(a.current_balance ?? 0), 0) : null;
  };
  const owed = bal((a) => a.type === "credit" || a.type === "loan");
  const tiles = [
    { label: "In your bank", value: bal((a) => a.type === "depository" && a.subtype !== "savings"), href: "/accounts" },
    { label: "Savings", value: bal((a) => a.type === "depository" && a.subtype === "savings"), href: "/accounts" },
    { label: "Investments", value: bal((a) => a.type === "investment"), href: "/accounts" },
    { label: "You owe", value: owed == null ? null : Math.abs(owed), href: "/debt" },
  ].filter((t) => t.value != null);

  const pic = moneyPicture(rows, cats, ymd(monthStart(now)).slice(0, 7), null);
  const monthName = dateLabel(day, { month: "long" });

  return (
    <div className="space-y-4 max-w-4xl">
      <GoLiveCard country={profile?.country} userId={user?.id} />
      {!profile?.country && <CountryBanner profile={profile ?? {}} />}
      {!!noRate?.length && <p className="card px-5 py-3 text-sm text-muted">Totals leave out money in {(noRate as string[]).join(", ")}. No exchange rate is available for it.</p>}

      <section className={`card overflow-hidden grid grid-cols-2 ${tiles.length >= 4 ? "@3xl:grid-cols-4" : tiles.length === 3 ? "@3xl:grid-cols-3" : ""}`}>
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="row-hover p-5 space-y-1">
            <span className="block text-sm text-muted">{t.label}</span>
            <span className="block text-2xl font-semibold tabular tracking-[-0.02em]">{money0(t.value!)}</span>
          </Link>
        ))}
      </section>

      <Suspense fallback={null}><NextStep profile={profile ?? {}} /></Suspense>
      <Suspense fallback={null}><HomeCheck checks={checks} /></Suspense>

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 items-start">
        <section className="card p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">Spent in {monthName}</span>
            <Link href="/spending" className="text-sm text-muted hover:text-ink">See all</Link>
          </div>
          <p className="text-2xl font-semibold tabular tracking-[-0.02em]">{money0(pic.spent)}</p>
          {pic.spent > 0 ? (
            <>
              <div className="flex h-2 gap-0.5 rounded-full overflow-hidden" aria-hidden>
                {pic.slices.map((s) => <div key={s.label} style={{ width: `${(s.amount / pic.spent) * 100}%`, background: s.color }} />)}
              </div>
              <ul className="space-y-1.5 text-sm">
                {pic.slices.slice(0, 3).map((s) => (
                  <li key={s.label} className="flex justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0"><span className="size-2 rounded-full shrink-0" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span>
                    <span className="tabular text-muted">{money0(s.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-muted">Nothing yet this month.</p>}
        </section>

        <section className="card p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">Coming up</span>
            <Link href="/recurring" className="text-sm text-muted hover:text-ink">See all</Link>
          </div>
          {bills?.length ? (
            <ul className="space-y-2.5">
              {bills.map((b) => (
                <li key={b.id as string} className="flex items-center gap-3 text-sm">
                  <Merchant name={b.merchant_name as string} logo={b.logo_url as string | null} />
                  <span className="flex-1 min-w-0 truncate">{(b.merchant_name as string).replace(/\s*\(\s*\)\s*$/, "")}</span>
                  <span className="text-muted shrink-0">{dateLabel(b.next_date as string, { month: "short", day: "numeric" })}</span>
                  <span className="tabular shrink-0 w-16 text-right">{money0(Number(b.average_amount))}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing due in the next 2 weeks.</p>}
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
          <span className="text-sm text-muted">Latest spending</span>
          <span className="flex items-center gap-4"><SyncButton subtle /><Link href="/transactions" className="text-sm text-muted hover:text-ink">See all</Link></span>
        </div>
        {txns.length ? <TxnList txns={txns} today={day} /> : <p className="px-5 pb-5 text-sm text-muted">No transactions yet. Press sync in a minute.</p>}
      </section>
    </div>
  );
}
