#!/usr/bin/env node
// Starts broke on this computer and opens it. Before the keys are in, it runs in development mode: the setup page saves
// keys and the server picks them up without a restart. After that it runs the faster production build.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
if (Number(process.versions.node.split(".")[0]) < 20) {
  console.error(`broke needs Node.js 20 or newer (this is ${process.version}). Get it from https://nodejs.org`);
  process.exit(1);
}

const win = process.platform === "win32";
const npm = (...args) => spawnSync("npm", args, { stdio: "inherit", shell: win }).status === 0;
if (!existsSync("node_modules") && !npm("install")) process.exit(1);

const env = {};
for (const f of [".env", ".env.local"]) {
  if (!existsSync(f)) continue;
  for (const m of readFileSync(f, "utf8").matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) env[m[1]] = m[2].trim();
}
const isSet = (v) => !!v && !/^your[_-]|your-project|YOUR-PASSWORD/.test(v); // same rule as lib/setup.ts
const ready = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"].every((k) => isSet(env[k]));

const port = process.env.PORT || "3000";
const url = `http://localhost:${port}${ready ? "" : "/setup"}`;
const openIt = () => { if (!process.env.BROKE_NO_OPEN) spawn(win ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open", win ? ["/c", "start", url] : [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref(); };
// Started twice: open the one already running instead of failing on a busy port.
if (await fetch(url, { redirect: "manual" }).then(() => true, () => false)) {
  console.log(`broke is already running at ${url}.`);
  openIt();
  process.exit(0);
}
// The last build is reused when nothing it was built from has changed since: code, packages, settings or keys.
const newest = (p) => !existsSync(p) ? 0 : statSync(p).isDirectory()
  ? Math.max(0, ...readdirSync(p, { recursive: true }).map((f) => statSync(join(p, String(f))).mtimeMs))
  : statSync(p).mtimeMs;
const built = existsSync(".next/BUILD_ID") ? statSync(".next/BUILD_ID").mtimeMs : 0;
const stale = Math.max(...["src", "public", "package-lock.json", "next.config.ts", ".env", ".env.local"].map(newest)) > built;
if (ready && !stale) console.log("Nothing changed since the last build: starting it.");
if (ready && stale && !npm("run", "build")) process.exit(1);
const next = join("node_modules", ".bin", win ? "next.cmd" : "next");
// Listens on this computer only, which is what makes saving keys from the page safe (writeGate checks the rest).
const args = ready ? ["start", "-H", "127.0.0.1", "-p", port] : ["dev", "--turbopack", "-H", "127.0.0.1", "-p", port];
const server = spawn(next, args, { stdio: "inherit", shell: win, env: { ...process.env, ALLOW_SETUP_WRITES: "1" } });
server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => server.kill("SIGINT"));

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const up = await fetch(url, { redirect: "manual" }).then(() => true, () => false);
  if (!up) continue;
  console.log(`\nbroke is running at ${url}. Press Ctrl+C to stop it.\n`);
  openIt();
  break;
}
