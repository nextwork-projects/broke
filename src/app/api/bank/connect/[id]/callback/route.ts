import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { configured } from "@/lib/providers";
import { ebFinish, isFeed } from "@/lib/providers/feeds";
import { linkFeed } from "@/lib/sync";
import { createClient } from "@/utils/supabase/server";

// The vendor sends the user back here after consent. The state must match the cookie set when they left.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const q = url.searchParams;
  const back = (r: string) => {
    const res = NextResponse.redirect(`${url.origin}/accounts/add?${r}`);
    res.cookies.delete({ name: "bank_connect", path: "/api/bank/connect" });
    return res;
  };
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  let saved: { state?: string; userId?: string } = {};
  try {
    saved = JSON.parse((await cookies()).get("bank_connect")?.value ?? "{}");
  } catch {}
  if (!isFeed(id) || !configured(id) || !saved.state || q.get("state") !== saved.state) return back("connect=failed");
  if (q.get("error") || q.get("kind") === "exit" || q.get("kind") === "event") return back("connect=cancelled");
  try {
    if (id === "enablebanking") {
      const code = q.get("code");
      if (!code) return back("connect=failed");
      const s = await ebFinish(process.env, code);
      await linkFeed(user.id, id, s.ref, s.institution, JSON.stringify({ ...JSON.parse(s.token), institution: s.institution }));
    } else if (id === "basiq") {
      if (!saved.userId) return back("connect=failed");
      await linkFeed(user.id, id, saved.userId, "Basiq", JSON.stringify({ userId: saved.userId }));
    } else {
      const link = q.get("link");
      if (!link) return back("connect=failed");
      await linkFeed(user.id, id, link, q.get("institution") ?? "Belvo", JSON.stringify({ link }));
    }
    return back("connect=done");
  } catch (e) {
    console.error(`[broke] ${id} connect:`, e instanceof Error ? e.message : e);
    return back("connect=failed");
  }
}
