import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { promptFor } from "@/lib/llm/cli-snapshot";
import type { ProviderInfo } from "@/lib/llm/config";
import { modelsFor, type ProviderId } from "@/lib/llm/models";
import type { ChatMessage, Emit, Tool } from "@/lib/llm/shared";
import { createAdminClient } from "@/utils/supabase/admin";

// A hosted broke has no AI apps of its own, so a small script on the person's computer (public/broke-connect.cjs) runs
// theirs: it asks this server for questions and sends back the answers. The server builds the same summary-only prompt as
// on a local copy. Only Claude and opencode: they run with no tools at all. Codex and Gemini keep a way to read files,
// which isn't safe for prompts that come from a website, so those stay local-copy only.
export const HELPER_CLIS: ProviderId[] = ["claude", "opencode"];
const LABEL: Partial<Record<ProviderId, string>> = { claude: "Claude", opencode: "opencode" };
const ONLINE_MS = 20_000;
const CODE_MS = 10 * 60_000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export type HelperCli = { id: ProviderId; models?: string[] };

/** The one-time code for the command the Connect your AI page shows. A new code signs out any earlier helper. */
export async function newPairCode(userId: string) {
  const code = randomBytes(18).toString("base64url");
  const { error } = await createAdminClient().from("ai_helpers").upsert({ user_id: userId, code_hash: hash(code), code_expires: new Date(Date.now() + CODE_MS).toISOString(), token_hash: null, clis: [], last_seen: null });
  if (error) throw error;
  return code;
}

/** Swaps a one-time code for the helper's long-lived token. The code can't be used twice. */
export async function redeemCode(code: string) {
  const db = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const { data } = await db.from("ai_helpers").update({ code_hash: null, code_expires: null, token_hash: hash(token) }).eq("code_hash", hash(code)).gt("code_expires", new Date().toISOString()).select("user_id").maybeSingle();
  return data ? token : null;
}

export async function helperUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const { data } = await createAdminClient().from("ai_helpers").select("user_id").eq("token_hash", hash(token)).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** What the helper offers. Offline helpers still list, not ready, so a saved choice shows how to reconnect. */
export async function helperProviders(userId: string): Promise<ProviderInfo[]> {
  const { data } = await createAdminClient().from("ai_helpers").select("clis, last_seen").eq("user_id", userId).maybeSingle();
  const online = !!data?.last_seen && Date.now() - new Date(data.last_seen).getTime() < ONLINE_MS;
  return ((data?.clis ?? []) as HelperCli[]).filter((c) => HELPER_CLIS.includes(c.id)).map((c) => ({
    id: c.id, label: LABEL[c.id]!, model: "On your computer", models: modelsFor(c.id, c.models ?? []), ready: online, helper: true,
    found: online ? "Connected to your computer" : "Your computer isn't connected",
    reason: online ? undefined : "Your computer isn't connected. Open Connect your AI and run the command again.",
  }));
}

/** The next question for this person's helper, claimed so it's only run once. Also clears anything left behind. */
export async function nextJob(userId: string, clis: HelperCli[]) {
  const db = createAdminClient();
  await db.from("ai_helpers").update({ clis: clis.filter((c) => HELPER_CLIS.includes(c.id)), last_seen: new Date().toISOString() }).eq("user_id", userId);
  await db.from("ai_jobs").delete().eq("user_id", userId).lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data: job } = await db.from("ai_jobs").select("id, provider, model, prompt").eq("user_id", userId).eq("status", "pending").order("created_at").limit(1).maybeSingle();
  if (!job) return null;
  const { data: claimed } = await db.from("ai_jobs").update({ status: "running" }).eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
  return claimed ? job : null;
}

/** False when the question is gone (the person left), so the helper stops its AI app. */
export async function addAnswer(userId: string, id: string, text: string, status?: "done" | "failed") {
  const db = createAdminClient();
  const { data: job } = await db.from("ai_jobs").select("answer").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!job) return false;
  await db.from("ai_jobs").update({ answer: job.answer + text, ...(status ? { status } : {}) }).eq("id", id);
  return true;
}

export async function runViaHelper(o: { userId: string; provider: ProviderId; model?: string; system: string; tools: Tool[]; messages: ChatMessage[]; emit: Emit; signal?: AbortSignal }) {
  if (o.messages.at(-1)?.images?.length) return o.emit("broke can't send pictures to your computer yet. Ask without the picture.");
  const db = createAdminClient();
  const { data: job, error } = await db.from("ai_jobs").insert({ user_id: o.userId, provider: o.provider, model: o.model ?? null, prompt: await promptFor(o.system, o.tools, o.messages) }).select("id").single();
  if (error) throw error;
  const start = Date.now();
  let sent = 0;
  try {
    while (!o.signal?.aborted && Date.now() - start < 280_000) {
      await new Promise((r) => setTimeout(r, 700));
      const { data } = await db.from("ai_jobs").select("status, answer").eq("id", job.id).single();
      if (data!.answer.length > sent) {
        o.emit(data!.answer.slice(sent));
        sent = data!.answer.length;
      }
      if (data!.status === "done") return;
      if (data!.status === "failed") return o.emit(`${LABEL[o.provider]} couldn't answer that one. Try again in a moment.`);
      if (data!.status === "pending" && Date.now() - start > 15_000) return o.emit("Your computer isn't connected. Open Connect your AI and run the command again.");
    }
    if (!o.signal?.aborted) o.emit("\n\nThat took too long. Try again in a moment.");
  } finally {
    await db.from("ai_jobs").delete().eq("id", job.id);
  }
}
