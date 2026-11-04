// End to end check of "AI and your data", as a throwaway sandbox user. Usage: node --env-file=.env scripts/privacy-e2e.mjs
// Summary only: asks the chat through Claude Code and captures what broke's MCP tools handed the model, by pointing
// the CLI's callback at a logging proxy on :3999 (the app picks the callback port from the request's Host).
// Off: the chat is refused and no CLI starts. Also checks no Claude Code transcript is written. Deletes the user in finally.
import { createClient } from "@supabase/supabase-js";
import { cleanName } from "../src/lib/format.ts";
import { bankEvent } from "../src/lib/privacy.ts";
import http from "node:http";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// The dev server (:3001) by default; BROKE_PORT=3000 for the production build.
const APP = Number(process.env.BROKE_PORT ?? 3001), PROXY = 3999;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `privacy-${Date.now()}@broke.test`, password = randomBytes(18).toString("base64url");
// Claude Code keeps transcripts per folder, named after the folder path (~/.broke/agent).
const TRANSCRIPTS = join(homedir(), ".claude", "projects", join(homedir(), ".broke", "agent").replace(/[/.]/g, "-"));
const count = () => { try { return readdirSync(TRANSCRIPTS).length; } catch { return 0; } };

const captured = []; // every /api/agent/tools exchange: { name, input, text }
const forward = (req, body, headers = req.headers) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: APP, path: req.url, method: req.method, headers: { ...headers, host: `127.0.0.1:${APP}` } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on("error", reject);
    r.end(body);
  });
const proxy = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const out = await forward(req, body);
    if (req.url.startsWith("/api/agent/tools") && req.method === "POST") {
      const sent = JSON.parse(body.toString() || "{}");
      captured.push({ name: sent.name, input: sent.input, status: out.status, text: JSON.parse(out.body.toString() || "{}").text });
    }
    res.writeHead(out.status, { "content-type": out.headers["content-type"] ?? "application/json" });
    res.end(out.body);
  });
});
await new Promise((r) => proxy.listen(PROXY, "127.0.0.1", r));

// Chat as the browser does, but with Host :3999 so the MCP callback goes through the proxy.
const chat = (cookie, q) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: APP, path: "/api/assistant", method: "POST", headers: { host: `127.0.0.1:${PROXY}`, cookie, "content-type": "application/json" } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    r.on("error", reject);
    r.end(JSON.stringify({ provider: "claude", messages: [{ role: "user", content: q }] }));
  });
const claudeProcs = () => Number(execSync("pgrep -f 'no-session-persistence' | wc -l").toString().trim() || 0);

