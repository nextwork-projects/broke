import { NextResponse } from "next/server";
import { sameAccounts } from "@/lib/links";
import { createAdminClient } from "@/utils/supabase/admin";
import { plaidError } from "@/lib/plaid";
import { plaidCountries } from "@/lib/providers";
import { linkItem } from "@/lib/sync";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const bodyP = request.json().catch(() => ({}));
  const { public_token } = (await bodyP) as { public_token?: unknown };
  if (typeof public_token !== "string") return NextResponse.json({ error: "public_token required" }, { status: 400 });

  // Already linked: the same bank and the same accounts. Not exchanged, so no second copy is saved.
  const body = (await bodyP) as { institution_id?: unknown; accounts?: unknown };
  if (typeof body.institution_id === "string" && Array.isArray(body.accounts)) {
    const next = body.accounts.filter((a): a is { mask: string | null; type: string | null } => !!a && typeof a === "object").map((a) => ({ mask: typeof a.mask === "string" ? a.mask : null, type: typeof a.type === "string" ? a.type : null }));
    const db = createAdminClient();
    const { data: items } = await db.from("plaid_items").select("id, institution_name, accounts(mask, type)").eq("user_id", user.id).eq("institution_id", body.institution_id);
    const dup = (items ?? []).find((i) => sameAccounts(next, (i.accounts ?? []) as { mask: string | null; type: string | null }[]));
    if (dup) return NextResponse.json({ error: `${dup.institution_name ?? "That bank"} is already linked with these accounts, so nothing new was added. To sign in to it again, use Reconnect on the Accounts page.` }, { status: 409 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await linkItem(user.id, public_token, plaidCountries(user.user_metadata?.profile?.country))) });
  } catch (e) {
    console.error("[broke] link:", plaidError(e));
    return NextResponse.json({ error: "Linking failed. Try again in a moment." }, { status: 500 });
  }
}
