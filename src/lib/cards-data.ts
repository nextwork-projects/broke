import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CARDS, currentEarn, earnsRewards, ownedCards, rank, withReferrals, yearlySpend } from "@/lib/cards";
import type { Band } from "@/lib/credit";
import { isSpend, TXN_SELECT, type Txn } from "@/lib/data";
import { ymd } from "@/lib/format";

export const REFERRALS_FILE = "src/data/card-referrals.json";

// Read on every request so the owner can paste links without a rebuild.
export function referralLinks(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), REFERRALS_FILE), "utf8"));
  } catch {
    return {};
  }
}

// Supabase caps a response at 1,000 rows, so a year of transactions is read in pages.
async function yearOfTxns(supabase: SupabaseClient, userId: string, since: string) {
  const rows: Txn[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("transactions").select(TXN_SELECT).eq("user_id", userId).gte("date", since).order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Txn[]));
    if (!data || data.length < 1000) return rows;
  }
}

// The user's own last 12 months of spending against every card (not a partner's shared accounts).
// Shared by /cards, the money plan and the AI tool. band: the user's credit range (creditOf), cards that fit it first.
export async function cardMatches(supabase: SupabaseClient, userId: string, band?: Band | null) {
  const since = ymd(new Date(Date.now() - 365 * 864e5));
  const [txns, { data: accts }] = await Promise.all([
    yearOfTxns(supabase, userId, since),
    supabase.from("accounts").select("name, official_name, custom_name, mask").eq("type", "credit").eq("user_id", userId),
  ]);
  const spendTx = txns.filter((t) => isSpend(t) && earnsRewards({ key: t.category?.key, plaid: t.plaid_category, name: t.name }));
  const spend = yearlySpend(spendTx.map((t) => ({ date: t.date, amount: t.amount, key: t.category?.key })));
  const cards = withReferrals(CARDS, referralLinks());
  const owned = ownedCards(accts ?? [], cards);
  const fits = rank(cards.filter((c) => !owned.includes(c)), spend, "yearOne", band);
  return { spend, total: Object.values(spend).reduce((a, b) => a + b, 0), hasHistory: spendTx.length > 0, owned, ownedEarn: currentEarn(owned, spend), creditAccounts: (accts ?? []).length, fits,
    // Each linked card account and the catalogue card it is, when broke knows it.
    mine: (accts ?? []).map((a) => ({ name: a.custom_name || a.name, mask: a.mask as string | null, card: ownedCards([a], cards)[0] ?? null })) };
}

// The /setup "more" entry: where the owner pastes referral links.
export function cardReferralSection() {
  const n = Object.keys(referralLinks()).length;
  return {
    id: "referrals", kind: "more" as const,
    title: "Card referral links",
    what: "Your own referral links for the Cards page. Without them, Apply goes to the issuer's public page.",
    status: n ? ("done" as const) : ("optional" as const),
    note: n ? `${n} link${n === 1 ? "" : "s"} added` : undefined,
    steps: [
      [`Open ${REFERRALS_FILE} and add one line per card: the card id from src/lib/cards.ts, then your link.`],
      ["Links must be https on the card's issuer site. Anything else is skipped. Reload /cards to see them."],
    ],
    command: `{ "chase-sapphire-preferred": "https://www.referyourchasecard.com/..." }`,
  };
}
