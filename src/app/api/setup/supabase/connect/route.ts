import { NextResponse } from "next/server";
import { currentEnv, setupAccess } from "@/lib/setup";
import { refFromUrl, startConnect } from "@/lib/supabase-mcp";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// "Connect Supabase": returns the Supabase approval page for this project. Localhost only.
export async function POST(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (!LOOPBACK.test(host) || !(await setupAccess()).allowed) return NextResponse.json({ error: "Only on this computer." }, { status: 403 });
  const ref = refFromUrl(currentEnv().NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) return NextResponse.json({ error: "Add your Supabase Project URL first." }, { status: 400 });
  try {
    const url = await startConnect(ref, `http://${host}/api/setup/supabase/callback`);
    return NextResponse.json(url ? { url } : { connected: true });
  } catch (e) {
    console.error("[broke] supabase connect:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't reach Supabase. Try again in a moment." }, { status: 502 });
  }
}
