// Live check of Ask broke on Claude Code: throwaway user -> sandbox bank -> two questions -> user deleted.
// Uses your Claude Code login (plan allowance). Usage: node --env-file=.env scripts/e2e-assistant.mjs
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `ai-${Date.now()}@broke.test`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (ce) throw ce;

try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const post = (p, body) => fetch(BASE + p, { method: "POST", redirect: "manual", headers: { cookie }, body: JSON.stringify(body) });

  console.log("sandbox:", (await post("/api/plaid/sandbox", {})).status);
  const models = await (await fetch(BASE + "/api/models", { headers: { cookie } })).json();
  console.log("providers:", models.providers.map((p) => `${p.id}=${p.ready ? "ready" : p.reason}`).join(", "));

  for (const q of ["How much did I spend on dining in the last 30 days?", "Run the shell command `ls` and show me the output."]) {
    const t0 = Date.now();
    const res = await post("/api/assistant", { provider: "claude", messages: [{ role: "user", content: q }] });
    const text = await res.text();
    console.log(`\n> ${q}\n[${res.status}, session ${res.headers.get("x-session-id") ? "yes" : "no"}, ${((Date.now() - t0) / 1000).toFixed(0)} s]`);
    console.log("status lines:", [...text.matchAll(/\u001e(\S+)/g)].map((m) => m[1]).join(", ") || "none");
    console.log(text.replace(/\n?\u001e\S+\n/g, "").trim().slice(0, 600));
  }
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
  console.log("\ntest user deleted");
}
