import { NextResponse } from "next/server";
import { plaidError } from "@/lib/plaid";
import { akahuTokens } from "@/lib/providers";
import { linkAkahu } from "@/lib/sync";
import { createClient } from "@/utils/supabase/server";

// Links the server's Akahu personal app (every NZ bank on that Akahu login) and runs the first sync.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!akahuTokens()) return NextResponse.json({ error: "Akahu isn't set up. Add its keys on the Setup page." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await linkAkahu(user.id)) });
  } catch (e) {
    const err = plaidError(e);
    console.error("[broke] akahu link:", err);
    const code = (e as { code?: string }).code;
    return NextResponse.json({ error: code === "AKAHU_TAKEN" ? err.message : code === "AKAHU_401" || code === "AKAHU_403" ? "Akahu didn't accept the keys. Check them on the Setup page." : "Couldn't reach Akahu. Try again in a moment." }, { status: 502 });
  }
}
