import { NextResponse } from "next/server";
import { authStart } from "@/lib/llm/openrouter";
import { createClient } from "@/utils/supabase/server";

// "Connect OpenRouter": remembers the PKCE secret in a short-lived cookie and sends the user to approve broke.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const { url, verifier, state } = authStart(`${origin}/api/ai/openrouter/callback`);
  const res = NextResponse.redirect(url);
  res.cookies.set("or_pkce", JSON.stringify({ verifier, state }), { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), maxAge: 600, path: "/api/ai/openrouter" });
  return res;
}
