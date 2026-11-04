// Live check of country-aware advice on Claude Code: a US and a UK throwaway user ask the same questions.
// The US one should get an HSA question as buttons; the UK one must get no US accounts. Users deleted after.
// Uses your Claude Code login (plan allowance). Usage: node --env-file=.env scripts/e2e-advice.mjs
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const US_TERMS = /401\(k\)|\b529\b|\bIRA\b|\bIRS\b|HSA[^.]*(eligible|contribut|open one(?! in))/;

for (const country of ["US", "GB"]) {
  const email = `advice-${country}-${Date.now()}@broke.test`, password = randomBytes(18).toString("base64url");
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { profile: { country, age: "30-39" } } });
  if (error) throw error;
  try {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { data: s } = await anon.auth.signInWithPassword({ email, password });
    const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
    for (const q of ["Should I be using an HSA?", "I want to save a deposit for my first home. Where should I keep it?"]) {
      const res = await fetch(BASE + "/api/assistant", { method: "POST", headers: { cookie }, body: JSON.stringify({ provider: "claude", messages: [{ role: "user", content: q }] }) });
      const text = (await res.text()).replace(/\n?\u001e\S+\n/g, "").trim();
      const ask = text.match(/```ask\s*\n([\s\S]*?)```/)?.[1];
      console.log(`\n[${country}] > ${q}  (${res.status})\n${text.slice(0, 900)}`);
      console.log(`ask block: ${ask ? "yes" : "no"}${ask ? " " + ask.trim() : ""}`);
      if (country !== "US") console.log(`US terms leaked: ${US_TERMS.test(text) ? "YES  <-- " + text.match(US_TERMS)[0] : "no"}`);
    }
  } finally {
    await admin.auth.admin.deleteUser(created.user.id);
  }
}
console.log("\ntest users deleted");
