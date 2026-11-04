import { NextResponse } from "next/server";
import { plaidError } from "@/lib/plaid";
import { ITEM_COLS, syncItem } from "@/lib/sync";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// ponytail: manual "Sync now" only. Add Plaid's SYNC_UPDATES_AVAILABLE webhook once the app is deployed.
// One broken connection never fails the rest: its Plaid error_code goes in plaid_items.status for the Accounts page.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = createAdminClient();
  const { data: items } = await db.from("plaid_items").select(ITEM_COLS).eq("user_id", user.id);

  // On real banks, nothing from Plaid's test banks stays: a test connection can't sync here anyway. It goes, with its
  // accounts and transactions (cascade), and so do the plan and reviews worked out while it was there.
  const live = process.env.PLAID_ENV === "production";
  const test = live ? (items ?? []).filter((i) => i.provider === "plaid" && i.access_token?.startsWith("access-sandbox-")) : [];
  if (test.length) {
    await db.from("plaid_items").delete().in("id", test.map((i) => i.id));
    await Promise.all([db.from("plans").delete().eq("user_id", user.id), db.from("checkins").delete().eq("user_id", user.id)]);
  }

  const results = [];
  for (const item of (items ?? []).filter((i) => !test.includes(i))) {
    try {
      results.push({ id: item.id, ...(await syncItem(item)) });
    } catch (e) {
      const err = plaidError(e);
      console.error("[broke] sync item:", item.id, err);
      await db.from("plaid_items").update({ status: err.code, error: err.message }).eq("id", item.id);
      results.push({ id: item.id, added: 0, modified: 0, removed: 0, error: err.code });
    }
  }
  return NextResponse.json({ ok: true, results });
}
