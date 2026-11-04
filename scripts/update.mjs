#!/usr/bin/env node
// Brings in the latest broke, keeping your own changes. Your data and keys aren't touched.
// A copy made by Vercel's deploy button starts with a new history, so git can't see it came from broke. The first update
// finds the broke commit it was copied from and joins the two, so only real differences get merged.
import { spawnSync } from "node:child_process";

const UPSTREAM = process.env.BROKE_REPO || "https://github.com/nextwork-projects/broke.git";
const ci = process.argv.includes("--ci"); // GitHub's update button: it pushes, and Vercel does the install
const inherit = { stdio: "inherit", shell: process.platform === "win32" };
const run = (...args) => spawnSync("git", args, inherit).status === 0;
const out = (...args) => spawnSync("git", args, { encoding: "utf8" }).stdout.trim();
const fail = (m) => { console.error(`\n${m}`); process.exit(1); };

if (out("status", "--porcelain")) fail("You have changes that aren't committed. Commit them first: git add -A && git commit -m \"My changes\"");
if (!run("fetch", "--quiet", UPSTREAM, "main")) fail("Couldn't reach broke's repo. Check your connection and try again.");
const theirs = out("rev-parse", "FETCH_HEAD");
if (!out("merge-base", "HEAD", theirs)) {
  const start = out("rev-list", "--max-parents=0", "HEAD").split("\n")[0];
  const tree = out("rev-parse", `${start}^{tree}`);
  const from = out("log", "--format=%H %T", theirs).split("\n").map((l) => l.split(" ")).find(([, t]) => t === tree)?.[0];
  if (!from) fail("Couldn't tell which version of broke this copy started from. Run `claude` here and ask it to merge " + UPSTREAM);
  const joined = out("commit-tree", "HEAD^{tree}", "-p", "HEAD", "-p", from, "-m", "Join this copy to broke's history");
  if (!run("merge", "--quiet", "--ff-only", joined)) fail("Couldn't join this copy to broke's history.");
}
if (!run("merge", "--no-edit", theirs)) fail("Your changes and the update touch the same lines. Run `claude` here and ask it to resolve the merge.");
if (!ci && spawnSync("npm", ["install"], inherit).status !== 0) process.exit(1);
console.log(ci ? "\nUpdated." : "\nUpdated. Start broke again to use it. New database changes apply when it starts.");
