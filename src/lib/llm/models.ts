// Which model answers: one saved choice per user (user_metadata.ai_model), used by chat, check-ins and the money plan.
// Pure, no Node imports: the chat panel and Settings use it too. Run: node src/lib/llm/models.test.ts
export type ProviderId = "openrouter" | "claude" | "codex" | "gemini" | "opencode" | "local";
export type ModelOption = { id: string; label: string };
/** model null = the provider's own default. */
export type ModelChoice = { provider: ProviderId; model: string | null };

// Claude Code --model aliases. Each was run with `claude -p --model <alias>` on 2026-10-23 (an unknown alias errors).
export const CLAUDE_MODELS: ModelOption[] = [
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "fable", label: "Fable" },
];

// OpenRouter's two routers, both listed with tool support on 2026-11-01. The free one is the default: it costs nothing.
export const OPENROUTER_FREE = "openrouter/free";
export const OPENROUTER_MODELS: ModelOption[] = [
  { id: OPENROUTER_FREE, label: "Free models" },
  { id: "openrouter/auto", label: "Best model for each question (uses your credits)" },
];

/** The models a provider can run, besides its default. Codex and Gemini: default only (not installed here, flags unverified).
 * found: what the provider reported (the local server's models, or `opencode models`, open-source ones included). */
export const modelsFor = (id: ProviderId, found: string[] = []): ModelOption[] =>
  id === "claude" ? CLAUDE_MODELS : id === "openrouter" ? OPENROUTER_MODELS : id === "local" || id === "opencode" ? found.map((m) => ({ id: m, label: m })) : [];

const PROVIDERS: ProviderId[] = ["openrouter", "claude", "codex", "gemini", "opencode", "local"];
export function choiceOf(meta: Record<string, unknown> | null | undefined): ModelChoice | null {
  const c = meta?.ai_model as { provider?: unknown; model?: unknown } | undefined;
  if (!c || !PROVIDERS.includes(c.provider as ProviderId)) return null;
  return { provider: c.provider as ProviderId, model: typeof c.model === "string" && c.model ? c.model : null };
}

/** The model to pass to the runner, or null for the default. Anything not in the list is dropped, never passed on. */
export const validModel = (models: ModelOption[], model: string | null | undefined) => (model && models.some((m) => m.id === model) ? model : null);

// A local model, or a smaller or faster cloud one. General wording only: no benchmark behind it.
export const isSmall = (provider: string, model: string | null | undefined) => provider === "local" || /haiku|mini|flash|nano|lite|small/i.test(model ?? "");
export const QUALITY_NOTE = "Smaller models can give weaker money advice. For your plan, Claude Opus or Sonnet works best.";

// The chat header and Settings show one list: "claude:" (default), "claude:opus", "local:llama3.1".
export const encode = (c: ModelChoice) => `${c.provider}:${c.model ?? ""}`;
export const decode = (v: string): ModelChoice => {
  const i = v.indexOf(":");
  const provider = (i < 0 ? v : v.slice(0, i)) as ProviderId;
  return { provider, model: i < 0 ? null : v.slice(i + 1) || null };
};
