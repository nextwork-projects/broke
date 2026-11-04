import "server-only";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

// Tokens that let a CLI session's broke MCP server read one user's data (via /api/agent/*), and nothing else.
// Each token holds the agent's OWN Supabase session (minted with a magic-link exchange), so refreshing it never
// rotates the browser's refresh token. Memory only: a server restart revokes every token. Never logged.
type Entry = { userId: string; access_token: string; refresh_token: string; expires: number };
const DAY = 24 * 60 * 60 * 1000;
const g = globalThis as unknown as { __brokeAgent?: Map<string, Entry> };
const tokens = (g.__brokeAgent ??= new Map<string, Entry>());

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** One token per user, reused until it expires (24 h). */
export async function mintAgentToken(user: User): Promise<string> {
  const now = Date.now();
  for (const [t, e] of tokens) {
    if (e.expires < now) tokens.delete(t);
    else if (e.userId === user.id) return t;
  }
  if (!user.email) throw new Error("agent sessions need an email sign-in");
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error) throw error;
  const { data: v, error: ve } = await anon().auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (ve || !v.session) throw ve ?? new Error("no session");
  const token = randomBytes(32).toString("base64url");
  tokens.set(token, { userId: user.id, access_token: v.session.access_token, refresh_token: v.session.refresh_token, expires: now + DAY });
  return token;
}

/** A Supabase client acting as the token's user (RLS applies), refreshing the agent's own session when needed. */
export async function agentClient(token: string | null): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const e = token ? tokens.get(token) : undefined;
  if (!e || e.expires < Date.now()) return null;
  const supabase = anon();
  const { data, error } = await supabase.auth.setSession({ access_token: e.access_token, refresh_token: e.refresh_token });
  if (error || !data.session || !data.user || data.user.id !== e.userId) return null;
  e.access_token = data.session.access_token;
  e.refresh_token = data.session.refresh_token;
  return { supabase, user: data.user };
}

export const isLocalRequest = (request: Request) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
