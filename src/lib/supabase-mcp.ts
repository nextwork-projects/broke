// "Connect Supabase": one browser sign-in (OAuth with PKCE, the same one Claude Code uses for the Supabase MCP
// server) instead of pasting a database password. broke then runs its migrations through the server's execute_sql.
// Tokens live in ~/.broke/supabase-mcp.json (0600), never in .env. No "@/" imports: migrate.ts loads this from plain node.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

const FILE = join(homedir(), ".broke", "supabase-mcp.json");
type Saved = { ref?: string; all?: boolean; redirect?: string; client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string; state?: string };

const load = (): Saved => {
  try {
    return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Saved) : {};
  } catch {
    return {};
  }
};
const save = (patch: Saved) => {
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(FILE, JSON.stringify({ ...load(), ...patch }), { mode: 0o600 });
  chmodSync(FILE, 0o600);
};

// One project (the older flow), or the whole account (all: the setup page's first step, which picks the project after).
const serverUrl = (ref?: string) => (ref ? `https://mcp.supabase.com/mcp?project_ref=${ref}` : "https://mcp.supabase.com/mcp");
const urlOf = (s: Saved) => serverUrl(s.all ? undefined : s.ref);
export const refFromUrl = (url?: string) => url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

function provider(redirect: string, onRedirect?: (u: URL) => void): OAuthClientProvider {
  return {
    get redirectUrl() { return redirect; },
    get clientMetadata() {
      return { client_name: "broke", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
    },
    state: () => {
      const state = randomBytes(16).toString("hex");
      save({ state });
      return state;
    },
    clientInformation: () => load().client,
    saveClientInformation: (client) => save({ client }),
    tokens: () => load().tokens,
    saveTokens: (tokens) => save({ tokens }),
    redirectToAuthorization: (u) => onRedirect?.(u),
    saveCodeVerifier: (verifier) => save({ verifier }),
    codeVerifier: () => load().verifier ?? "",
  };
}

// A URL saved on /setup this session isn't in process.env until Next reloads it.
export const savedRef = () => load().ref;

/** True when this computer holds a Supabase sign-in for the project in the .env URL. */
export const mcpConnected = (ref?: string) => {
  const s = load();
  return !!ref && s.ref === ref && !!s.tokens;
};

/** Starts the sign-in. Returns the Supabase approval page to send the browser to, or null if already signed in. */
// ref undefined: sign in to the whole account, so broke can list projects and fill in the URL and public key itself.
export async function startConnect(ref: string | undefined, redirect: string): Promise<string | null> {
  const s = load();
  const all = !ref;
  // A new project, a change between one project and the whole account, or a new callback address needs fresh tokens.
  if (all ? !s.all : s.all || s.ref !== ref) save({ ref, all, redirect, client: undefined, tokens: undefined });
  else if (s.redirect !== redirect) save({ redirect, client: undefined, tokens: undefined });
  let url: URL | undefined;
  const r = await auth(provider(redirect, (u) => (url = u)), { serverUrl: serverUrl(ref) });
  return r === "AUTHORIZED" ? null : url!.toString();
}

/** Finishes the sign-in from the callback. Throws on a wrong state (not our request) or a refused code. */
export async function finishConnect(code: string, state: string | null) {
  const s = load();
  if ((!s.ref && !s.all) || !s.redirect || !state || state !== s.state) throw new Error("This sign-in didn't start on this computer. Press Connect Supabase again.");
  await auth(provider(s.redirect), { serverUrl: urlOf(s), authorizationCode: code });
  save({ state: undefined, verifier: undefined });
}

export type Exec = (sql: string) => Promise<Record<string, unknown>[]>;

/** One MCP session whose exec runs SQL with execute_sql and returns the rows. */
export async function mcpSession(): Promise<{ exec: Exec; close: () => Promise<void> }> {
  const s = load();
  if (!s.ref || !s.redirect) throw new Error("Supabase isn't connected.");
  const client = await connectClient(s);
  const exec: Exec = async (query) => {
    const res = await client.callTool({ name: "execute_sql", arguments: s.all ? { project_id: s.ref, query } : { query } });
    const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("");
    if (res.isError) throw new Error(text.slice(0, 500));
    // Rows come back wrapped: {"result":"...<untrusted-data-ID>\n[rows]\n</untrusted-data-ID>..."}.
    let body = text;
    try {
      body = (JSON.parse(text) as { result?: string }).result ?? text;
    } catch { /* already plain text */ }
    // The intro sentence names the tag too ("within the below <untrusted-data-ID> boundaries"), so match only the JSON block.
    const rows = body.match(/<untrusted-data-[\w-]+>\s*(\[[\s\S]*\])\s*<\/untrusted-data-[\w-]+>/)?.[1];
    if (/"error"/.test(body) && !rows) throw new Error(body.slice(0, 500));
    return rows ? (JSON.parse(rows) as Record<string, unknown>[]) : [];
  };
  return { exec, close: () => client.close() };
}

async function connectClient(s: Saved) {
  const client = new Client({ name: "broke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(urlOf(s)), { authProvider: provider(s.redirect!) }));
  return client;
}

// A tool's reply as text (whatever wrapping the server puts around it).
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("");
  if (res.isError) throw new Error(text.slice(0, 300));
  return text;
}
const unwrap = (text: string) => {
  let body = text;
  try { body = (JSON.parse(text) as { result?: string }).result ?? text; } catch { /* plain text */ }
  return body.match(/<untrusted-data-[\w-]+>\s*([\s\S]*?)\s*<\/untrusted-data-[\w-]+>/)?.[1] ?? body;
};

/** Signed in to the whole account on this computer (the setup page's first step). */
export const accountConnected = () => {
  const s = load();
  return !!s.all && !!s.tokens;
};

export type Project = { id: string; name: string; region?: string; status?: string };
// Supabase's list tools wrap the list: {"projects": [...]}, {"organizations": [...]}. A bare list works too.
const listOf = <T,>(text: string, key: string): T[] => {
  const raw = JSON.parse(text) as T[] | Record<string, T[]>;
  return Array.isArray(raw) ? raw : raw[key] ?? [];
};

/** The projects this Supabase account can see. */
export async function listProjects(): Promise<Project[]> {
  const s = load();
  const client = await connectClient(s);
  try {
    return listOf<Project>(unwrap(await call(client, "list_projects", {})), "projects").map((p) => ({ id: p.id, name: p.name, region: p.region, status: p.status }));
  } finally {
    await client.close().catch(() => {});
  }
}

/** Picks a project: its address and publishable key, read through the sign-in. Saves the choice for the migrations. */
export async function projectKeys(ref: string) {
  const s = load();
  const client = await connectClient(s);
  try {
    const url = unwrap(await call(client, "get_project_url", { project_id: ref })).match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const keys = unwrap(await call(client, "get_publishable_keys", { project_id: ref }));
    const key = keys.match(/sb_publishable_[\w-]+/)?.[0] ?? keys.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0];
    if (!url || !key) throw new Error("Supabase didn't return this project's address and key.");
    save({ ref });
    return { url, key };
  } finally {
    await client.close().catch(() => {});
  }
}

// Calls a tool with only the inputs its own schema asks for, picked from what broke knows. The account tools' inputs
// aren't documented, so this reads them from the server rather than guessing names.
async function callFit(client: Client, name: string, pool: Record<string, unknown>) {
  const { tools } = await client.listTools();
  const props = Object.keys((tools.find((t) => t.name === name)?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});
  return unwrap(await call(client, name, Object.fromEntries(props.filter((k) => k in pool).map((k) => [k, pool[k]]))));
}

/** Makes a free project called "broke" in the first organization, and waits until it's ready (a minute or two). */
export async function createProject(region = "us-east-1") {
  try {
    return await makeProject(region);
  } catch (e) {
    // Supabase allows each person 2 active free projects, counted across all their organizations.
    if (/maximum limits?|project limit/i.test(e instanceof Error ? e.message : "")) throw new Error("Your Supabase account already has 2 free projects, Supabase's limit. Pause or delete one at supabase.com, then try again. Or connect again and pick the organization that has a project to use.");
    throw e;
  }
}

async function makeProject(region: string) {
  const s = load();
  const client = await connectClient(s);
  try {
    const orgs = listOf<{ id: string }>(unwrap(await call(client, "list_organizations", {})), "organizations");
    if (!orgs.length) throw new Error("This Supabase account has no organization yet. Open supabase.com once to make one.");
    const pool: Record<string, unknown> = { type: "project", organization_id: orgs[0].id, name: "broke", region, recurrence: "monthly" };
    // Supabase asks to confirm the cost first. A free organization's project costs $0; anything else is the user's call.
    const cost = await callFit(client, "get_cost", pool);
    const amount = Number(cost.match(/"amount"\s*:\s*([\d.]+)/)?.[1] ?? cost.match(/\$\s*([\d.]+)/)?.[1] ?? 0);
    if (amount > 0) throw new Error("A new project would cost money on this account. Make one yourself at supabase.com instead.");
    // Free: Supabase's create_project says to call it without a cost confirmation unless it asks for one.
    const one = (t: string) => { const r = JSON.parse(t) as Project & { project?: Project }; return r.project ?? r; };
    let made: Project;
    try {
      made = one(await callFit(client, "create_project", pool));
    } catch (e) {
      if (!/confirm/i.test(e instanceof Error ? e.message : "")) throw e;
      const confirm = await callFit(client, "confirm_cost", { ...pool, amount });
      pool.confirm_cost_id = (() => { try { const c = JSON.parse(confirm) as { confirmation_id?: string; confirm_cost_id?: string; id?: string }; return c.confirmation_id ?? c.confirm_cost_id ?? c.id; } catch { return confirm.match(/[A-Za-z0-9_-]{16,}/)?.[0] ?? confirm.trim(); } })();
      made = one(await callFit(client, "create_project", pool));
    }
    for (let i = 0; i < 60; i++) {
      const p = one(await callFit(client, "get_project", { id: made.id, project_id: made.id }));
      if (p.status === "ACTIVE_HEALTHY") return made.id;
      await new Promise((r) => setTimeout(r, 5000));
    }
    return made.id; // still starting: the next step says so if it isn't ready
  } finally {
    await client.close().catch(() => {});
  }
}
