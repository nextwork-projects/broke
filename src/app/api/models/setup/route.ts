import { execFile } from "node:child_process";
import { isLocalRequest } from "@/lib/llm/agent-auth";
import { aiProviders, type ProviderId } from "@/lib/llm/providers";
import { createClient } from "@/utils/supabase/server";

const SIGN_IN: Partial<Record<ProviderId, string>> = { claude: "claude", codex: "codex login", gemini: "gemini", opencode: "opencode auth login" };

const run = (bin: string, args: string[]) =>
  new Promise<boolean>((resolve) => execFile(bin, args, { timeout: 30_000 }, (err) => resolve(!err)));

// "Set up in Terminal" from the chat's model picker: opens Terminal with that provider's own install and
// sign-in commands (fixed strings from config.ts, never from the request). Mac + this computer only.
export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!isLocalRequest(request)) return new Response("Only on this computer", { status: 403 });
  const { id, force } = (await request.json().catch(() => ({}))) as { id?: ProviderId; force?: boolean };
  const p = (await aiProviders(true)).find((x) => x.id === id);
  if (!p) return new Response("Unknown model", { status: 400 });
  if (p.ready && !force) return Response.json({ ready: true });

  const page = p.howTo?.find((h) => h.href && !h.command)?.href; // e.g. the Ollama download, an app not a command
  // force: a run just came back signed out, whatever the status check says, so it's the sign-in step at least.
  const command = (p.howTo ?? []).flatMap((h) => (h.command ? [h.command] : [])).join(" && ") || (force ? SIGN_IN[p.id] : "") || "";
  if (process.platform !== "darwin") return Response.json({ opened: false, command, page });
  if (page && !command) return Response.json({ opened: await run("open", [page]), page });
  if (page) await run("open", [page]);
  const esc = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const opened = await run("osascript", ["-e", `tell application "Terminal" to do script "${esc}"`, "-e", 'tell application "Terminal" to activate']);
  return Response.json({ opened, command });
}
