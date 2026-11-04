import { NextResponse } from "next/server";
import { countryOf, wantsAkahu } from "@/lib/countries";
import { fromLocalhost, setupAccess, setupStatus } from "@/lib/setup";
import { createClient } from "@/utils/supabase/server";

// Server setup details are for the owner on this machine only: setup writes already need localhost (writeGate).
export async function GET() {
  const access = await setupAccess();
  if (!access.allowed) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!(await fromLocalhost())) return NextResponse.json({ error: "Managed by the server owner" }, { status: 403 });
  const status = await setupStatus(access.signedIn);
  // The NZ bank keys only matter to someone with NZ banks. Keys already saved stay visible, so they can be changed or removed.
  // Before Supabase is set up there's nobody signed in, and no client to ask.
  const user = access.signedIn ? (await (await createClient()).auth.getUser()).data.user : null;
  const profile = user?.user_metadata?.profile;
  const here = countryOf(profile?.country).providers as string[];
  const nz = wantsAkahu(profile);
  // Bank connections for other countries stay out of the way, unless keys are already saved.
  return NextResponse.json({ ...status, sections: status.sections.filter((s) => {
    if (s.id === "akahu") return nz || s.status === "done";
    return !["enablebanking", "basiq", "belvo"].includes(s.id) || here.includes(s.id) || s.status === "done";
  }) });
}
