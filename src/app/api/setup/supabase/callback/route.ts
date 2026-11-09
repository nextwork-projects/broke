import { NextResponse } from "next/server";
import { migrate } from "@/lib/migrate";
import { finishConnect } from "@/lib/supabase-mcp";

// Supabase sends the browser back here after "Approve". Finish the sign-in, then bring the tables up to date.
// The result goes back as a code (DB_MESSAGES on the Setup page), never as text, so the link can't carry a message.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (code: string) => NextResponse.redirect(new URL(`/setup?db=${code}`, url));
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    await finishConnect(code, url.searchParams.get("state"));
  } catch (e) {
    console.error("[broke] supabase callback:", e instanceof Error ? e.message : e);
    return back(e instanceof Error && /didn't start/.test(e.message) ? "elsewhere" : "rejected");
  }
  const r = await migrate();
  return back(r.error ? "update-failed" : r.applied.length ? "updated" : "current");
}
