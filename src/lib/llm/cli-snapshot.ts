import "server-only";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_DIR, cleanEnv, guard } from "@/lib/llm/claude-code";
import { userTz } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { findBin, opencodeEnv } from "@/lib/llm/config";
import type { ChatMessage, Emit, Tool } from "@/lib/llm/shared";

// ChatGPT (Codex CLI) and Gemini CLI run on the user's own plan too. Neither gets broke's MCP tools or a token:
// their built-in shell/file tools can't be switched off as cleanly as Claude Code's, so instead each turn they
// get a compact data snapshot in the prompt and run read-only ("read-only" sandbox / "plan" mode) in an empty dir.
// ponytail: snapshot = this month + 90 days + recurring + accounts + 60 recent rows; give them MCP once lockdown is verified.
async function snapshot(tools: Tool[]) {
  const run = (name: string, input: Record<string, unknown> = {}) => tools.find((t) => t.name === name)!.run(input);
  const today = todayIn(await userTz()); // the user's calendar day, not UTC
  const ninety = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const parts = await Promise.all([
    run("spending_summary", { from: `${today.slice(0, 7)}-01`, to: today }),
    run("spending_summary", { from: ninety, to: today }),
    run("list_recurring"),
    run("list_accounts"),
    run("search_transactions", { limit: 60 }),
    run("get_profile"),
  ]);
  const labels = ["This month's spending", "Last 90 days' spending", "Recurring charges", "Accounts", "Recent transactions", "Money profile"];
  return labels.map((l, i) => `## ${l}\n${parts[i]}`).join("\n\n");
}

