import { userTz } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { mintAgentToken } from "@/lib/llm/agent-auth";
import { runViaHelper } from "@/lib/llm/helper";
import { runCodex, runGemini, runOpencode } from "@/lib/llm/cli-snapshot";
import { mcpConfigFile, runClaudeCode } from "@/lib/llm/claude-code";
import { aiMode, chatProvider, levelOf, maskMessages, namesFor, SUMMARY_NOTE, unmaskStream } from "@/lib/llm/gate";
import { runOpenAICompat } from "@/lib/llm/openai-compat";
import { compatRun, providersFor, type ProviderId } from "@/lib/llm/providers";
import { makeTools, parseImages, profileText, SYSTEM, type ChatMessage } from "@/lib/llm/shared";
import { playbook, profileQuestions, topicsOf } from "@/lib/advice";
import { profileForModel } from "@/lib/privacy";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 300;

// Temporary chat: the browser sends the open conversation each turn and nothing is saved, here or by the CLI.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  // Started together: the names map (the slow part, it reads a year of transactions) only waits on the user.
  // Off never builds it; a full-detail local chat just doesn't use it.
  const namesP = aiMode(user) === "off" ? null : namesFor(supabase, user.id);
  namesP?.catch(() => {});
  const [body, providers, tz] = await Promise.all([request.json() as Promise<{ messages: ChatMessage[]; provider?: ProviderId; model?: string | null }>, providersFor(user.id), userTz()]);
  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m): ChatMessage => ({ role: m.role, content: m.content.replace(/^\u001e.*$/gm, "").trim() }))
        .filter((m) => m.content)
        .slice(-20)
    : [];
  if (!messages.length || messages.at(-1)!.role !== "user") return new Response("messages required", { status: 400 });
  const images = parseImages((body.messages.at(-1) as { images?: unknown } | undefined)?.images);
  if (images.length) messages[messages.length - 1] = { ...messages.at(-1)!, images };

  // The panel sends the saved choice (user_metadata.ai_model); unknown models are dropped in the gate.
  const provider = chatProvider(providers, user, { provider: body.provider, model: body.model });
  if (!provider) return new Response("Unknown provider", { status: 400 });
  const level = levelOf(user, provider.id);
  if (level === "off") return new Response("AI is off. Turn it on in Settings, AI assistant.", { status: 403 });
  // x-signin: the chat panel opens Terminal on this provider's own sign-in. Only when it's installed and signed out:
  // asking a question must never start an install. Anything else shows its setup card and waits for the button.
  if (!provider.ready) return new Response(provider.reason ?? `${provider.label} is not set up`, { status: 400, headers: provider.action === "Sign in" ? { "x-signin": provider.id } : {} });

  const profile = user.user_metadata?.profile;
  const names = level === "summary" ? await namesP! : null;
  // The playbook follows the topic of the last few user messages, so it stays loaded while the user answers questions.
  const country = (profile as { country?: string } | undefined)?.country;
  const topics = topicsOf(messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n"));
  const system = `${SYSTEM}\nToday is ${todayIn(tz)}.\n\nUser's money profile:\n${profileText(names ? profileForModel(profile, names) : profile)}\n\n${profileQuestions(country)}${topics.length ? `\n\n${playbook(country, topics)}` : ""}${names ? `\n\n${SUMMARY_NOTE}` : ""}`;
  const { data: cats } = await supabase.from("categories").select("label").order("label");
  const fullSystem = `${system}\n\nCategories: ${(cats ?? []).map((c) => c.label).join(", ")}`;
  const tools = makeTools(supabase, profile, user.id, level);
  // In summary mode the model sees placeholders for every known name, even in the user's own words and earlier replies.
  const sent = names ? maskMessages(messages, names) : messages;
  // The broke MCP server calls back on loopback, on the port the request came in on (the Host header's, so a local
  // proxy such as scripts/privacy-e2e.mjs sees the tool calls), whatever host name the browser used.
  const port = new URL(`http://${request.headers.get("host") ?? "x"}`).port || new URL(request.url).port || 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  const encoder = new TextEncoder();
  // The browser can leave mid-answer (closed panel, new chat): stop the CLI and never write to a closed stream.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const { signal } = abort;
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const write = (t: string) => {
        if (!open || signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(t));
        } catch {
          open = false;
        }
      };
      // Real names go back in here, on this Mac, before the user sees the reply.
      const swap = names ? unmaskStream(names, write) : null;
      const emit = swap ? swap.push : write;
      try {
        if (provider.helper) await runViaHelper({ userId: user.id, provider: provider.id, model: provider.use, system: fullSystem, tools, messages: sent, emit, signal });
        else if (provider.id === "claude") {
          const mcpFile = mcpConfigFile(user.id, await mintAgentToken(user), baseUrl);
          await runClaudeCode({ messages: sent, mcpFile, system: fullSystem, emit, signal, model: provider.use });
        } else if (provider.id === "codex") await runCodex({ system: fullSystem, tools, messages: sent, emit, signal });
        else if (provider.id === "gemini") await runGemini({ system: fullSystem, tools, messages: sent, emit, signal });
        else if (provider.id === "opencode") await runOpencode({ system: fullSystem, tools, messages: sent, emit, signal, model: provider.use ?? provider.model! });
        else await runOpenAICompat({ ...(await compatRun(provider, user.id)), label: provider.label, system: fullSystem, messages: sent, tools, emit, signal });
      } catch (e) {
        console.error("[broke] assistant:", e);
        emit("\n\nSomething went wrong starting the AI session. Try again in a moment.");
      }
      swap?.flush();
      if (open && !signal.aborted) {
        open = false;
        try {
          controller.close();
        } catch {
          /* already cancelled */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
