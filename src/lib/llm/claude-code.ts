import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanEnv, findBin } from "@/lib/llm/config";

export { cleanEnv };
import type { ChatMessage, Emit } from "@/lib/llm/shared";

// Claude via the user's own Claude Code login (their plan's allowance, not API billing).
// Locked down: --restricted drops Bash/code tools and user/project settings, --tools keeps only WebSearch,
// --strict-mcp-config loads only broke's MCP server, dontAsk refuses anything not allowed, and the cwd is an empty dir.
export const AGENT_DIR = join(homedir(), ".broke", "agent");
const MCP_SCRIPT = join(process.cwd(), "scripts", "broke-mcp.mjs");

/** Writes the per-user MCP config (0600, the token never goes on a command line). Returns its path. */
export function mcpConfigFile(userId: string, token: string, baseUrl: string) {
  const dir = join(AGENT_DIR, "mcp");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${userId}.json`);
  const config = { mcpServers: { broke: { command: process.execPath, args: [MCP_SCRIPT], env: { BROKE_URL: baseUrl, BROKE_TOKEN: token } } } };
  writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

export const lockdownArgs = (mcpFile: string, system: { text: string } | { file: string }) => [
  "--restricted",
  "--tools", "WebSearch",
  "--strict-mcp-config", "--mcp-config", mcpFile,
  "--allowedTools", "mcp__broke", "WebSearch",
  "--permission-mode", "dontAsk",
  ...("text" in system ? ["--append-system-prompt", system.text] : ["--append-system-prompt-file", system.file]),
];

// Temporary chats: --no-session-persistence keeps the CLI from writing a transcript, so each turn replays the
// short history in the prompt instead of resuming a saved session. Kept for callers that still pass one.
export const newSessionId = () => randomUUID();

/** SIGTERM the CLI, then SIGKILL if it is still running 3 s later. */
export function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill("SIGKILL"), 3000).unref();
}

/** Stops the child on abort (browser closed the chat) or after 5 minutes. Returns the cleanup for "close". */
export function guard(child: ChildProcess, signal?: AbortSignal) {
  const end = () => stop(child);
  const timer = setTimeout(end, 5 * 60_000);
  signal?.addEventListener("abort", end, { once: true });
  if (signal?.aborted) end();
  return () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", end);
  };
}

export const transcript = (messages: ChatMessage[]) =>
  messages.length === 1
    ? messages[0].content
    : `Earlier in this chat:\n${messages.slice(0, -1).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n")}\n\nNow: ${messages.at(-1)!.content}`;

/** Runs one turn with the whole short history in the prompt. Nothing is saved: no session id comes back. */
/** model: a Claude Code --model alias from models.ts (opus, sonnet, haiku, fable); omitted = the CLI's default. */
export async function runClaudeCode(o: { messages: ChatMessage[]; sessionId?: string; resume?: boolean; mcpFile: string; system: string; emit: Emit; signal?: AbortSignal; model?: string }): Promise<null> {
  const bin = findBin("claude");
  if (!bin) {
    o.emit("Claude Code isn't installed on this computer. Open Setup (gear icon) to add it.");
    return null;
  }
  // With images, the turn goes in on stdin as a stream-json message (text + base64 image blocks); -p alone takes text only.
  const images = o.messages.at(-1)?.images ?? [];
  const input = images.length
    ? JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: transcript(o.messages) }, ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } }))] } }) + "\n"
    : null;
  const args = [...(input ? ["-p", "--input-format", "stream-json"] : ["-p", transcript(o.messages)]), "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence", ...(o.model ? ["--model", o.model] : []), ...lockdownArgs(o.mcpFile, { text: o.system })];
  mkdirSync(AGENT_DIR, { recursive: true });

  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: AGENT_DIR, env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.end(input ?? "");
    const done = guard(child, o.signal);
    let buf = "";
    let wrote = false;
    let failed = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let ev: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        const e = ev.type === "stream_event" ? ev.event : null;
        if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
          o.emit(e.delta.text);
          wrote = true;
        } else if (e?.type === "content_block_start" && e.content_block?.type?.endsWith("tool_use")) {
          o.emit(`\n\u001e${String(e.content_block.name).replace(/^mcp__broke__/, "")}\n`);
        } else if (ev.type === "result" && ev.is_error) {
          failed = String(ev.result ?? ev.subtype ?? "");
        }
      }
    });
    child.stderr.on("data", (d: Buffer) => (failed ||= d.toString().slice(0, 300)));
    child.on("close", (code) => {
      done();
      if (o.signal?.aborted) return resolve(null);
      if (failed || (code && !wrote)) {
        console.error("[broke] claude code:", failed || `exit ${code}`);
        o.emit(
          /log ?in|auth|sign/i.test(failed)
            ? "\n\nClaude Code isn't signed in. Open Terminal, run `claude` once to sign in, then try again."
            : /unrecognized_model/i.test(failed)
              ? "\n\nClaude Code doesn't recognise that model. Pick another in Settings, AI assistant."
              : /limit|usage/i.test(failed)
              ? "\n\nYou've hit your Claude plan's usage limit for now. Try again later or pick another model."
              : "\n\nClaude Code couldn't answer that one. Try again in a moment.",
        );
      }
      resolve(null);
    });
  });
}
