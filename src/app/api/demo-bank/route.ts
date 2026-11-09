import { NextResponse } from "next/server";
import { demoBank } from "@/lib/demo";
import { today as userToday } from "@/lib/data";
import { ymd } from "@/lib/format";
import { sameOrigin } from "@/lib/setup";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// "Use made-up data": a demo bank for the signed-in user, for trying broke without a Plaid account. Its token starts
// with access-sandbox-, so it counts as test data everywhere (Settings, Banks; switching to real banks clears it), and
// sync and removal skip it (DEMO_TOKEN in lib/sync.ts and lib/plaid.ts). Written by the server: plaid_items is server-only.
export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const ref = `demo:${user.id}`;
  const { data: had } = await db.from("plaid_items").select("id").eq("plaid_item_id", ref).maybeSingle();
  if (had) return NextResponse.json({ error: "You already have the made-up bank." }, { status: 409 });

  const { accounts, txns, streams } = demoBank(ymd(await userToday()));
  const { data: cats } = await db.from("categories").select("id, key").is("user_id", null);
  const cat = new Map((cats ?? []).map((c) => [c.key as string, c.id as string]));
  const { data: item, error } = await db.from("plaid_items").insert({
    user_id: user.id, provider: "plaid", plaid_item_id: ref, access_token: `access-sandbox-demo-${user.id}`,
    institution_name: "Demo Bank (made-up)", status: "ok", last_synced_at: new Date().toISOString(), cursor: "demo",
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Couldn't add the made-up bank." }, { status: 500 });
  const fail = async (what: string, e: { message: string }) => {
    console.error(`[broke] demo bank ${what}:`, e.message);
    await db.from("plaid_items").delete().eq("id", item.id); // accounts and transactions go with it
    return NextResponse.json({ error: "Couldn't add the made-up bank." }, { status: 500 });
  };
  const { data: saved, error: e1 } = await db.from("accounts").insert(accounts.map((a) => ({
    user_id: user.id, item_id: item.id, plaid_account_id: `${ref}:${a.key}`, name: a.name, official_name: null, mask: a.mask,
    type: a.type, subtype: a.subtype, current_balance: a.balance, available_balance: a.type === "credit" ? null : a.balance, credit_limit: a.type === "credit" ? 5000 : null, currency: "USD",
  }))).select("id, plaid_account_id");
  if (e1) return fail("accounts", e1);
  const acct = new Map((saved ?? []).map((a) => [String(a.plaid_account_id).split(":").pop()!, a.id as string]));
  const { error: e2 } = await db.from("transactions").insert(txns.map((t) => ({
    user_id: user.id, account_id: acct.get(t.account)!, plaid_transaction_id: `${ref}:${t.key}`, date: t.date, amount: t.amount,
    name: t.name, merchant_name: t.name, pending: false, plaid_category: t.category, category_id: cat.get(t.category) ?? null,
  })));
  if (e2) return fail("transactions", e2);
  const { error: e3 } = await db.from("recurring").insert(streams.map((s) => ({
    user_id: user.id, plaid_stream_id: `${ref}:${s.merchant}`, account_id: acct.get(s.account) ?? null, merchant_name: s.merchant,
    frequency: s.frequency, average_amount: s.amount, last_amount: s.amount, last_date: s.last, next_date: s.next, is_income: s.income,
    active: true, status: "MATURE", category_id: cat.get(s.category) ?? null,
  })));
  if (e3) return fail("bills", e3);
  return NextResponse.json({ ok: true, institution: "Demo Bank (made-up)", accounts: accounts.length, added: txns.length });
}
