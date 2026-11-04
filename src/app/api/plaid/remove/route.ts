import { NextResponse } from "next/server";
import { plaid, plaidError } from "@/lib/plaid";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// Removes a bank connection: revokes it at Plaid, then deletes the item (its accounts, transactions and holdings cascade).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { itemId } = (await request.json().catch(() => ({}))) as { itemId?: string };
  const db = createAdminClient();
  const { data: item } = itemId ? await db.from("plaid_items").select("id, access_token, provider").eq("id", itemId).eq("user_id", user.id).maybeSingle() : { data: null };
  if (!item) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  // Akahu personal-app tokens belong to the server owner: removing here only forgets the connection in broke.
  // A test (sandbox) connection can't be revoked from live mode; Plaid's sandbox forgets it anyway.
  const testInLive = item.access_token?.startsWith("access-sandbox-") && process.env.PLAID_ENV !== "sandbox";
  if (item.provider === "plaid" && !testInLive) try {
    await plaid.itemRemove({ access_token: item.access_token! });
  } catch (e) {
    const err = plaidError(e);
    // Already gone at Plaid: still remove it here.
    if (err.code !== "ITEM_NOT_FOUND" && err.code !== "INVALID_ACCESS_TOKEN") {
      console.error("[broke] item remove:", err);
      return NextResponse.json({ error: "Plaid couldn't remove this connection. Try again in a moment." }, { status: 502 });
    }
  }
  const { error } = await db.from("plaid_items").delete().eq("id", item.id);
  if (error) return NextResponse.json({ error: "Couldn't remove this connection." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
