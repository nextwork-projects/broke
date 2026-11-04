import Link from "next/link";
import { Merchant } from "@/components/Merchant";
import { billOnCards, CARDS, catOf, fitsCredit, ownedCards, withReferrals, type Card } from "@/lib/cards";
import { referralLinks } from "@/lib/cards-data";
import { countryOf } from "@/lib/countries";
import { creditOf } from "@/lib/credit";
import { getUser } from "@/lib/data";
import { fmtFor, fmtWith } from "@/lib/format";

const PER_YEAR: Record<string, number> = { WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12, ANNUALLY: 1 };
// Payments that can't go on a card: loans, card payments, transfers. Rent usually costs a card fee, so it's left alone.
const NOT_ON_A_CARD = new Set(["LOAN_PAYMENTS", "CREDIT_CARD_PAYMENT", "TRANSFER_IN", "TRANSFER_OUT"]);
const RENT = /\b(rent|apartment|apartments|property|landlord|leasing)\b/i;
// Bank feeds leave an empty "()" on some names ("Instacart ()").
export const billName = (name: string) => name.replace(/\s*\(\s*\)\s*$/, "");

type Row = {
  id: string; merchant_name: string; logo_url: string | null; frequency: string; average_amount: number; next_date: string | null;
  category: { key: string } | null; account: { name: string; custom_name: string | null; official_name: string | null; mask: string | null; type: string } | null;
};

// Every subscription and bill that repeats, which account pays it, and what moving it to a card would earn.
// Cards only where the card catalogue applies (US); elsewhere the list on its own. Shared with the plan summary.
export async function loadBills() {
  const { supabase, user } = await getUser();
  const profile = (user?.user_metadata?.profile ?? {}) as Record<string, unknown>;
  const country = countryOf(profile.country as string | undefined);
  const money = fmtWith(fmtFor(profile)).money0;
  const [{ data: rec }, { data: credit }] = await Promise.all([
    supabase.from("recurring")
      .select("id, merchant_name, logo_url, frequency, average_amount:home_average, next_date, category:categories(key), account:accounts(name, custom_name, official_name, mask, type)")
      .eq("user_id", user!.id).eq("active", true).eq("is_income", false).neq("status", "TOMBSTONED"),
    supabase.from("accounts").select("name, official_name").eq("user_id", user!.id).eq("type", "credit"),
  ]);
  const rows = ((rec ?? []) as unknown as Row[]).filter((r) => !NOT_ON_A_CARD.has(r.category?.key ?? ""));
  if (!rows.length) return { items: [], money, country };

  const catalogue = country.cards ? withReferrals(CARDS, referralLinks()) : [];
  const owned = ownedCards(credit ?? [], catalogue);
  const band = creditOf(profile)?.band;
  // Cards to suggest: not one they hold, inside their credit range, no yearly fee (a fee isn't worth it for one bill).
  const others = catalogue.filter((c) => !owned.includes(c) && fitsCredit(c, band && band !== "unsure" ? band : null) !== false && !(c.fee ?? 0) && !(c.feeYear1 ?? 0));

  const items = rows.map((r) => {
    const yearly = Number(r.average_amount) * (PER_YEAR[r.frequency] ?? 12);
    const payingCard: Card | null = r.account?.type === "credit" ? ownedCards([r.account], catalogue)[0] ?? null : null;
    const rent = RENT.test(r.merchant_name);
    // On a card that isn't in the catalogue: its rewards are unknown, so no suggestion would be honest.
    const unknownCard = r.account?.type === "credit" && !payingCard;
    const o = catalogue.length && !rent && !unknownCard ? billOnCards({ yearly, cat: catOf(r.category?.key), payingCard }, owned, others) : null;
    const gainMine = o?.mine ? o.mine.earn - o.now : 0;
    const gainOther = o?.other ? o.other.earn - o.now : 0;
    return { r, yearly, rent, unknownCard, o, gainMine, gainOther };
  }).sort((a, b) => b.yearly - a.yearly);

  return { items, money, country };
}

export const CARD_NOTE = "Earnings use each card's rate for that kind of bill, with points valued as on the Cards page. Some billers charge a card fee, so check first. Pay the card in full every month, or the interest wipes out the points.";

type Item = Awaited<ReturnType<typeof loadBills>>["items"][number];

// The one line of card advice for a bill, or nothing to say. Also on the Recurring page.
export function BillAdvice({ item: { r, rent, unknownCard, o, gainMine, gainOther }, money }: { item: Item; money: (n: number) => string }) {
  if (/\bbilt\b/i.test(r.merchant_name)) return <p className="text-sm text-muted">Paid through Bilt. Your Bilt account shows what it earns.</p>;
  if (unknownCard) return <p className="text-sm text-muted">Already on a card. broke doesn&apos;t know that card&apos;s rewards.</p>;
  if (rent) return <p className="text-sm text-muted">Rent on a card usually costs a fee bigger than the points, so it stays as it is.</p>;
  if (o && gainMine >= 1) return <p className="text-sm">Pay it with your {o.mine!.card.name}: about <span className="font-medium">{money(gainMine)} a year</span> back{o.now ? `, ${money(gainMine)} more than now` : ""}.</p>;
  if (o && o.now > 0) return <p className="text-sm text-muted">Already earning about {money(o.now)} a year on your {o.mine?.card.name ?? "card"}.</p>;
  if (o?.other && gainOther >= 5) return <p className="text-sm text-muted">A {o.other.card.issuer} {o.other.card.name} would earn about {money(gainOther)} a year on it. <Link href="/cards" className="text-ink underline underline-offset-2">Compare cards</Link></p>;
  return null;
}

export async function BillsOnCards() {
  const { items, money, country } = await loadBills();
  if (!items.length) return null;
  const total = items.reduce((s, x) => s + x.yearly, 0);
  const switchable = items.filter((x) => x.gainMine >= 1);
  const gain = switchable.reduce((s, x) => s + x.gainMine, 0);
  const from = (a: Row["account"]) => {
    if (!a) return "an account broke can't see";
    const n = a.custom_name || a.name;
    return a.mask && !n.includes(a.mask) ? `${n} ··${a.mask}` : n;
  };

  return (
    <section className="card overflow-hidden">
      <div className="p-6 pb-4 space-y-1">
        <div className="card-title">Your subscriptions and bills</div>
        <p className="text-sm text-muted">
          {items.length} that repeat, about {money(total)} a year.
          {gain >= 1 && <> Paying {switchable.length === 1 ? "one" : switchable.length} with a card you already have would earn about <span className="text-ink font-medium">{money(gain)} a year</span> back.</>}
        </p>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {items.map((item) => { const { r, yearly } = item; return (
          <li key={r.id} className="px-6 py-4 flex gap-3.5">
            <Merchant name={r.merchant_name} logo={r.logo_url} />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex justify-between gap-3">
                <span className="font-medium truncate">{billName(r.merchant_name)}</span>
                <span className="tabular shrink-0">{money(yearly)}<span className="text-muted text-sm"> a year</span></span>
              </div>
              <p className="text-sm text-muted">Paid from {from(r.account)}{r.next_date ? `, next on ${new Date(r.next_date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}</p>
              <BillAdvice item={item} money={money} />
            </div>
          </li>
        ); })}
      </ul>
      {country.cards && (
        <p className="px-6 py-3.5 border-t border-line text-xs text-muted">
          {CARD_NOTE}
        </p>
      )}
    </section>
  );
}