const { data: c, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { profile: { country: "US", notes: "my secret note about rent" } } });
if (ce) throw ce;
const uid = c.user.id;
let failed = false;
const check = (ok, what) => (console.log(`${ok ? "ok  " : "FAIL"} ${what}`), ok || (failed = true));
try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const link = await fetch(`http://127.0.0.1:${APP}/api/plaid/sandbox`, { method: "POST", headers: { cookie } });
  console.log("sandbox bank:", link.status);
  for (let i = 0; i < 30; i++) {
    const { count: n } = await admin.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", uid);
    const { count: r } = await admin.from("recurring").select("id", { count: "exact", head: true }).eq("user_id", uid);
    if (n > 20 && r > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  // What must never reach the model.
  const [{ data: txns }, { data: accts }, { data: recur }] = await Promise.all([
    admin.from("transactions").select("name, merchant_name, amount, date").eq("user_id", uid),
    admin.from("accounts").select("name, custom_name, mask").eq("user_id", uid),
    admin.from("recurring").select("merchant_name").eq("user_id", uid),
  ]);
  const merchants = new Set([...txns.flatMap((t) => [t.merchant_name, cleanName(t.name)]), ...recur.map((r) => r.merchant_name)].filter((n) => n && n.length >= 4));
  const masks = new Set(accts.map((a) => a.mask).filter(Boolean));
  const acctNames = new Set(accts.flatMap((a) => [a.name, a.custom_name]).filter((n) => n && n.length >= 4));
  const exact = new Set(txns.map((t) => Math.abs(Number(t.amount))).filter((n) => !Number.isInteger(n)).map((n) => n.toFixed(2)));
  console.log(`user has ${txns.length} transactions, ${merchants.size} merchant names, ${masks.size} masks, ${exact.size} amounts with cents`);

  // 1. Summary only (the default) through Claude Code.
  const before = count();
  const q = "Which merchants did I spend the most at in the last two months, and which recurring charges do I have? Name them.";
  const reply = await chat(cookie, q);
  console.log("\n--- reply shown to the user ---\n" + reply.text.replace(/\u001e/g, "> ") + "\n--- end reply ---\n");
  console.log(`--- ${captured.length} MCP tool results the model got ---`);
  for (const t of captured) console.log(`# ${t.name} ${JSON.stringify(t.input)}\n${t.text}\n`);
  const all = captured.map((t) => t.text ?? "").join("\n");
  const lower = all.toLowerCase();
  check(reply.status === 200, "chat answered in summary mode");
  check(captured.length > 0, "the model called broke's tools");
  // Bank events ("Interest", "Payment") go to the model as what they are ("card or loan interest"), by design.
  const leakedNames = [...[...merchants].filter((n) => !bankEvent(n)), ...acctNames].filter((n) => lower.includes(n.toLowerCase()));
  check(!leakedNames.length, `no merchant or account names in tool results${leakedNames.length ? `: ${leakedNames.join(", ")}` : ""}`);
  // A mask would be a string ("1111", "••1111"); rounded totals are bare numbers and can look the same.
  const leakedMasks = [...masks].filter((m) => new RegExp(`["•*x]${m}"|mask`).test(all));
  check(!leakedMasks.length, `no account masks${leakedMasks.length ? `: ${leakedMasks.join(", ")}` : ""}`);
  const leakedAmounts = [...exact].filter((a) => all.includes(a));
  check(!leakedAmounts.length, `no exact amounts${leakedAmounts.length ? `: ${leakedAmounts.slice(0, 5).join(", ")}` : ""}`);
  check(!/\b\d{4}-\d{2}-\d{2}\b/.test(all), "no day-level dates");
  check(!/secret note/.test(all), "no profile notes");
  const placeholders = [...new Set(all.match(/⟨[MSIAHL]\d+⟩/g) ?? [])];
  check(placeholders.length > 0, `tool results used placeholders (${placeholders.slice(0, 6).join(", ")})`);
  check(!/⟨[^⟩]*⟩|\b(?:Merchant [A-Z]{1,2}|Subscriptions? \d+)\b/.test(reply.text), "reply has no placeholders left");
  const shown = [...merchants].filter((n) => reply.text.toLowerCase().includes(n.toLowerCase()));
  check(shown.length > 0, `reply names real merchants, swapped back on this Mac (${shown.slice(0, 5).join(", ")})`);
  check(count() === before, `no Claude Code transcript written (${count()} files before and after)`);

  // 2. Off: refused before any CLI starts.
  await admin.auth.admin.updateUserById(uid, { user_metadata: { ...c.user.user_metadata, ai_mode: "off" } });
  captured.length = 0;
  const procs = claudeProcs();
  const off = await chat(cookie, "How much did I spend?");
  check(off.status === 403, `Off: chat refused (${off.status} ${off.text})`);
  check(captured.length === 0 && claudeProcs() <= procs, "Off: no CLI started and no tool called");
  const ci = await fetch(`http://127.0.0.1:${APP}/api/checkins`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ refresh: true }) }).then((r) => r.json());
  check(ci.summary === null && ci.provider === null, "Off: check-in written from plain facts, no model");
} finally {
  await admin.auth.admin.deleteUser(uid);
  proxy.close();
  console.log(failed ? "\nprivacy e2e: FAILED" : "\nprivacy e2e: ok");
  process.exitCode = failed ? 1 : 0;
}
