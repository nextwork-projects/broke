import { NextResponse } from "next/server";
import { revokeItem } from "@/lib/plaid";
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

  if (!(await revokeItem(item)).ok) return NextResponse.json({ error: "Plaid couldn't remove this connection. Try again in a moment." }, { status: 502 });
  const { error } = await db.from("plaid_items").delete().eq("id", item.id);
  if (error) return NextResponse.json({ error: "Couldn't remove this connection." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
