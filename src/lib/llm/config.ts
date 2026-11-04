// AI providers are CLIs signed in with the user's own plan (no API keys, no API billing), plus local models.
// Node builtins only, so `node src/lib/llm/config.test.ts` runs it without Next.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { modelsFor, type ModelOption, type ProviderId } from "./models.ts";

export type { ProviderId };
export type HowTo = { text: string; href?: string; command?: string };
/** model: what the panel shows (the local model's id). models: what the user can pick besides the default. */
/** found: what this computer has, in plain words, for the Connect your AI screen. action: the button that fixes it. */
export type ProviderInfo = { id: ProviderId; label: string; model: string | null; models: ModelOption[]; ready: boolean; reason?: string; howTo?: HowTo[]; found?: string; action?: string; helper?: boolean };
export type Env = Record<string, string | undefined>;
export type CliState = {
  claude: { installed: boolean; loggedIn: boolean; plan?: string };
  codex: { installed: boolean; loggedIn: boolean };
  gemini: { installed: boolean };
  opencode: { installed: boolean; models: string[] };
  local: { reachable: boolean; models: string[] };
};

export const localBase = (env: Env = process.env) => env.LOCAL_LLM_BASE_URL || "http://localhost:11434/v1";

// Pure: turn what's installed/signed in into readiness plus the exact next steps.
export function configured(env: Env, s: CliState): ProviderInfo[] {
  const localModel = env.LOCAL_LLM_MODEL || s.local.models[0] || null;
  const list: Omit<ProviderInfo, "models">[] = [
    {
      id: "claude", label: "Claude", model: s.claude.plan ? `Claude Code · ${s.claude.plan} plan` : "Claude Code",
      ready: s.claude.installed && s.claude.loggedIn,
      reason: !s.claude.installed ? "Claude Code isn't installed" : !s.claude.loggedIn ? "Open Terminal and run `claude` once to sign in" : undefined,
      howTo: !s.claude.installed
        ? [{ text: "Install Claude Code", href: "https://claude.com/claude-code", command: "npm install -g @anthropic-ai/claude-code" }, { text: "Sign in with your Claude plan", command: "claude" }]
        : !s.claude.loggedIn ? [{ text: "Sign in with your Claude plan, then come back", command: "claude" }] : undefined,
    },
    {
      id: "codex", label: "ChatGPT", model: "Codex CLI", ready: s.codex.installed && s.codex.loggedIn,
      reason: !s.codex.installed ? "Codex isn't installed" : !s.codex.loggedIn ? "Run `codex login` once to sign in with ChatGPT" : undefined,
      howTo: !s.codex.installed
        ? [{ text: "Install Codex", href: "https://github.com/openai/codex", command: "npm install -g @openai/codex" }, { text: "Sign in with your ChatGPT plan", command: "codex login" }]
        : !s.codex.loggedIn ? [{ text: "Sign in with your ChatGPT plan", command: "codex login" }] : undefined,
    },
    {
      id: "gemini", label: "Gemini", model: "Gemini CLI", ready: s.gemini.installed,
      reason: s.gemini.installed ? undefined : "Gemini CLI isn't installed",
      howTo: s.gemini.installed ? undefined : [{ text: "Install Gemini CLI", href: "https://github.com/google-gemini/gemini-cli", command: "npm install -g @google/gemini-cli" }, { text: "Sign in with Google", command: "gemini" }],
    },
    {
      id: "opencode", label: "opencode", model: s.opencode.models[0] ?? null, ready: s.opencode.installed && s.opencode.models.length > 0,
      reason: !s.opencode.installed ? "opencode isn't installed" : !s.opencode.models.length ? "opencode has no models: run `opencode auth login` once" : undefined,
      howTo: !s.opencode.installed
        ? [{ text: "Install opencode", href: "https://opencode.ai", command: "npm install -g opencode-ai" }, { text: "Add a model provider (free models work without one)", command: "opencode auth login" }]
        : !s.opencode.models.length ? [{ text: "Add a model provider, then come back", command: "opencode auth login" }] : undefined,
    },
    {
      id: "local", label: "Local model", model: localModel, ready: s.local.reachable && !!localModel,
      reason: !s.local.reachable ? "Ollama or LM Studio isn't running" : !localModel ? "No local model installed" : undefined,
      howTo: !s.local.reachable
        ? [{ text: "Install Ollama", href: "https://ollama.com/download" }, { text: "Download a model", command: "ollama pull llama3.1" }]
        : !localModel ? [{ text: "Download a model (a few GB), then reload", command: "ollama pull llama3.1" }] : undefined,
    },
  ];
  const status: Partial<Record<ProviderId, { found: string; action?: string }>> = {
    claude: !s.claude.installed ? { found: "Not on this computer", action: "Install" } : !s.claude.loggedIn ? { found: "Installed, not signed in", action: "Sign in" } : { found: s.claude.plan ? `Installed, signed in with your ${s.claude.plan} plan` : "Installed and signed in" },
    codex: !s.codex.installed ? { found: "Not on this computer", action: "Install" } : !s.codex.loggedIn ? { found: "Installed, not signed in", action: "Sign in" } : { found: "Installed and signed in" },
    gemini: s.gemini.installed ? { found: "Installed" } : { found: "Not on this computer", action: "Install" },
    opencode: !s.opencode.installed ? { found: "Not on this computer", action: "Install" } : !s.opencode.models.length ? { found: "Installed, no models yet", action: "Add a model" } : { found: `Installed, ${s.opencode.models.length} models` },
    local: !s.local.reachable ? { found: "Ollama or LM Studio isn't running", action: "Set up" } : !localModel ? { found: "Running, no model downloaded", action: "Download a model" } : { found: `Running ${localModel}` },
  };
  return list.map((p) => ({ ...p, ...status[p.id], models: modelsFor(p.id, p.id === "opencode" ? s.opencode.models : s.local.models) }));
}

