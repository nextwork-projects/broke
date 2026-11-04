import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { codeSeen, exchangeOnce, saveKey } from "@/lib/llm/openrouter";
import { createClient } from "@/utils/supabase/server";

// OpenRouter sends the user back here. The state must match the cookie, then the code becomes this user's key.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(`${url.origin}/connect-ai?${q}`);
    res.cookies.delete({ name: "or_pkce", path: "/api/ai/openrouter" });
    return res;
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  let saved: { verifier?: string; state?: string } = {};
  try {
    saved = JSON.parse((await cookies()).get("or_pkce")?.value ?? "{}");
  } catch {}
  const code = url.searchParams.get("code");
  // A repeat load of a code already being exchanged has no cookie left, and doesn't need it: only a checked request starts one.
  const repeat = !!code && codeSeen(user.id, code);
  if (!code || (!repeat && (!saved.verifier || !saved.state || url.searchParams.get("state") !== saved.state))) return back("error=1");
  try {
    const { error } = await saveKey(user.id, await exchangeOnce(user.id, code, saved.verifier ?? ""));
    if (error) throw new Error(error.message);
    await supabase.auth.updateUser({ data: { ai_model: { provider: "openrouter", model: null } } });
  } catch (e) {
    console.error("[broke] openrouter:", e instanceof Error ? e.message : e); // never the key or the code
    return back("error=1");
  }
  return back("connected=1");
}
