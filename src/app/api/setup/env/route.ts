import { NextResponse } from "next/server";
import { isPlaceholder, validate, writeEnvLocal } from "@/lib/envfile";
import { migrate } from "@/lib/migrate";
import { checkAkahu, checkPlaid, checkSupabase, currentEnv, hasUsers, setupAccess, writeGate } from "@/lib/setup";

// Saves keys typed on /setup into .env.local, then tests them. Values are never echoed back or logged.
export async function POST(req: Request) {
  const { signedIn } = await setupAccess();
  const refused = await writeGate(req);
  if (refused) return NextResponse.json({ error: refused }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { values?: Record<string, unknown>; test?: boolean } | null;
  if (!body?.values || typeof body.values !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const { clean, errors } = validate(body.values);
  // Before anyone has signed in, keys go in and get fixed freely on this computer. After that, changing a saved one needs a sign-in.
  if (!signedIn && Object.keys(clean).some((k) => !isPlaceholder(currentEnv()[k] ?? "")) && (await hasUsers())) return NextResponse.json({ error: "Sign in to change saved keys." }, { status: 403 });
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 400 });
  if (!Object.keys(clean).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  // test: check Plaid keys without saving, so a wrong Production secret never replaces a working one.
  if (body.test) return NextResponse.json({ saved: [], checks: { plaid: await checkPlaid({ ...currentEnv(), ...clean }) } });

  writeEnvLocal(clean);
  for (const [k, v] of Object.entries(clean)) process.env[k] = v; // usable now; Next's own env reload follows

  const env = currentEnv();
  const touched = (...keys: string[]) => keys.some((k) => k in clean);
  const checks: Record<string, { ok: boolean; message: string } | null> = {};
  if (touched("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY")) checks.supabase = await checkSupabase(env);
  if (touched("PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV")) checks.plaid = await checkPlaid(env);
  if (touched("AKAHU_APP_TOKEN", "AKAHU_USER_TOKEN")) checks.akahu = await checkAkahu(env);
  if (touched("SUPABASE_DB_URL")) {
    const r = await migrate();
    checks.database = !r.connected
      ? { ok: false, message: r.error ?? "Couldn't connect." }
      : r.error
        ? { ok: false, message: r.error }
        : { ok: true, message: r.applied.length ? `Connected. Added ${r.applied.length} update${r.applied.length === 1 ? "" : "s"}.` : "Connected. Tables are up to date." };
  }
  return NextResponse.json({ saved: Object.keys(clean), checks, restart: process.env.NODE_ENV === "production" });
}
