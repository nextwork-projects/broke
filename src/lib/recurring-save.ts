// Runs broke's own recurring finder over a user's transactions (every account: Plaid, feeds, imported statements,
// hand-added) and saves what it finds next to Plaid's streams. Plaid's own stream wins for the same merchant.
// Also moves a stream's next date forward once it has passed, so bills don't drop off "Coming up".
import { allRows } from "@/lib/data";
import { cleanName, findRecurring, nextAfter, type Found } from "@/lib/recurring-find";
import { createAdminClient } from "@/utils/supabase/admin";

const OURS = "broke:";
const FREQ: Record<string, Found["frequency"]> = { WEEKLY: "WEEKLY", BIWEEKLY: "BIWEEKLY", SEMI_MONTHLY: "BIWEEKLY", MONTHLY: "MONTHLY", QUARTERLY: "QUARTERLY", ANNUALLY: "ANNUALLY" };

type Txn = { name: string; merchant_name: string | null; amount: number; date: string; account_id: string; category: { key: string; id: string } | null };
type Stream = { id: string; plaid_stream_id: string; merchant_name: string; is_income: boolean; frequency: string; next_date: string | null; status: string | null };

export async function saveFoundRecurring(userId: string, today = new Date().toISOString().slice(0, 10)) {
  const db = createAdminClient();
  const since = new Date(Date.parse(today) - 400 * 864e5).toISOString().slice(0, 10);
  const [txns, { data: streams }, { data: cats }] = await Promise.all([
    allRows<Txn>((f, t) => db.from("transactions").select("name, merchant_name, amount, date, account_id, category:categories(key, id)")
      .eq("user_id", userId).eq("ignored", false).gte("date", since).order("id").range(f, t)),
    db.from("recurring").select("id, plaid_stream_id, merchant_name, is_income, frequency, next_date, status").eq("user_id", userId),
    db.from("categories").select("id, key").is("user_id", null),
  ]);
  const all = (streams ?? []) as Stream[];
  const bank = all.filter((s) => !s.plaid_stream_id.startsWith(OURS));
  const ours = new Map(all.filter((s) => s.plaid_stream_id.startsWith(OURS)).map((s) => [s.plaid_stream_id, s]));
  const keyOf = (income: boolean, name: string) => `${income ? "in" : "out"}:${cleanName(name)}`;
  const covered = new Set(bank.map((s) => keyOf(s.is_income, s.merchant_name)));

  // Plaid's predicted date can be in the past until the next charge posts: roll it forward on its own rhythm.
  for (const s of bank) {
    const f = FREQ[s.frequency];
    if (s.next_date && s.next_date < today && f && s.status !== "TOMBSTONED")
      await db.from("recurring").update({ next_date: nextAfter(s.next_date, f, today) }).eq("id", s.id);
  }

  const lastAccount = new Map<string, string>();
  for (const t of [...txns].sort((a, b) => a.date.localeCompare(b.date))) lastAccount.set(keyOf(t.amount < 0, t.merchant_name || t.name), t.account_id);
  const catId = new Map((cats ?? []).map((c) => [c.key as string, c.id as string]));
  const found = findRecurring(txns.map((t) => ({ name: t.merchant_name || t.name, date: t.date, amount: Number(t.amount), category: t.category?.key ?? null })), today)
    .filter((f) => !covered.has(f.key));

  const seen = new Set<string>();
  for (const f of found) {
    const id = `${OURS}${userId}:${f.key}`;
    seen.add(id);
    const fields = { merchant_name: f.merchant, frequency: f.frequency, average_amount: f.average, last_amount: f.last_amount, last_date: f.last_date,
      next_date: f.next_date, is_income: f.is_income, status: f.status, account_id: lastAccount.get(f.key) ?? null };
    // Existing: only the numbers change, so a category you picked or a stream you hid stays as you left it.
    if (ours.has(id)) await db.from("recurring").update(fields).eq("id", ours.get(id)!.id);
    else await db.from("recurring").insert({ user_id: userId, plaid_stream_id: id, ...fields, category_id: f.category ? catId.get(f.category) ?? null : null });
  }
  // Found before, not now (the charges stopped, or were deleted): ended, not deleted, so your choices on it stay.
  const gone = [...ours.keys()].filter((id) => !seen.has(id));
  if (gone.length) await db.from("recurring").update({ status: "TOMBSTONED" }).in("plaid_stream_id", gone);
  return { found: found.length };
}