export const promptFor = async (system: string, tools: Tool[], messages: ChatMessage[]) =>
  `${system}\nYou can't look anything else up: answer only from the data below, and say so if it isn't there.\n\n# The user's data\n${await snapshot(tools)}\n\n# Chat\n${messages
    .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content}`)
    .join("\n")}\nYou:`;

function runCli(bin: string, args: string[], onLine: (line: string) => void, signal?: AbortSignal, env = cleanEnv(), onErr?: (text: string) => void): Promise<{ code: number | null; err: string }> {
  mkdirSync(AGENT_DIR, { recursive: true });
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: AGENT_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    const done = guard(child, signal);
    let buf = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => {
      buf += c.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString().slice(0, 500);
      onErr?.(d.toString());
    });
    child.on("close", (code) => {
      done();
      if (buf.trim()) onLine(buf);
      resolve({ code, err });
    });
  });
}

// The newest message's images as files, for CLIs that take paths. 0600 in a private folder; removed after the turn.
function imageFiles(messages: ChatMessage[]) {
  const imgs = messages.at(-1)?.images ?? [];
  if (!imgs.length) return { paths: [] as string[], cleanup: () => {} };
  const dir = join(AGENT_DIR, "uploads", randomUUID());
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const paths = imgs.map((i, n) => {
    const file = join(dir, `image-${n + 1}.${i.mime.split("/")[1].replace("jpeg", "jpg")}`);
    writeFileSync(file, Buffer.from(i.data, "base64"), { mode: 0o600 });
    return file;
  });
  return { paths, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const parse = (line: string) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

export async function runCodex(o: { system: string; tools: Tool[]; messages: ChatMessage[]; emit: Emit; signal?: AbortSignal }) {
  const bin = findBin("codex");
  if (!bin) return o.emit("Codex isn't installed. Open Setup (gear icon) to add it.");
  let wrote = false;
  // ponytail: codex exec's -i/--image flag from Codex's docs; not run on this Mac (Codex isn't installed here).
  const files = imageFiles(o.messages);
  const { code, err } = await runCli(
    bin,
    ["exec", ...files.paths.flatMap((p) => ["-i", p]), "--json", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "--ignore-user-config", "-C", AGENT_DIR, await promptFor(o.system, o.tools, o.messages)],
    (line) => {
      const ev = parse(line);
      if (ev?.type === "item.completed" && ev.item?.type === "agent_message" && ev.item.text) {
        o.emit((wrote ? "\n\n" : "") + ev.item.text);
        wrote = true;
      }
    },
    o.signal,
  );
  files.cleanup();
  if (!wrote && !o.signal?.aborted) {
    console.error("[broke] codex:", code, err);
    o.emit(/login|auth/i.test(err) ? "ChatGPT isn't signed in. Run `codex login` in Terminal, then try again." : "ChatGPT couldn't answer that one. Try again in a moment.");
  }
}

export async function runGemini(o: { system: string; tools: Tool[]; messages: ChatMessage[]; emit: Emit; signal?: AbortSignal }) {
  const bin = findBin("gemini");
  if (!bin) return o.emit("Gemini CLI isn't installed. Open Setup (gear icon) to add it.");
  if (o.messages.at(-1)?.images?.length) return o.emit("Gemini can't look at images in broke yet. Pick Claude to ask about a picture.");
  let out = "";
  const { code, err } = await runCli(bin, ["-p", await promptFor(o.system, o.tools, o.messages), "--output-format", "json", "--approval-mode", "plan", "--skip-trust"], (line) => (out += line + "\n"), o.signal);
  // Temporary chat: Gemini CLI has no flag to skip saving, so remove what it keeps for this folder (keyed by a hash of the path).
  // ponytail: path layout taken from Gemini CLI's docs, not checked on this Mac (not installed); check after installing it.
  rmSync(join(homedir(), ".gemini", "tmp", createHash("sha256").update(AGENT_DIR).digest("hex")), { recursive: true, force: true });
  const body = parse(out.trim());
  if (body?.response) return o.emit(body.response);
  if (o.signal?.aborted) return;
  console.error("[broke] gemini:", code, err || body?.error);
  o.emit(/auth|login|sign/i.test(err) ? "Gemini isn't signed in. Run `gemini` in Terminal once, then try again." : "Gemini couldn't answer that one. Try again in a moment.");
}

// opencode runs any model it can reach: open-source ones on opencode's own free tier, OpenRouter, Groq, or the user's
// other logins. Every tool denied and broke's own empty config (opencodeEnv), so like Codex it answers from the snapshot.
// `opencode run` doesn't exit after its answer (1.19.4), so it is stopped on the first finished step or stream error.
export async function runOpencode(o: { system: string; tools: Tool[]; messages: ChatMessage[]; emit: Emit; signal?: AbortSignal; model: string }) {
  const bin = findBin("opencode");
  if (!bin) return o.emit("opencode isn't installed. Open Setup (gear icon) to add it.");
  const stop = new AbortController();
  o.signal?.addEventListener("abort", () => stop.abort(), { once: true });
  let wrote = false;
  let failed = "";
  let session = "";
  const files = imageFiles(o.messages);
  await runCli(
    bin,
    ["run", await promptFor(o.system, o.tools, o.messages), "--format", "json", "--print-logs", "--log-level", "ERROR", "-m", o.model, ...files.paths.flatMap((p) => ["-f", p])],
    (line) => {
      const ev = parse(line);
      session ||= ev?.sessionID ?? "";
      if (ev?.type === "text" && ev.part?.text) {
        o.emit((wrote ? "\n\n" : "") + ev.part.text);
        wrote = true;
      }
      if (ev?.type === "step_finish" && ev.part?.reason !== "tool-calls") stop.abort();
    },
    stop.signal,
    opencodeEnv(),
    (text) => {
      if (!/level=ERROR/.test(text)) return;
      failed ||= text;
      stop.abort();
    },
  );
  files.cleanup();
  // Temporary chat: opencode keeps every session, so delete this one.
  if (session) execFile(bin, ["session", "delete", session], { env: opencodeEnv(), timeout: 8000 }, () => {});
  if (wrote || o.signal?.aborted) return;
  console.error("[broke] opencode:", o.model, failed.slice(0, 500));
  o.emit(
    /usage limit|rate limit|429/i.test(failed) ? `${o.model} hit its usage limit. Pick another model or try again later.`
      : /auth|api key|unauthori[sz]ed|401/i.test(failed) ? "opencode isn't signed in for that model. Run `opencode auth login` in Terminal, then try again."
      : "opencode couldn't answer that one. Try again in a moment.",
  );
}
