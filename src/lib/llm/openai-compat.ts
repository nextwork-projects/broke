import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { ChatMessage, Emit, Tool } from "@/lib/llm/shared";

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// One adapter for every OpenAI-compatible API: OpenRouter, Ollama, LM Studio.
export async function runOpenAICompat({
  client, model, label, system, messages, tools, emit, signal,
}: { client: OpenAI; model: string; label: string; system: string; messages: ChatMessage[]; tools: Tool[]; emit: Emit; signal?: AbortSignal }) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const defs: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.schema) as Record<string, unknown> },
  }));
  const history: Msg[] = [
    { role: "system", content: `${system}\nYou cannot browse the web: when you quote a contribution limit or tax rule, name the year and say to confirm it.` },
    // Images as OpenAI-style parts; only vision models (llava, qwen-vl...) read them, others answer from the text.
    ...messages.map((m) => ({ role: m.role, content: m.images?.length ? [{ type: "text", text: m.content }, ...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } }))] : m.content }) as Msg),
  ];

  try {
    for (let i = 0; i < 8; i++) {
      const stream = await client.chat.completions.create({ model, messages: history, ...(defs.length ? { tools: defs } : {}), stream: true }, { signal });
      let text = "";
      const calls: { id: string; name: string; args: string }[] = [];
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          text += delta.content;
          emit(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.args += tc.function.arguments;
        }
      }
      if (!calls.length) return;

      history.push({
        role: "assistant",
        content: text || null,
        tool_calls: calls.map((c, n) => ({ id: c.id || `call_${i}_${n}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } })),
      });
      // Run the batch in parallel, then answer every call (errors included) before the next turn.
      const results = await Promise.all(
        calls.map(async (c, n) => {
          emit(`\n\u001e${c.name}\n`);
          const t = byName.get(c.name);
          let content: string;
          if (!t) content = JSON.stringify({ error: `Unknown tool ${c.name}` });
          else {
            let raw: unknown;
            try {
              raw = JSON.parse(c.args || "{}");
            } catch {
              raw = undefined;
            }
            const parsed = t.schema.safeParse(raw);
            content = parsed.success ? await t.run(parsed.data as Record<string, unknown>) : JSON.stringify({ error: "Invalid arguments", issues: parsed.error?.issues ?? "not JSON" });
          }
          return { role: "tool" as const, tool_call_id: c.id || `call_${i}_${n}`, content };
        }),
      );
      history.push(...results);
    }
    emit("\n\nI stopped after 8 tool steps. Try a narrower question.");
  } catch (e) {
    if (signal?.aborted) return;
    console.error(e);
    const status = e instanceof OpenAI.APIError ? e.status : undefined;
    emit(
      `\n\n${
        status === 401 || status === 403
          ? `${label} couldn't sign in. Reconnect it on [Connect your AI](/connect-ai).`
          : status === 429
            ? "Too many requests. Free models get busy, so try again in a minute."
            : status === 402
              ? `Your ${label} account is out of credits. Pick the free models on [Connect your AI](/connect-ai).`
            : status === 404
              ? `${label} doesn't recognise the chosen model. Pick another on [Connect your AI](/connect-ai).`
              : e instanceof OpenAI.APIConnectionError
                ? `Could not reach ${label}. Is it running?`
                : `Something went wrong talking to ${label}.`
      }`,
    );
  }
}
