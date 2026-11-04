import { NextResponse } from "next/server";
import { migrate } from "@/lib/migrate";
import { hasUsers, sameOrigin, setupAccess } from "@/lib/setup";

// Applies pending migrations. It changes the database: signed-in users only, or on this computer before anyone has signed in.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request didn't come from this page." }, { status: 403 });
  const access = await setupAccess();
  if (!access.signedIn && (!access.allowed || (await hasUsers()))) return NextResponse.json({ error: "Sign in to update the database." }, { status: 401 });
  const r = await migrate();
  if (!r.configured) return NextResponse.json({ error: "Add SUPABASE_DB_URL to .env first." }, { status: 400 });
  if (r.error) return NextResponse.json({ error: r.error, applied: r.applied }, { status: 500 });
  return NextResponse.json({ ok: true, applied: r.applied });
}
