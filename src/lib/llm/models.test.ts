// Run: node src/lib/llm/models.test.ts
import assert from "node:assert/strict";
import { choiceOf, decode, encode, isSmall, modelsFor, validModel } from "./models.ts";

assert.equal(choiceOf(undefined), null);
assert.equal(choiceOf({ ai_model: { provider: "nope" } }), null);
assert.deepEqual(choiceOf({ ai_model: { provider: "claude", model: "opus" } }), { provider: "claude", model: "opus" });
assert.deepEqual(choiceOf({ ai_model: { provider: "local", model: "" } }), { provider: "local", model: null });

const claude = modelsFor("claude");
assert.equal(validModel(claude, "sonnet"), "sonnet");
assert.equal(validModel(claude, "--dangerously-skip-permissions"), null, "only listed models reach the CLI");
assert.equal(validModel(modelsFor("codex"), "gpt-5"), null, "Codex: default only");
assert.equal(validModel(modelsFor("opencode", ["opencode/big-pickle"]), "opencode/big-pickle"), "opencode/big-pickle");
assert.equal(validModel(modelsFor("opencode", ["opencode/big-pickle"]), "--auto"), null, "opencode: only listed models");
assert.deepEqual(modelsFor("local", ["llama3.1"]), [{ id: "llama3.1", label: "llama3.1" }]);

assert.equal(isSmall("claude", "haiku"), true);
assert.equal(isSmall("claude", "opus"), false);
assert.equal(isSmall("claude", null), false);
assert.equal(isSmall("codex", "gpt-5-mini"), true);
assert.equal(isSmall("gemini", "gemini-2.5-flash"), true);
assert.equal(isSmall("local", "llama3.1"), true);

for (const c of [{ provider: "claude", model: null }, { provider: "claude", model: "opus" }, { provider: "local", model: "qwen2.5:7b" }] as const) assert.deepEqual(decode(encode(c)), c);
console.log("models: ok");
