// Run: node src/lib/llm/config.test.ts
import assert from "node:assert/strict";
import { configured, type CliState } from "./config.ts";

const base: CliState = {
  claude: { installed: false, loggedIn: false },
  codex: { installed: false, loggedIn: false },
  gemini: { installed: false },
  opencode: { installed: false, models: [] },
  local: { reachable: false, models: [] },
};
const get = (s: Partial<CliState> = {}, env: Record<string, string> = {}) =>
  Object.fromEntries(configured(env, { ...base, ...s }).map((p) => [p.id, p]));

let p = get();
assert.deepEqual(Object.values(p).map((x) => x.ready), [false, false, false, false, false]);
assert.ok(p.claude.howTo?.some((h) => h.command === "claude"), "install steps include signing in");

p = get({ claude: { installed: true, loggedIn: false } });
assert.equal(p.claude.ready, false);
assert.match(p.claude.reason!, /run `claude` once/);

p = get({ claude: { installed: true, loggedIn: true, plan: "Max" }, codex: { installed: true, loggedIn: true }, gemini: { installed: true } });
assert.equal(p.claude.ready, true);
assert.equal(p.claude.model, "Claude Code · Max plan");
assert.equal(p.claude.howTo, undefined);
assert.equal(p.codex.ready, true);
assert.equal(p.gemini.ready, true);

p = get({ local: { reachable: true, models: ["llama3.1", "qwen2.5"] } });
assert.equal(p.local.ready, true);
assert.equal(p.local.model, "llama3.1", "first installed model when LOCAL_LLM_MODEL is unset");
assert.equal(get({ local: { reachable: true, models: ["llama3.1"] } }, { LOCAL_LLM_MODEL: "qwen2.5" }).local.model, "qwen2.5");
assert.equal(get({ local: { reachable: true, models: [] } }).local.ready, false);
p = get({ opencode: { installed: true, models: [] } });
assert.equal(p.opencode.ready, false, "installed with no models is not ready");
p = get({ opencode: { installed: true, models: ["opencode/glm-5.3-flash-free", "openrouter/qwen/qwen3-coder"] } });
assert.equal(p.opencode.ready, true);
assert.equal(p.opencode.model, "opencode/glm-5.3-flash-free", "first listed model is the default");
assert.deepEqual(p.opencode.models.map((m) => m.id), ["opencode/glm-5.3-flash-free", "openrouter/qwen/qwen3-coder"]);
console.log("config: ok");
