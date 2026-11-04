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
type Saved = { ref?: string; redirect?: string; client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string; state?: string };

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

const serverUrl = (ref: string) => `https://mcp.supabase.com/mcp?project_ref=${ref}`;
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
export async function startConnect(ref: string, redirect: string): Promise<string | null> {
  const s = load();
  // A new project or a new callback address needs a fresh client registration and fresh tokens.
  if (s.ref !== ref || s.redirect !== redirect) save({ ref, redirect, client: undefined, tokens: undefined });
  let url: URL | undefined;
  const r = await auth(provider(redirect, (u) => (url = u)), { serverUrl: serverUrl(ref) });
  return r === "AUTHORIZED" ? null : url!.toString();
}

/** Finishes the sign-in from the callback. Throws on a wrong state (not our request) or a refused code. */
export async function finishConnect(code: string, state: string | null) {
  const s = load();
  if (!s.ref || !s.redirect || !state || state !== s.state) throw new Error("This sign-in didn't start on this computer. Press Connect Supabase again.");
  await auth(provider(s.redirect), { serverUrl: serverUrl(s.ref), authorizationCode: code });
  save({ state: undefined, verifier: undefined });
}

export type Exec = (sql: string) => Promise<Record<string, unknown>[]>;

/** One MCP session whose exec runs SQL with execute_sql and returns the rows. */
export async function mcpSession(): Promise<{ exec: Exec; close: () => Promise<void> }> {
  const s = load();
  if (!s.ref || !s.redirect) throw new Error("Supabase isn't connected.");
  const client = new Client({ name: "broke", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl(s.ref)), { authProvider: provider(s.redirect) }));
  const exec: Exec = async (query) => {
    const res = await client.callTool({ name: "execute_sql", arguments: { query } });
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
