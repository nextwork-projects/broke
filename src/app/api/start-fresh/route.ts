import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// After test banks: clears what was worked out from the test data, for the signed-in user only.
// The money plan and weekly reviews always go (their numbers came from fake spending); budgets only when asked,
// since people may have typed them in themselves. Rules, categories, bookmarks and the profile stay.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { budgets } = (await request.json().catch(() => ({}))) as { budgets?: boolean };
  const db = createAdminClient(); // plans and check-ins are server-written (0018)
  const results = await Promise.all([
    db.from("plans").delete().eq("user_id", user.id), // plan_moves cascade
    db.from("checkins").delete().eq("user_id", user.id),
    ...(budgets ? [db.from("budgets").delete().eq("user_id", user.id)] : []),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error("[broke] start fresh:", failed.error);
    return NextResponse.json({ error: "Couldn't clear everything. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
