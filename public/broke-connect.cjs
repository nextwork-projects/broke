// Connects your own AI app to your hosted copy of broke. Node only, no install. It asks your site for questions, runs them
// through Claude Code or opencode with every tool off, in an empty folder, and sends back the text. Your AI login never
// leaves this computer. Usage: node broke-connect.cjs <your site> [one-time code]. Ctrl+C stops it.
const { spawn, execFile } = require("node:child_process");
const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const site = (process.argv[2] || "").replace(/\/$/, "");
const code = process.argv[3];
if (!/^https?:\/\//.test(site)) {
  console.error("Copy the command from Connect your AI in broke.");
  process.exit(1);
}
const HOME = join(homedir(), ".broke");
const FILE = join(HOME, "helper.json");
const WORK = join(HOME, "agent");
mkdirSync(WORK, { recursive: true });

// Only what the AI apps need to find their login. Drops API keys, which would switch them to API billing.
const env = { HOME: homedir(), PATH: process.env.PATH, LANG: process.env.LANG || "en_US.UTF-8" };
for (const k of ["USER", "LOGNAME", "TMPDIR", "SHELL"]) if (process.env[k]) env[k] = process.env[k];
const findBin = (name) => {
  const dirs = [...(process.env.PATH || "").split(":"), join(homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".npm-global/bin")];
  return dirs.map((d) => join(d, name)).find((p) => existsSync(p)) || null;
};
const OPENCODE_ENV = {
  ...env, XDG_CONFIG_HOME: join(HOME, "opencode-config"), OPENCODE_DISABLE_CLAUDE_CODE: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_DISABLE_AUTOUPDATE: "1", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1", OPENCODE_CONFIG_CONTENT: JSON.stringify({ share: "disabled", autoupdate: false, mcp: {}, permission: { "*": "deny" } }),
};
const output = (bin, args, e) => new Promise((res) => execFile(bin, args, { env: e, timeout: 8000 }, (err, out) => res(err ? "" : String(out))));

async function findClis() {
  const clis = [];
  const claude = findBin("claude");
  if (claude && /"loggedIn":\s*true/.test(await output(claude, ["auth", "status"], env))) clis.push({ id: "claude" });
  const opencode = findBin("opencode");
  const models = opencode ? (await output(opencode, ["models"], OPENCODE_ENV)).split("\n").map((s) => s.trim()).filter(Boolean) : [];
  if (models.length) clis.push({ id: "opencode", models });
  return clis;
}

const safeModel = (m) => (typeof m === "string" && /^[\w][\w.:/-]*$/.test(m) ? m : null);

// Runs one question. onText gets the answer as it comes. Resolves true if there was an answer.
function runClaude(job, onText, stop) {
  const model = safeModel(job.model);
  const args = ["-p", "--output-format", "text", "--no-session-persistence", "--restricted", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--permission-mode", "dontAsk", ...(model ? ["--model", model] : [])];
  const child = spawn(findBin("claude"), args, { cwd: WORK, env, stdio: ["pipe", "pipe", "ignore"] });
  stop(() => child.kill());
  child.stdin.end(job.prompt);
  let wrote = false;
  child.stdout.on("data", (d) => { wrote = true; onText(d.toString()); });
  return new Promise((res) => child.on("close", (c) => res(wrote && c === 0)));
}

function runOpencode(job, onText, stop) {
  const model = safeModel(job.model);
  if (!model) return Promise.resolve(false);
  const child = spawn(findBin("opencode"), ["run", job.prompt, "--format", "json", "--print-logs", "--log-level", "ERROR", "-m", model], { cwd: WORK, env: OPENCODE_ENV, stdio: ["ignore", "pipe", "pipe"] });
  stop(() => child.kill());
  let wrote = false, buf = "";
  // A rate limit or sign-in error: opencode would wait forever, so stop it and say why.
  child.stderr.on("data", (d) => {
    const t = d.toString();
    if (!/level=ERROR/.test(t)) return;
    if (!wrote && /usage limit|rate limit|429/i.test(t)) { onText(`${model} hit its usage limit. Pick another model or try again later.`); wrote = true; }
    child.kill();
  });
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      let ev = null;
      try { ev = JSON.parse(buf.slice(0, nl)); } catch {}
      buf = buf.slice(nl + 1);
      if (ev?.type === "text" && ev.part?.text) { onText((wrote ? "\n\n" : "") + ev.part.text); wrote = true; }
      if (ev?.type === "step_finish" && ev.part?.reason !== "tool-calls") child.kill(); // opencode doesn't exit by itself
    }
  });
  return new Promise((res) => child.on("close", () => res(wrote)));
}

async function main() {
  let token = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8"))[site] : null;
  if (code) {
    const res = await fetch(`${site}/api/ai/helper/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    if (!res.ok) { console.error(await res.text()); process.exit(1); }
    token = (await res.json()).token;
    const saved = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
    writeFileSync(FILE, JSON.stringify({ ...saved, [site]: token }), { mode: 0o600 });
    chmodSync(FILE, 0o600);
  }
  if (!token) { console.error("Copy the command from Connect your AI in broke."); process.exit(1); }
  const clis = await findClis();
  if (!clis.length) { console.error("No signed-in AI app found. Install Claude Code and run `claude` once, or install opencode, then run this again."); process.exit(1); }
  console.log(`Connected to ${site} with ${clis.map((c) => c.id).join(" and ")}. Leave this open. Press Ctrl+C to stop.`);

  const post = (path, body) => fetch(`${site}/api/ai/helper/${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  for (;;) {
    let job = null;
    try {
      const res = await post("poll", { clis });
      if (res.status === 403) { console.error("This helper was replaced. Get a new command from Connect your AI."); process.exit(1); }
      if (res.ok) job = (await res.json()).job;
    } catch { /* offline for a moment: try again */ }
    if (!job) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!clis.some((c) => c.id === job.provider)) { await post("answer", { id: job.id, status: "failed" }); continue; }

    // Send the answer in small batches, in order. A 410 means the person left, so stop the AI app.
    let pending = "", kill = () => {}, gone = false;
    const flush = async () => {
      if (!pending) return;
      const text = pending;
      pending = "";
      const res = await post("answer", { id: job.id, text }).catch(() => null);
      if (res?.status === 410) { gone = true; kill(); }
    };
    let sending = Promise.resolve();
    const timer = setInterval(() => { sending = sending.then(flush); }, 500);
    const run = job.provider === "claude" ? runClaude : runOpencode;
    const tooLong = setTimeout(() => kill(), 270_000); // the site gives up at 280 s
    const ok = await run(job, (t) => { pending += t; }, (k) => { kill = k; });
    clearTimeout(tooLong);
    clearInterval(timer);
    await sending;
    await flush();
    if (!gone) await post("answer", { id: job.id, status: ok ? "done" : "failed" }).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
