import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { allRows, displayName } from "@/lib/data";
import type { ProviderInfo } from "@/lib/llm/config";
import { choiceOf, validModel, type ModelChoice } from "@/lib/llm/models";
import type { Facts, Move } from "@/lib/plan";
import { bankEvent, levelFor, mask, modeOf, newNames, ph, planSummary, unmask, unmaskStream, type AiMode, type Level, type Names } from "@/lib/privacy";

// The one gate every AI path goes through: chat, the MCP tools route, check-ins and the money plan.
// The mode lives in user_metadata.ai_mode. Off: no model call at all. Summary only: the default, and all a cloud
// model ever gets. On this Mac only: full detail, but only for the local model.

type Who = Pick<User, "user_metadata"> | null | undefined;
export const aiMode = (user: Who): AiMode => modeOf(user?.user_metadata);
/** False in Off mode. Check it before running anything that calls a model. */
export const aiAllowed = (user: Who) => aiMode(user) !== "off";
export const levelOf = (user: Who, provider: string): Level => levelFor(aiMode(user), provider);

/** A provider ready to run, with the model to run it on. use: the model for the runner (claude --model, the local
 * model id), undefined for the provider's default. For the local provider, model is set to it too. */
export type Picked = ProviderInfo & { use?: string };
const withModel = (p: ProviderInfo, model: string | null | undefined): Picked => {
  const use = validModel(p.models, model) ?? undefined;
  return p.id === "local" && use ? { ...p, model: use, use } : { ...p, use };
};

/** The user's saved model (user_metadata.ai_model). Chat, check-ins and the plan all use it. */
export const savedChoice = (user: Who): ModelChoice | null => choiceOf(user?.user_metadata);

/**
 * For check-ins and the plan: the saved choice when it is ready, else the local model in "On this Mac only",
 * else the first ready one. None when Off. Privacy is unchanged: levelOf() still gives a cloud model the summary only.
 */
export function pickProvider(providers: ProviderInfo[], user: Who): Picked | null {
  const mode = aiMode(user);
  if (mode === "off") return null;
  const choice = savedChoice(user);
  const saved = choice && providers.find((p) => p.id === choice.provider && p.ready);
  if (saved) return withModel(saved, choice.model);
  const p = (mode === "local" ? providers.find((x) => x.id === "local" && x.ready) : undefined) ?? providers.find((x) => x.ready);
  return p ? withModel(p, null) : null;
}

/** For chat: what the panel asked for, else the saved choice, else the first ready one. Ready or not: the panel shows setup steps. */
export function chatProvider(providers: ProviderInfo[], user: Who, asked: { provider?: string; model?: string | null }): Picked | null {
  const choice = savedChoice(user);
  const id = asked.provider ?? choice?.provider ?? providers.find((x) => x.ready)?.id ?? "openrouter";
  const p = providers.find((x) => x.id === id);
  if (!p) return null;
  return withModel(p, asked.provider ? asked.model : choice?.provider === id ? choice.model : null);
}

export const SUMMARY_NOTE = `Privacy: this user chose "Summary only". Tools return monthly totals and rounded amounts, never single transactions, days, account numbers or notes.
Names are placeholder tokens: ⟨M1⟩ a merchant, ⟨S2⟩ a subscription, ⟨I1⟩ income, ⟨A1⟩ an account, ⟨H1⟩ a holding, ⟨L3⟩ a link. broke swaps the real names back in before the user sees your reply, so never guess a real name.
- Copy each token exactly, brackets included, every time you mean it. In a list write every token in full: "⟨S1⟩, ⟨S2⟩ and ⟨S3⟩", never "⟨S1⟩, 2 and 3" or "Subscriptions 1 and 3".
- Write a token once. Don't repeat its type or name in brackets after it.
- For a link token write a markdown link: [Cancel here](⟨L3⟩).
- An entry with bank_event instead of a merchant is interest, a fee, a transfer, a card or loan payment, or tax. It is not a company: never tell the user to call, cancel or switch it. Say what it is, for example "card interest".
Say amounts are about, since they are rounded. If a question needs detail you don't have, say the summary doesn't show it.`;

// Placeholder maps, per user, in this server's memory only. Never written to disk, never sent anywhere.
// Built in a fixed order (recurring, then merchants by spend, accounts, holdings) and only ever added to,
// so the chat route and the MCP tool calls of the same answer agree. Rebuilt after 30 idle minutes.
const g = globalThis as unknown as { __brokeNames2?: Map<string, { names: Names; at: number; loaded: number }> };
const maps = (g.__brokeNames2 ??= new Map());

export async function namesFor(supabase: SupabaseClient, userId: string): Promise<Names> {
  const now = Date.now();
  let hit = maps.get(userId);
  if (!hit || now - hit.at > 30 * 60_000) hit = { names: newNames(), at: now, loaded: 0 };
  hit.at = now;
  maps.set(userId, hit);
  if (now - hit.loaded < 60_000) return hit.names;
  const since = new Date(now - 400 * 864e5).toISOString().slice(0, 10);
  const [{ data: streams }, txns, { data: accounts }, { data: holdings }] = await Promise.all([
    supabase.from("recurring").select("merchant_name, is_income").eq("user_id", userId),
    allRows<{ merchant_name: string | null; custom_name: string | null; name: string; amount: number }>((a, b) =>
      supabase.from("transactions").select("merchant_name, custom_name, name, amount").eq("user_id", userId).gte("date", since).order("id").range(a, b)),
    supabase.from("accounts").select("name, custom_name").eq("user_id", userId),
    supabase.from("holdings").select("name").eq("user_id", userId),
  ]);
  const names = hit.names;
  const sorted = [...(streams ?? [])].sort((a, b) => String(a.merchant_name).localeCompare(String(b.merchant_name)));
  for (const s of sorted) ph(names, s.is_income ? "Income" : "Subscription", s.merchant_name);
  const spend = new Map<string, number>();
  for (const t of txns) spend.set(displayName(t), (spend.get(displayName(t)) ?? 0) + Math.abs(Number(t.amount)));
  // Bank events ("Interest charged") get no placeholder: the model sees what they are instead.
  for (const [n] of [...spend].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) if (!bankEvent(n)) ph(names, "Merchant", n);
  for (const a of accounts ?? []) {
    const p = ph(names, "Account", a.custom_name || a.name);
    if (a.custom_name && a.name && !names.fwd.has(a.name.trim().toLowerCase())) names.fwd.set(a.name.trim().toLowerCase(), p); // the bank's name masks to the same placeholder
  }
  for (const h of holdings ?? []) ph(names, "Holding", h.name);
  hit.loaded = now;
  return names;
}

/** Chat messages as a summary-mode model may see them: every known name replaced by its placeholder. */
export const maskMessages = <M extends { content: string }>(messages: M[], names: Names) => messages.map((m) => ({ ...m, content: mask(m.content, names) }));
export { unmask, unmaskStream };

/**
 * The money plan's input for one provider. Summary level: facts and candidates summarised, plus restore() for the reply.
 * The plan route calls aiAllowed(user) first and skips the AI in Off mode.
 */
export async function planForModel(supabase: SupabaseClient, user: Who & { id: string }, provider: string, facts: Facts, candidates: Move[]) {
  if (levelOf(user, provider) === "full") return { facts, candidates, restore: (t: string) => t };
  const names = await namesFor(supabase, user.id);
  return { ...planSummary(facts, candidates, names), restore: (t: string) => unmask(t, names) };
}
