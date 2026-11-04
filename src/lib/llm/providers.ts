import "server-only";
import OpenAI from "openai";
import { aiProviders, localBase, probeLocal, type ProviderInfo } from "@/lib/llm/config";
import { OPENROUTER_FREE } from "@/lib/llm/models";
import { helperProviders } from "@/lib/llm/helper";
import { keyOf, openRouterClient, openRouterInfo } from "@/lib/llm/openrouter";

export type { ProviderId, ProviderInfo } from "@/lib/llm/config";
export { aiProviders, probeLocal };
/** @deprecated use aiProviders */
export const providers = aiProviders;

// Ollama / LM Studio speak the OpenAI API locally; the key is ignored.
export const localClient = () => new OpenAI({ apiKey: "local", baseURL: localBase() });

// Hosted, the server has no CLIs or local models of its own: OpenRouter, or the AI apps on the person's computer through the helper.
export const isHosted = () => process.env.BROKE_HOSTED === "1" || !!process.env.VERCEL;

/** What this user can pick: their OpenRouter connection, plus what this computer has, or when hosted what their helper offers. */
export async function providersFor(userId: string, fresh = false): Promise<ProviderInfo[]> {
  const [key, here] = await Promise.all([keyOf(userId).catch(() => null), isHosted() ? helperProviders(userId).catch(() => []) : aiProviders(fresh)]);
  return [openRouterInfo(!!key), ...here];
}

/** The client and model for a provider that speaks the OpenAI API: OpenRouter (their key) or the local model. */
export async function compatRun(provider: { id: string; use?: string; model: string | null }, userId: string) {
  if (provider.id !== "openrouter") return { client: localClient(), model: provider.model! };
  const key = await keyOf(userId);
  if (!key) throw new Error("OpenRouter isn't connected");
  return { client: openRouterClient(key), model: provider.use ?? OPENROUTER_FREE };
}
