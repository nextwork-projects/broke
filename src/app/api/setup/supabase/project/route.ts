import { NextResponse } from "next/server";
import { sameOrigin, setupAccess } from "@/lib/setup";
import { fillFrom } from "@/lib/supabase-fill";
import { accountConnected, createProject, listOrgs, listProjects } from "@/lib/supabase-mcp";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const local = async (request: Request) => LOOPBACK.test(request.headers.get("host") ?? "") && (await setupAccess()).allowed && accountConnected();

// After "Connect Supabase" signed in to the whole account: list its projects, or use one (or a new one). Using one writes
// its address and publishable key to .env.local and creates broke's tables through the same sign-in. Localhost only.
export async function GET(request: Request) {
  if (!(await local(request))) return NextResponse.json({ error: "Only on this computer, after Connect Supabase." }, { status: 403 });
  try {
    // One after the other: two at once could both renew the sign-in, and the second renewal cancels the first.
    const projects = await listProjects();
    const orgs = await listOrgs();
    return NextResponse.json({ projects, orgs: orgs.map((o) => o.name) });
  } catch (e) {
    console.error("[broke] supabase projects:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error && /expired/.test(e.message) ? e.message : "Couldn't list your Supabase projects. Press Connect Supabase again." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await local(request)) || !sameOrigin(request)) return NextResponse.json({ error: "Only on this computer, after Connect Supabase." }, { status: 403 });
  const { ref, create } = (await request.json().catch(() => ({}))) as { ref?: string; create?: boolean };
  try {
    const id = create ? await createProject() : ref && /^[a-z0-9]{20}$/.test(ref) ? ref : null;
    if (!id) return NextResponse.json({ error: "Pick a project." }, { status: 400 });
    return NextResponse.json(await fillFrom(id));
  } catch (e) {
    console.error("[broke] supabase project:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error && /cost money|organization|free projects|expired/.test(e.message) ? e.message : "Supabase didn't answer. Try again in a moment." }, { status: 502 });
  }
}
