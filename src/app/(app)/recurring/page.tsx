import { EmptyBank } from "@/components/EmptyBank";
import Link from "next/link";
import { AskButton } from "@/components/Assistant";
import { BillAdvice, billName, CARD_NOTE, loadBills } from "@/components/BillsOnCards";
import { Merchant } from "@/components/Merchant";
import { CancelActions } from "@/components/CancelActions";
import { RecurringToggle } from "@/components/RecurringToggle";
import { SubscriptionAlerts } from "@/components/SubscriptionAlerts";
import { allRows, getUser, today as userToday } from "@/lib/data";
import { dayLabel, FREQ_LABEL, FREQ_PER_MONTH, money, plural, ymd } from "@/lib/format";
import { categoryOf, negotiable, subscriptionAlerts, type Charge } from "@/lib/subscriptions";

type Stream = {
  id: string;
  merchant_name: string;
  frequency: string;
  average_amount: number;
  last_date: string | null;
  next_date: string | null;
  is_income: boolean;
  active: boolean;
  category: { key: string; label: string; color: string; icon: string } | null;
};

export default async function Recurring({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const all = tab === "all";
  const { supabase, user } = await getUser();
  const uid = user!.id;
  const now = await userToday();
  const today = ymd(now);
  // Own streams and charges only; a partner's shared recurring charges are not yours to pay or cancel.
  const { data, error } = await supabase
    .from("recurring")
    .select("id, merchant_name, frequency, average_amount:home_average, last_date, next_date, is_income, active, category:categories(key, label, color, icon)")
    .eq("user_id", uid)
    .neq("status", "TOMBSTONED")
    .order("next_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const streams = (data ?? []) as unknown as Stream[];
  if (!streams.length) {
    const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", uid).neq("type", "investment");
    if (!count) return <EmptyBank title="See your subscriptions and bills" body="Link a bank and broke finds charges that repeat, what they cost a month and when each is due." />;
  }
  const since = ymd(new Date(now.getTime() - 400 * 864e5));
  const [cardBills, logoRows, txns] = await Promise.all([
    loadBills(),
    streams.length
      ? allRows<{ merchant_name: string | null; logo_url: string }>((f, t) =>
          supabase.from("transactions").select("merchant_name, logo_url").eq("user_id", uid).in("merchant_name", [...new Set(streams.map((s) => s.merchant_name))]).not("logo_url", "is", null).order("id").range(f, t))
      : [],
    allRows<Charge>((f, t) => supabase.from("transactions").select("merchant_name, name, amount, date, plaid_category").eq("user_id", uid).gt("amount", 0).gte("date", since).order("id").range(f, t)),
  ]);
  const logos = new Map(logoRows.map((r) => [r.merchant_name, r.logo_url]));
  const alerts = subscriptionAlerts(streams, txns);
  const advice = new Map(cardBills.items.map((x) => [x.r.id, x]));
  const switchable = cardBills.items.filter((x) => x.gainMine >= 1);
  const cardGain = switchable.reduce((t, x) => t + x.gainMine, 0);
  const ctx: RowCtx = { logos, txns, state: user?.user_metadata?.profile?.state, advice, money: cardBills.money };

  const visible = streams.filter((s) => (all ? true : s.active && !s.is_income && (!s.next_date || s.next_date >= today)));
  const isBill = (s: Stream) => s.category?.key === "RENT_AND_UTILITIES" || s.category?.key === "LOAN_PAYMENTS";
  const subs = visible.filter((s) => !s.is_income && !isBill(s));
  const bills = visible.filter((s) => !s.is_income && isBill(s));
  const income = visible.filter((s) => s.is_income);
  const monthly = streams.filter((s) => s.active && !s.is_income).reduce((t, b) => t + b.average_amount * (FREQ_PER_MONTH[b.frequency] ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.6fr_1fr] items-start">
      <div className="space-y-6">
        <div className="pill-tabs">
          <Link scroll={false} href="/recurring" className={`pill-tab !py-1 !px-3 ${all ? "" : "pill-tab-active"}`}>Upcoming</Link>
          <Link scroll={false} href="/recurring?tab=all" className={`pill-tab !py-1 !px-3 ${all ? "pill-tab-active" : ""}`}>All recurring</Link>
        </div>
        <SubscriptionAlerts alerts={alerts} />
        <Section ctx={ctx} title="Subscriptions" rows={subs} empty="You have no subscriptions yet. broke spots them after a charge repeats a few times." />
        <Section ctx={ctx} title="Bills & Utilities" rows={bills} empty="You have no bills & utilities yet." />
        {all && <Section ctx={ctx} title="Income" rows={income} empty="No recurring income found yet." />}
      </div>

      <div className="space-y-6">
        <section className="card p-6">
          <div className="section-label">Per month</div>
          <div className="figure mt-2">{money(monthly)}</div>
          <p className="text-sm text-muted mt-1">across {plural(streams.filter((s) => s.active && !s.is_income).length, "recurring charge")}</p>
        </section>
        {cardBills.country.cards && !!cardBills.items.length && (
          <section className="card p-6 space-y-2">
            <div className="section-label">Earn more on these</div>
            {cardGain >= 1
              ? <p>Paying {switchable.length === 1 ? "one of these" : `${switchable.length} of these`} with a card you already have earns about <span className="font-medium tabular">{cardBills.money(cardGain)} a year</span> back.</p>
              : <p>Nothing to switch to a card you already have.</p>}
            <p className="text-xs text-muted">{CARD_NOTE}</p>
          </section>
        )}
        <section className="rounded-3xl bg-plum text-white border border-white/10 p-6 space-y-3">
          <div className="text-lg font-semibold">Looking to cancel a subscription?</div>
          <p className="text-sm text-white/75">Ask broke AI which ones you barely use and how to cancel each one.</p>
          <AskButton q="Which of my subscriptions should I cancel, and how do I cancel each one?" className="inline-block bg-white text-plum rounded-full px-5 py-2 text-sm font-medium">Ask broke AI</AskButton>
        </section>
      </div>
    </div>
  );
}

type RowCtx = { logos: Map<string | null, string>; txns: Charge[]; state?: string; advice: Map<string, Parameters<typeof BillAdvice>[0]["item"]>; money: (n: number) => string };

function Section({ title, rows, empty, ctx: { logos, txns, state, advice, money: money0 } }: { title: string; rows: Stream[]; empty: string; ctx: RowCtx }) {
  return (
    <div className="space-y-3">
      <div className="section-label px-1">{title}</div>
      <section className="card overflow-hidden">
        {rows.length ? (
          rows.map((s) => (
            <div key={s.id} className={`row-hover flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 border-b border-line last:border-0 ${s.active ? "" : "opacity-50"}`}>
              <Merchant name={s.merchant_name} logo={logos.get(s.merchant_name)} color={s.category?.color} icon={s.category?.icon} />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{billName(s.merchant_name)}</div>
                <div className="text-xs text-muted">
                  {FREQ_LABEL[s.frequency] ?? s.frequency}
                  {s.next_date ? ` · next ${dayLabel(s.next_date)}` : s.last_date ? ` · last ${dayLabel(s.last_date)}` : ""}
                </div>
                {advice.has(s.id) && <div className="mt-1"><BillAdvice item={advice.get(s.id)!} money={money0} /></div>}
              </div>
              <span className={`tabular font-medium ${s.is_income ? "text-good" : ""}`}>{money(s.average_amount)}</span>
              <div className="flex gap-2 justify-end basis-full @xl:basis-auto">
                {!s.is_income && <CancelActions stream={s} kind={negotiable(s.merchant_name, categoryOf(s, txns))} state={state} />}
                <RecurringToggle id={s.id} active={s.active} />
              </div>
            </div>
          ))
        ) : (
          <p className="px-6 py-5 text-sm text-muted">{empty}</p>
        )}
      </section>
    </div>
  );
}