// The dev server's PATH may not include where these CLIs install, so check the usual spots too.
export function findBin(name: string, env: Env = process.env): string | null {
  const dirs = [...(env.PATH ?? "").split(":"), join(homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".npm-global/bin")];
  for (const d of dirs) if (d && existsSync(join(d, name))) return join(d, name);
  return null;
}

// Only what the CLIs need to find their login (USER: the macOS keychain). Drops server secrets and
// ANTHROPIC_API_KEY / OPENAI_API_KEY, which would switch the CLIs to API billing.
export const cleanEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", HOME: homedir(), PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: process.env.LANG ?? "en_US.UTF-8" };
  for (const k of ["USER", "LOGNAME", "TMPDIR", "SHELL"]) if (process.env[k]) env[k] = process.env[k];
  return env;
};

// opencode with nothing but a model: broke's own empty config folder (none of the user's MCP servers, plugins or
// agents), no Claude Code prompts or skills, every tool denied, no share links. Its login (auth.json) still loads.
export const OPENCODE_CONFIG_HOME = join(homedir(), ".broke", "opencode-config");
export const opencodeEnv = (): NodeJS.ProcessEnv => ({
  ...cleanEnv(),
  XDG_CONFIG_HOME: OPENCODE_CONFIG_HOME,
  OPENCODE_DISABLE_CLAUDE_CODE: "1",
  OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
  OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
  OPENCODE_CONFIG_CONTENT: JSON.stringify({ share: "disabled", autoupdate: false, mcp: {}, permission: { "*": "deny" } }),
});

const run = (bin: string, args: string[], env = cleanEnv()) =>
  new Promise<{ code: number; out: string }>((resolve) =>
    execFile(bin, args, { timeout: 8000, env }, (err, stdout) =>
      resolve({ code: err ? 1 : 0, out: String(stdout) }),
    ),
  );

export async function probeLocal(env: Env = process.env) {
  try {
    const res = await fetch(`${localBase(env)}/models`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return { reachable: false, models: [] as string[] };
    const body = (await res.json()) as { data?: { id: string }[] };
    return { reachable: true, models: (body.data ?? []).map((m) => m.id) };
  } catch {
    return { reachable: false, models: [] as string[] };
  }
}

async function probeClaude(): Promise<CliState["claude"]> {
  const bin = findBin("claude");
  if (!bin) return { installed: false, loggedIn: false };
  const { out } = await run(bin, ["auth", "status", "--json"]);
  try {
    const s = JSON.parse(out) as { loggedIn?: boolean; subscriptionType?: string };
    const plan = s.subscriptionType ? s.subscriptionType[0].toUpperCase() + s.subscriptionType.slice(1) : undefined;
    return { installed: true, loggedIn: !!s.loggedIn, plan };
  } catch {
    return { installed: true, loggedIn: false };
  }
}

async function probeCodex(): Promise<CliState["codex"]> {
  const bin = findBin("codex");
  if (!bin) return { installed: false, loggedIn: false };
  return { installed: true, loggedIn: (await run(bin, ["login", "status"])).code === 0 };
}

async function probeOpencode(): Promise<CliState["opencode"]> {
  const bin = findBin("opencode");
  if (!bin) return { installed: false, models: [] };
  const { out } = await run(bin, ["models"], opencodeEnv());
  return { installed: true, models: out.split("\n").map((l) => l.trim()).filter((l) => /^[\w.-]+\/[\w.:/-]+$/.test(l)) };
}

let cache: { at: number; value: ProviderInfo[] } | null = null;

// Readiness for the chat panel and the setup page. Cached 30 s: each probe starts a CLI.
// fresh: skip the cache, for "Check again" right after the user installs or signs in.
export async function aiProviders(fresh = false): Promise<ProviderInfo[]> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.value;
  const [claude, codex, opencode, local] = await Promise.all([probeClaude(), probeCodex(), probeOpencode(), probeLocal()]);
  const value = configured(process.env, { claude, codex, gemini: { installed: !!findBin("gemini") }, opencode, local });
  cache = { at: Date.now(), value };
  return value;
}
