import { NextResponse } from "next/server";
import { revokeItem } from "@/lib/plaid";
import { sameOrigin } from "@/lib/setup";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// Settings, Database, "Clear my data": the signed-in user's money data, and nobody else's. Bank connections are revoked
// at Plaid first, then deleted (accounts, transactions, bills and holdings cascade). Sign-in, profile answers, categories
// and the AI connection stay, so they can link again or use a test bank straight away.
const TABLES = ["accounts", "transactions", "recurring", "budgets", "rules", "plans", "checkins", "chat_threads", "bookmarks"];

export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { confirm } = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== "clear") return NextResponse.json({ error: "Not confirmed" }, { status: 400 });

  const db = createAdminClient();
  const { data: items } = await db.from("plaid_items").select("id, access_token, provider, institution_name").eq("user_id", user.id);
  const stuck: string[] = [];
  for (const item of items ?? []) {
    if (!(await revokeItem(item)).ok) { stuck.push(item.institution_name ?? "A bank"); continue; }
    await db.from("plaid_items").delete().eq("id", item.id);
  }
  // Manual accounts and anything left over. A bank Plaid wouldn't let go of keeps its data, so it can be tried again.
  if (!stuck.length) for (const t of TABLES) {
    const { error } = await db.from(t).delete().eq("user_id", user.id);
    if (error) {
      console.error(`[broke] clear ${t}:`, error.message);
      return NextResponse.json({ error: "Couldn't clear everything. Try again." }, { status: 500 });
    }
  }
  if (stuck.length) return NextResponse.json({ error: `Plaid couldn't disconnect ${stuck.join(", ")}. Try again in a moment.` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
