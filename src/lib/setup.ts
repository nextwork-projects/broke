import "server-only";
// Types are imported by the client checklist; everything else here runs on the server only.
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import * as llmConfig from "@/lib/llm/config";
import { probeLocal, providers } from "@/lib/llm/providers";
import { describe, ENV_KEYS, isPlaceholder, readEnv } from "@/lib/envfile";
import { migrate } from "@/lib/migrate";
import { mcpConnected } from "@/lib/supabase-mcp";
import { cardReferralSection } from "@/lib/cards-data";
import { akahuTokens } from "@/lib/providers";
import { akahuGet } from "@/lib/providers/akahu";

export type StepStatus = "done" | "todo" | "error" | "optional";
export type Part = string | { href: string; label: string };
export type Field = { key: string; label: string; secret: boolean; set: boolean; hint: string | null; placeholder?: string; options?: string[] };
export type HowTo = { text: string; href?: string; command?: string };
export type AiRow = { id: string; label: string; ready: boolean; reason?: string; howTo?: HowTo[] };
export type Section = {
  id: string;
  kind: "required" | "ai" | "more";
  title: string;
  what: string;
  status: StepStatus;
  note?: string;
  steps?: Part[][];
  fields?: Field[];
  command?: string;
  action?: "migrate" | "connect";
  providers?: AiRow[];
};
export type SetupStatus = { sections: Section[]; ready: boolean; canWrite: boolean; writeNote?: string };

// The merged view the page reasons about: shell env, then .env, then .env.local (what Next loads, in order).
const PICK = Object.keys(ENV_KEYS);
export const currentEnv = () => ({ ...Object.fromEntries(PICK.map((k) => [k, process.env[k]])), ...readEnv() }) as Record<string, string | undefined>;
export const isSet = (v?: string) => !isPlaceholder(v);
export const supabaseReady = (env: Record<string, string | undefined> = process.env) =>
  isSet(env.NEXT_PUBLIC_SUPABASE_URL) && isSet(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) && isSet(env.SUPABASE_SERVICE_ROLE_KEY);

const fields = (env: Record<string, string | undefined>, keys: string[], extra: Partial<Record<string, Partial<Field>>> = {}): Field[] => {
  const d = describe(env);
  return keys.map((key) => ({ key, ...d[key], ...extra[key] }));
};

