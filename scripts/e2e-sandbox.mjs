// End-to-end smoke test against the running dev server: throwaway user -> sandbox bank -> pages -> delete user.
// Usage: node --env-file=.env scripts/e2e-sandbox.mjs [http://localhost:3000]
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const email = `e2e-${Date.now()}@broke.test`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (ce) throw ce;
const uid = created.user.id;

try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s, error: se } = await anon.auth.signInWithPassword({ email, password });
  if (se) throw se;
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const get = (p, init = {}) => fetch(BASE + p, { ...init, redirect: "manual", headers: { cookie, ...(init.headers ?? {}) } });

  const link = await get("/api/plaid/sandbox", { method: "POST" });
  console.log("sandbox link:", link.status, await link.text());

  // RLS check: this user must not be able to read the Plaid access token column.
  const authed = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
    auth: { persistSession: false },
  });
  const tok = await authed.from("plaid_items").select("access_token");
  console.log("user can read access_token:", tok.error ? `no (${tok.error.code})` : "YES - LEAK");
  const own = await authed.from("transactions").select("id", { count: "exact", head: true });
  console.log("user sees own transactions:", own.count);

  for (const p of ["/", "/transactions", "/spending", "/recurring", "/accounts"]) {
    const r = await get(p);
    const html = await r.text();
    console.log(p, r.status, /Application error|Unhandled Runtime Error|Internal Server Error/.test(html) ? "ERROR IN PAGE" : "ok");
  }
} finally {
  await admin.auth.admin.deleteUser(uid); // cascades to the user's rows
  console.log("test user deleted");
}
