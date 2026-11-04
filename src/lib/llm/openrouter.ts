import "server-only";
import { createHash, randomBytes } from "node:crypto";
import OpenAI from "openai";
import type { ProviderInfo } from "@/lib/llm/config";
import { modelsFor } from "@/lib/llm/models";
import { createAdminClient } from "@/utils/supabase/admin";

// OpenRouter: each user connects their own account in one click (OAuth PKCE) and pays OpenRouter themselves.
// It's the one AI that works when broke is hosted, where no CLI or local model can run.
const BASE = () => process.env.OPENROUTER_BASE || "https://openrouter.ai"; // OPENROUTER_BASE: a stand-in server for tests

export function authStart(callback: string) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({ callback_url: callback, code_challenge: challenge, code_challenge_method: "S256", state, key_label: "broke" });
  return { url: `${BASE()}/auth?${q}`, verifier, state };
}

async function exchangeCode(code: string, verifier: string) {
  const res = await fetch(`${BASE()}/api/v1/auth/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
  });
  if (!res.ok) throw new Error(`OpenRouter said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { key } = (await res.json()) as { key?: string };
  if (!key) throw new Error("OpenRouter sent no key");
  return key;
}

// A code works once, and browsers can load the callback more than once (a retry, a double redirect). Each code is
// exchanged one time; repeat requests share that result for a minute, so a second load can't turn success into failure.
const g = globalThis as unknown as { __brokeOrCodes?: Map<string, Promise<string>> };
const codes = (g.__brokeOrCodes ??= new Map());
export const codeSeen = (userId: string, code: string) => codes.has(`${userId}:${code}`); // per user: a code in a URL is nobody else's
export function exchangeOnce(userId: string, code: string, verifier: string) {
  const k = `${userId}:${code}`;
  const hit = codes.get(k);
  if (hit) return hit;
  const p = exchangeCode(code, verifier);
  codes.set(k, p);
  setTimeout(() => codes.delete(k), 60_000);
  return p;
}

export const saveKey = (userId: string, key: string) =>
  createAdminClient().from("ai_keys").upsert({ user_id: userId, openrouter_key: key, updated_at: new Date().toISOString() });
export const dropKey = (userId: string) => createAdminClient().from("ai_keys").delete().eq("user_id", userId);

export async function keyOf(userId: string) {
  const { data } = await createAdminClient().from("ai_keys").select("openrouter_key").eq("user_id", userId).maybeSingle();
  return (data?.openrouter_key as string | undefined) ?? null;
}

export const openRouterClient = (key: string) =>
  new OpenAI({ apiKey: key, baseURL: `${BASE()}/api/v1`, defaultHeaders: { "X-Title": "broke" } });

export const openRouterInfo = (connected: boolean): ProviderInfo => ({
  id: "openrouter", label: "OpenRouter", model: connected ? "Free models" : null, models: modelsFor("openrouter"), ready: connected,
  reason: connected ? undefined : "Connect your OpenRouter account",
});
