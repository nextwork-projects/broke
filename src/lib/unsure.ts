// "Is this right?" checks: which transactions broke is unsure about. Pure, relative imports only, so
// `node src/lib/unsure.test.ts` runs it. CategoryCheck and the Transactions page share it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { bankEvent } from "./privacy.ts";

export type CheckRow = {
  id: string; date: string; amount: number; name: string; merchant_name: string | null; custom_name: string | null;
  logo_url: string | null; currency: string | null; category_id: string | null; plaid_confidence: string | null; manual: boolean;
  category: { id: string; key: string; label: string; kind: "spend" | "income" | "transfer"; icon?: string; color?: string } | null;
};
export type Reason = "none" | "low" | "money-in" | "transfer" | "unknown";

// The one select both clients run: own, not hidden, not pending, never answered (migration 0023), last 90 days.
export const CHECK_COLS = "id, date, amount, name, merchant_name, custom_name, logo_url, currency, category_id, plaid_confidence, manual, category:categories(id, key, label, kind, icon, color)";
// ponytail: one fixed size for "large" in every currency; scale it by the user's typical month if it flags too much or too little.
export const LARGE_TRANSFER = 500;
const LOW = new Set(["LOW", "UNKNOWN"]);

/** Why a row needs a check, most telling reason first, or null when it looks right. */
export function unsureReason(t: CheckRow): Reason | null {
  if (!t.category || t.category.key === "OTHER") return "none";
  if (t.plaid_confidence && LOW.has(t.plaid_confidence)) return "low";
  if (t.amount < 0 && t.category.kind === "spend") return "money-in";
  if (t.category.kind === "transfer" && Math.abs(t.amount) >= LARGE_TRANSFER) return "transfer";
  // No merchant from the bank and not a bank event (interest, fee, payment): broke can't tell what it is.
  if (!t.manual && !t.merchant_name && !t.custom_name && !bankEvent(t.name, t.category.label)) return "unknown";
  return null;
}

export const REASON_TEXT: Record<Reason, string> = {
  none: "No category yet",
  low: "The bank wasn't sure of this category",
  "money-in": "Money in, filed as spending",
  transfer: "A large transfer",
  unknown: "broke doesn't know this name",
};

/** Up to n unsure rows, the biggest first, and how many questions there are in all (folded, so 128 "Monthly payment" rows count once). Rows with the same name
 * and reason fold into the biggest one (four Sweetgreen refunds are one question): `same` holds every id it answers. */
export function toCheck<T extends CheckRow>(rows: T[], n = 5) {
  const groups = new Map<string, T & { reason: Reason; same: string[] }>();
  for (const t of [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))) {
    const reason = unsureReason(t);
    if (!reason) continue;
    const key = `${reason}|${(t.merchant_name ?? t.name).toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.same.push(t.id);
    else groups.set(key, { ...t, reason, same: [t.id] });
  }
  return { rows: [...groups.values()].slice(0, n), total: groups.size };
}

/** The candidates from the last 90 days, one request. Works with the server or the browser client (RLS: own rows). */
export async function fetchChecks(sb: SupabaseClient, uid: string, today = new Date().toISOString().slice(0, 10), n = 5) {
  const since = new Date(Date.parse(today) - 90 * 864e5).toISOString().slice(0, 10);
  // ponytail: newest 1000 rows of the 90 days; page it if a 90-day ledger ever passes that.
  const { data, error } = await sb.from("transactions").select(CHECK_COLS).eq("user_id", uid).is("checked_at", null)
    .eq("ignored", false).eq("pending", false).gte("date", since).order("date", { ascending: false }).order("id").limit(1000);
  if (error) return { rows: [], total: 0 };
  return toCheck((data ?? []) as unknown as CheckRow[], n);
}