// Live checks with the values passed in, never the module-level clients, so a just-saved key is what gets tested.
export async function checkPlaid(env: Record<string, string | undefined>) {
  if (!isSet(env.PLAID_CLIENT_ID) || !isSet(env.PLAID_SECRET)) return null;
  const mode = env.PLAID_ENV ?? "sandbox";
  const client = new PlaidApi(new Configuration({ basePath: PlaidEnvironments[mode], baseOptions: { headers: { "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID!, "PLAID-SECRET": env.PLAID_SECRET! } } }));
  try {
    await client.institutionsGet({ count: 1, offset: 0, country_codes: ["US" as never] });
    return { ok: true, message: mode === "sandbox" ? "Connected in test mode (sandbox banks)." : `Connected in ${mode} mode.` };
  } catch (e) {
    console.error("[broke] plaid check:", (e as { response?: { data?: { error_code?: string } } }).response?.data?.error_code ?? "failed");
    return { ok: false, message: `Plaid didn't accept these keys. Use the ${mode} secret from the same Plaid team.` };
  }
}

export async function checkAkahu(env: Record<string, string | undefined>) {
  const tok = akahuTokens(env);
  if (!tok) return null;
  try {
    await akahuGet(tok, "/me");
    return { ok: true, message: "Connected. Anyone signed in to this broke sees the banks on that Akahu login." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Akahu didn't accept these keys." };
  }
}

export async function checkSupabase(env: Record<string, string | undefined>) {
  if (!supabaseReady(env)) return null;
  try {
    const base = env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
    const pub = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! }, signal: AbortSignal.timeout(5000) });
    if (!pub.ok) return { ok: false, message: "Supabase didn't accept the publishable key. Copy it again from API Keys." };
    const sec = await fetch(`${base}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY! }, signal: AbortSignal.timeout(5000) });
    if (!sec.ok) return { ok: false, message: "Supabase didn't accept the secret key. Copy it again from API Keys." };
    return { ok: true, message: "Connected." };
  } catch {
    return { ok: false, message: "Couldn't reach that Project URL. Check it ends in .supabase.co." };
  }
}

// AI rows come from the provider layer. The CLI-session agent adds aiProviders(); until then, map the old list.
async function aiRows(): Promise<AiRow[]> {
  const fn = (llmConfig as Record<string, unknown>).aiProviders;
  if (typeof fn === "function") return ((await (fn as () => AiRow[] | Promise<AiRow[]>)()) ?? []) as AiRow[];
  return (await providers()).map((p) => ({ id: p.id, label: p.label, ready: p.ready, reason: p.ready ? undefined : p.reason }));
}

export async function setupStatus(signedIn: boolean): Promise<SetupStatus> {
  const env = currentEnv();
  const ref = env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const dash = (path = "") => (ref ? `https://supabase.com/dashboard/project/${ref}${path}` : "https://supabase.com/dashboard");
  const [sb, bank, ai, local, akahu] = await Promise.all([checkSupabase(env), checkPlaid(env), aiRows(), probeLocal(), checkAkahu(env)]);

  const supabase: Section = {
    id: "supabase", kind: "required",
    title: "Create your free database",
    what: "About 2 minutes. Your sign-in and money data live here, in an account only you control.",
    status: sb?.ok ? "done" : sb ? "error" : "todo",
    note: sb?.ok ? (ref ? `Project ${ref}` : sb.message) : sb?.message,
    steps: [
      ["Make a free account and project at ", { href: "https://supabase.com/dashboard/new", label: "supabase.com" }, ". Any name works. Save the database password it gives you."],
      ["Copy your Project URL from ", { href: dash("/settings/api"), label: "Project Settings → Data API" }, "."],
      ["Copy the publishable and secret keys from ", { href: dash("/settings/api-keys"), label: "Project Settings → API Keys" }, "."],
      ["Paste all three below and press Save."],
    ],
    fields: fields(env, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"], {
      NEXT_PUBLIC_SUPABASE_URL: { placeholder: "https://xxxx.supabase.co" },
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: { placeholder: "sb_publishable_…" },
      SUPABASE_SERVICE_ROLE_KEY: { placeholder: "sb_secret_…" },
    }),
  };

  let database: Section = {
    id: "database", kind: "required",
    title: "Turn on your database",
    what: "broke creates its own tables and keeps them up to date.",
    status: "todo",
    note: "Press the button, sign in to Supabase and approve broke. Nothing to copy.",
    action: "connect",
    steps: [
      ["In Supabase, click ", { href: dash("?showConnect=true"), label: "Connect" }, " and copy the Session pooler URI."],
      ["Put your database password where it says [YOUR-PASSWORD]. Lost it? ", { href: dash("/database/settings"), label: "Reset it here" }, "."],
    ],
    fields: fields(env, ["SUPABASE_DB_URL"], { SUPABASE_DB_URL: { placeholder: "postgresql://postgres.xxxx:password@…pooler.supabase.com:5432/postgres" } }),
  };
  if (!sb?.ok) database = { ...database, note: "Finish the account database first.", action: undefined };
  else if (isSet(env.SUPABASE_DB_URL) || mcpConnected(ref)) {
    if (isSet(env.SUPABASE_DB_URL)) process.env.SUPABASE_DB_URL = env.SUPABASE_DB_URL; // a value just saved, before Next's env reload lands
    const r = await migrate({ apply: false });
    if (!r.connected) database = { ...database, status: "error", note: r.error };
    else if (r.pending.length)
      database = { ...database, steps: undefined, fields: undefined, note: `${r.pending.length} update${r.pending.length === 1 ? "" : "s"} waiting. This only adds tables; your data stays as it is.`, action: "migrate" };
    else database = { ...database, status: "done", steps: undefined, fields: undefined, action: undefined, note: `Up to date · ${r.total} updates` };
  }

  const plaidSection: Section = {
    id: "plaid", kind: "required",
    title: "Connect banks",
    what: "Start with Plaid's test banks: free, with made-up money. Switch to your real banks whenever you like.",
    status: bank?.ok ? "done" : bank ? "error" : "todo",
    note: bank?.message,
    steps: [
      ["Make a free account at ", { href: "https://dashboard.plaid.com/signup", label: "plaid.com" }, ", then open ", { href: "https://dashboard.plaid.com/developers/keys", label: "Developers → Keys" }, "."],
      ["Copy the client ID and the Sandbox secret. Paste them below and press Save."],
    ],
    fields: fields(env, ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"], { PLAID_ENV: { options: ["sandbox", "production"] } }),
  };

  const aiSection: Section = {
    id: "ai", kind: "ai",
    title: "Connect your AI (optional)",
    what: "Ask questions about your money with the AI app you already use. No API keys. You can also do this later.",
    status: ai.some((p) => p.ready && p.id !== "local") ? "done" : "todo",
    note: ai.filter((p) => p.ready && p.id !== "local").map((p) => p.label).join(", ").replace(/(.+)/, "$1 ready") || undefined,
    providers: ai.filter((p) => p.id !== "local"),
  };

  const localRow = ai.find((p) => p.id === "local");
  const more: Section[] = [
    {
      id: "local", kind: "more",
      title: "Local model (private, free)",
      what: "Runs an AI model on this computer with Ollama. Slower, but nothing leaves your machine.",
      status: localRow?.ready ? "done" : "optional",
      note: localRow?.ready ? "Ready." : local.reachable ? "Ollama is running but has no models yet." : undefined,
      steps: localRow?.ready
        ? undefined
        : local.reachable
          ? [["Download a model (a few GB) with the command below, then press Check again."]]
          : [["Install ", { href: "https://ollama.com/download", label: "Ollama" }, " and open it."], ["Download a model with the command below, then press Check again."]],
      command: localRow?.ready ? undefined : "ollama pull llama3.1",
      fields: fields(env, ["LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL"], { LOCAL_LLM_BASE_URL: { placeholder: "http://localhost:11434/v1" }, LOCAL_LLM_MODEL: { placeholder: "llama3.1" } }),
    },
    ...(ref
      ? [{
          id: "mcp", kind: "more" as const,
          title: "Let Claude Code manage your database",
          what: "If you build on broke with Claude Code, this lets it read and update your Supabase project.",
          status: "optional" as const,
          steps: [["Run this in a terminal, then restart Claude Code and sign in to Supabase when it asks."]],
          command: `claude mcp add --transport http supabase-broke "https://mcp.supabase.com/mcp?project_ref=${ref}"`,
        }]
      : []),
    {
      id: "akahu", kind: "more",
      title: "New Zealand banks (Akahu)",
      what: "Akahu reads NZ bank accounts. A free personal app covers the banks on your own Akahu login.",
      status: akahu?.ok ? "done" : akahu ? "error" : "optional",
      note: akahu?.message,
      steps: [
        ["Sign up at ", { href: "https://my.akahu.nz", label: "my.akahu.nz" }, " and connect your banks."],
        ["Open Developers there, create a personal app and copy both tokens."],
      ],
      fields: fields(env, ["AKAHU_APP_TOKEN", "AKAHU_USER_TOKEN"], { AKAHU_APP_TOKEN: { placeholder: "app_token_…" }, AKAHU_USER_TOKEN: { placeholder: "user_token_…" } }),
    },
    {
      id: "enablebanking", kind: "more",
      title: "UK and European banks (Enable Banking)",
      what: "People pick their bank and approve on the bank's own page. Restricted mode covers accounts you link yourself. Other people's accounts need a contract with Enable Banking.",
      status: isSet(env.ENABLE_BANKING_APP_ID) && isSet(env.ENABLE_BANKING_PRIVATE_KEY) ? "done" : "optional",
      steps: [
        ["Sign up at ", { href: "https://enablebanking.com/sign-in/", label: "enablebanking.com" }, " and register an application."],
        [`Add this as the application's redirect URL: http://localhost:3000/api/bank/connect/enablebanking/callback`],
        ["Copy the application ID and paste its private key below."],
      ],
      fields: fields(env, ["ENABLE_BANKING_APP_ID", "ENABLE_BANKING_PRIVATE_KEY"]),
    },
    {
      id: "basiq", kind: "more",
      title: "Australian banks (Basiq)",
      what: "People approve on Basiq's own page. The sandbox is free with test banks. Real banks may need accreditation or a partner under Australia's Consumer Data Right, so ask Basiq.",
      status: isSet(env.BASIQ_API_KEY) ? "done" : "optional",
      steps: [
        ["Create an API key at ", { href: "https://dashboard.basiq.io", label: "dashboard.basiq.io" }, "."],
        [`In Basiq's dashboard, set the return address to http://localhost:3000/api/bank/connect/basiq/callback`],
      ],
      fields: fields(env, ["BASIQ_API_KEY"]),
    },
    {
      id: "belvo", kind: "more",
      title: "Brazilian banks (Belvo)",
      what: "Open Finance consent on Belvo's page. People enter their CPF and name first, as Brazil requires. Belvo requires a link to your terms. Production keys come from Belvo support.",
      status: isSet(env.BELVO_SECRET_ID) && isSet(env.BELVO_SECRET_PASSWORD) && isSet(env.BELVO_TERMS_URL) ? "done" : "optional",
      steps: [["Sign up at ", { href: "https://developers.belvo.com", label: "belvo.com" }, " and create sandbox keys under Developer Tools, API Keys."]],
      fields: fields(env, ["BELVO_SECRET_ID", "BELVO_SECRET_PASSWORD", "BELVO_TERMS_URL", "BELVO_ENV"]),
    },
    {
      id: "devlogin", kind: "more",
      title: "Skip sign-in while testing",
      what: "Adds a Skip login button on this computer only. It never works in a deployed build.",
      status: isSet(env.DEV_LOGIN_EMAIL) ? "done" : "optional",
      fields: fields(env, ["DEV_LOGIN_EMAIL"], { DEV_LOGIN_EMAIL: { placeholder: "you@example.com" } }),
    },
    cardReferralSection(),
  ];

  const required = [supabase, database, plaidSection];
  const gate = writeAllowedBasics();
  return { sections: [...required, aiSection, ...more], ready: required.every((s) => s.status === "done"), canWrite: gate.ok, writeNote: gate.reason };
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function writeAllowedBasics(): { ok: boolean; reason?: string } {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SETUP_WRITES !== "1") return { ok: false, reason: "Keys for this site are set where it's hosted, such as your Vercel project's environment variables." };
  return { ok: true };
}

/** Anyone signed in yet? Until then a wrong key can be fixed without a sign-in, which that wrong key would block. Bad keys count as nobody. */
export async function hasUsers() {
  if (!supabaseReady()) return false;
  const { createAdminClient } = await import("@/utils/supabase/admin");
  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 1 });
  return !error && data.users.length > 0;
}

/** Whether keys can be saved from the browser right now, and why not. */
export const canWriteEnv = () => writeAllowedBasics();

// Gate for POST /api/setup/env. Writing secrets to disk: every check must pass.
// ponytail: Host/Origin are client-supplied; the real fence is the dev server listening on 127.0.0.1 only (package.json "dev").
export async function writeGate(req: Request): Promise<string | null> {
  const basics = writeAllowedBasics();
  if (!basics.ok) return basics.reason!;
  if (!LOOPBACK.test(req.headers.get("host") ?? "")) return "Keys can only be saved from this computer (localhost).";
  if (!sameOrigin(req)) return "Request didn't come from this page.";
  if (!req.headers.get("content-type")?.startsWith("application/json")) return "Bad request.";
  return null;
}

/** The request came from a page on this site: Origin matches Host, and the browser didn't flag it cross-site. */
export function sameOrigin(req: Request) {
  const host = req.headers.get("host") ?? "";
  const origin = req.headers.get("origin");
  try {
    if (!origin || new URL(origin).host !== host) return false;
  } catch {
    return false;
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}

/** The page request came from this computer: the same Host check writeGate uses for saving keys. */
export async function fromLocalhost() {
  const { headers } = await import("next/headers");
  return LOOPBACK.test((await headers()).get("host") ?? "");
}

// Who may see setup status: a signed-in user, or anyone on localhost while developing
// (before Supabase exists nobody can sign in). Responses never contain key values.
export async function setupAccess() {
  const { headers } = await import("next/headers");
  let signedIn = false;
  if (supabaseReady()) {
    const { createClient } = await import("@/utils/supabase/server");
    signedIn = !!(await (await createClient()).auth.getUser()).data.user;
  }
  const host = (await headers()).get("host") ?? "";
  const localDev = (process.env.NODE_ENV !== "production" || process.env.ALLOW_SETUP_WRITES === "1") && LOOPBACK.test(host);
  return { allowed: signedIn || localDev, signedIn };
}
