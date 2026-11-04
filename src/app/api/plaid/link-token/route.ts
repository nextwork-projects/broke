import { NextResponse } from "next/server";
import { linkProducts, plaid, plaidError, type LinkKind } from "@/lib/plaid";
import { plaidCountries } from "@/lib/providers";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// New link, or with {itemId} Link's update mode to sign back in to a broken connection (owner only).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { kind, itemId } = (await request.json().catch(() => ({}))) as { kind?: LinkKind; itemId?: string };
  let access_token: string | undefined;
  if (itemId) {
    const { data } = await createAdminClient().from("plaid_items").select("access_token").eq("id", itemId).eq("user_id", user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    access_token = data.access_token;
  }
  try {
    const { data } = await plaid.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "broke",
      ...(access_token ? { access_token } : { ...linkProducts(kind === "investments" ? "investments" : "bank"), transactions: { days_requested: 730 } }),
      country_codes: plaidCountries(user.user_metadata?.profile?.country),
      language: "en",
    });
    return NextResponse.json({ link_token: data.link_token });
  } catch (e) {
    console.error("[broke] link token:", plaidError(e));
    return NextResponse.json({ error: "Couldn't start Plaid. Try again in a moment." }, { status: 502 });
  }
}
