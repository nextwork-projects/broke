// Reads .env + .env.local and writes whitelisted keys to .env.local (Next loads it after .env, so it wins).
// No "@/" imports so `node src/lib/envfile.test.ts` can load it.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Spec = { label: string; secret: boolean; check: (v: string) => string | null };

const url = (v: string) => {
  try {
    return /^https?:$/.test(new URL(v).protocol) ? null : "Should start with https://";
  } catch {
    return "That isn't a web address.";
  }
};
const jwt = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/; // legacy Supabase keys

// The only names the setup page may write. Anything else is rejected.
export const ENV_KEYS: Record<string, Spec> = {
  NEXT_PUBLIC_SUPABASE_URL: { label: "Project URL", secret: false, check: (v) => url(v) },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
    label: "Publishable key", secret: false,
    check: (v) => (/^sb_publishable_[\w-]{10,}$/.test(v) || jwt.test(v) ? null : "Starts with sb_publishable_"),
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    label: "Secret key", secret: true,
    check: (v) => (/^sb_secret_[\w-]{10,}$/.test(v) || jwt.test(v) ? null : "Starts with sb_secret_"),
  },
  SUPABASE_DB_URL: {
    label: "Database connection string", secret: true,
    check: (v) =>
      !/^postgres(ql)?:\/\/[^\s]+@[^\s]+$/.test(v) ? "Starts with postgresql:// (copy the Session pooler URI)"
        : /\[YOUR-PASSWORD\]/i.test(v) ? "Replace [YOUR-PASSWORD] with your database password" : null,
  },
  PLAID_CLIENT_ID: { label: "Client ID", secret: false, check: (v) => (/^[a-f0-9]{24}$/.test(v) ? null : "24 letters and numbers, from Plaid → Developers → Keys") },
  PLAID_SECRET: { label: "Secret", secret: true, check: (v) => (/^[a-f0-9]{30}$/.test(v) ? null : "30 letters and numbers, from Plaid → Developers → Keys") },
  PLAID_ENV: { label: "Mode", secret: false, check: (v) => (/^(sandbox|production)$/.test(v) ? null : "sandbox or production") },
  AKAHU_APP_TOKEN: { label: "App ID Token", secret: false, check: (v) => (/^app_token_\w+$/.test(v) ? null : "Starts with app_token_, from my.akahu.nz → Developers") },
  AKAHU_USER_TOKEN: { label: "User Access Token", secret: true, check: (v) => (/^user_token_\w+$/.test(v) ? null : "Starts with user_token_, from my.akahu.nz → Developers") },
  ENABLE_BANKING_APP_ID: { label: "Application ID", secret: false, check: (v) => (/^[\w-]{8,}$/.test(v) ? null : "The application's ID from the Enable Banking control panel") },
  ENABLE_BANKING_PRIVATE_KEY: { label: "Private key (PEM)", secret: true, check: (v) => (/PRIVATE KEY/.test(v) ? null : "Paste the whole key, including BEGIN PRIVATE KEY") },
  BASIQ_API_KEY: { label: "API key", secret: true, check: (v) => (v.length >= 20 && !/\s/.test(v) ? null : "The key from the Basiq dashboard") },
  BELVO_SECRET_ID: { label: "Secret ID", secret: false, check: (v) => (v.length >= 8 && !/\s/.test(v) ? null : "From Belvo: Developer Tools, API Keys") },
  BELVO_SECRET_PASSWORD: { label: "Secret password", secret: true, check: (v) => (v.length >= 8 ? null : "From Belvo: Developer Tools, API Keys") },
  BELVO_ENV: { label: "Mode", secret: false, check: (v) => (/^(sandbox|production)$/.test(v) ? null : "sandbox or production") },
  BELVO_TERMS_URL: { label: "Your terms page", secret: false, check: (v) => url(v) },
  DEV_LOGIN_EMAIL: { label: "Skip-login email", secret: false, check: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "That isn't an email address") },
  LOCAL_LLM_BASE_URL: { label: "Local model address", secret: false, check: (v) => url(v) },
  LOCAL_LLM_MODEL: { label: "Local model name", secret: false, check: (v) => (/^[\w.:/-]{1,100}$/.test(v) ? null : "Letters, numbers and . : / - only") },
};

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    v = v.replace(/\\\$/g, "$");
    out[m[1]] = v;
  }
  return out;
}

// Rewrites only the named keys; comments, order and other keys stay. "" removes a key.
export function updateEnvText(text: string, updates: Record<string, string>): string {
  const left = { ...updates };
  const lines = text.split(/\r?\n/).filter((line, i, all) => i < all.length - 1 || line !== "").flatMap((line) => {
    const k = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!k || !(k in left)) return [line];
    const v = left[k];
    delete left[k];
    return v === "" ? [] : [`${k}=${quote(v)}`];
  });
  for (const [k, v] of Object.entries(left)) if (v !== "") lines.push(`${k}=${quote(v)}`);
  return lines.join("\n") + "\n";
}
// Next's loader expands $VAR even inside quotes, so $ is escaped; quotes/backslashes are rejected in validate().
const quote = (v: string) => (/[\s#$]/.test(v) ? `"${v.replace(/\$/g, "\\$")}"` : v);

// Every value is checked before anything touches the disk. Returns per-key errors.
export function validate(updates: Record<string, unknown>): { clean: Record<string, string>; errors: Record<string, string> } {
  const clean: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const [k, raw] of Object.entries(updates)) {
    const spec = ENV_KEYS[k];
    if (!spec) { errors[k] = "Not a setting this page can change."; continue; }
    if (typeof raw !== "string") { errors[k] = "Must be text."; continue; }
    const v = raw.trim();
    if (/[\u0000-\u001f\u007f'"`\\]/.test(v)) { errors[k] = "Contains characters that aren't allowed (line breaks, quotes or backslashes)."; continue; } // no newline/quote injection
    if (v === "") { clean[k] = ""; continue; }
    const err = spec.check(v);
    if (err) errors[k] = err;
    else clean[k] = v;
  }
  return { clean, errors };
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
export const readEnv = (dir = process.cwd()) => ({ ...parseEnv(read(join(dir, ".env"))), ...parseEnv(read(join(dir, ".env.local"))) });

// Atomic write (temp file + rename), owner-only permissions.
export function writeEnvLocal(updates: Record<string, string>, dir = process.cwd()) {
  const path = join(dir, ".env.local");
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, updateEnvText(read(path), updates), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

// What the page may see about a value: whether it's set, and the last 4 characters of non-secret ones.
export const isPlaceholder = (v?: string) => !v || /^your[_-]|your-project|YOUR-PASSWORD/.test(v);
export function describe(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(ENV_KEYS).map(([k, s]) => {
      const v = env[k];
      const set = !isPlaceholder(v);
      return [k, { set, hint: set && !s.secret && v!.length > 8 ? `…${v!.slice(-4)}` : set ? "saved" : null, label: s.label, secret: s.secret }];
    }),
  );
}
