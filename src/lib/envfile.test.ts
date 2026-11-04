// Run: node src/lib/envfile.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, parseEnv, readEnv, updateEnvText, validate, writeEnvLocal } from "./envfile.ts";

// parse: comments, quotes, export
assert.deepEqual(parseEnv("# c\nA=1\nexport B='two words'\nC=\"x\" \nD=v # note\n"), { A: "1", B: "two words", C: "x", D: "v" });

// update keeps other lines, replaces in place, appends new, "" deletes
assert.equal(updateEnvText("# top\nA=1\nB=2\n", { A: "9", C: "3", B: "" }), "# top\nA=9\nC=3\n");

// validate: whitelist, shapes, injection
const ok = validate({ PLAID_CLIENT_ID: "6ad8eeec19d0000000000000", PLAID_ENV: "sandbox", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" });
assert.deepEqual(ok.errors, {});
const bad = validate({
  EVIL: "x",
  PLAID_CLIENT_ID: "nope",
  PLAID_ENV: "development",
  SUPABASE_DB_URL: "postgresql://u:[YOUR-PASSWORD]@h:5432/postgres",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123456789\nEVIL=1",
  SUPABASE_SERVICE_ROLE_KEY: 42,
});
assert.deepEqual(Object.keys(bad.errors).sort(), ["EVIL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PLAID_CLIENT_ID", "PLAID_ENV", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
assert.deepEqual(bad.clean, {});

// write: .env.local wins over .env, file is 600, describe never reveals secrets
const dir = mkdtempSync(join(tmpdir(), "broke-env-"));
writeFileSync(join(dir, ".env"), "PLAID_ENV=sandbox\nPLAID_SECRET=your_sandbox_secret\n");
writeEnvLocal({ PLAID_ENV: "production", PLAID_SECRET: "0123456789abcdef0123456789abcd" }, dir);
assert.equal(statSync(join(dir, ".env.local")).mode & 0o777, 0o600);
assert.equal(readEnv(dir).PLAID_ENV, "production");
const d = describe(readEnv(dir));
assert.equal(d.PLAID_SECRET.set, true);
assert.equal(d.PLAID_SECRET.hint, "saved");
assert.ok(!JSON.stringify(d).includes("0123456789abcdef"));
assert.match(readFileSync(join(dir, ".env.local"), "utf8"), /^PLAID_ENV=production\nPLAID_SECRET=0123/);
// $ survives Next's loader: written escaped, read back literally
assert.equal(updateEnvText("", { SUPABASE_DB_URL: "postgresql://u:p$ss#1@h:5432/db" }), 'SUPABASE_DB_URL="postgresql://u:p\\$ss#1@h:5432/db"\n');
assert.equal(parseEnv(updateEnvText("", { SUPABASE_DB_URL: "postgresql://u:p$ss#1@h:5432/db" })).SUPABASE_DB_URL, "postgresql://u:p$ss#1@h:5432/db");
assert.ok(validate({ SUPABASE_DB_URL: 'postgresql://u:a"b@h/db' }).errors.SUPABASE_DB_URL);
console.log("envfile: ok");
