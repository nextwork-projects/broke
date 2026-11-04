// Screenshots each page as a throwaway sandbox user. Usage: node --env-file=.env scripts/screens.mjs <outdir>
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import { randomBytes } from "node:crypto";

const BASE = "http://localhost:3000", OUT = process.argv[2] ?? "screens";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `shots-${Date.now()}@broke.test`, password = randomBytes(18).toString("base64url");
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { profile: { country: "US" } } });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const value = `base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const page = await browser.newPage();
  // Surface client errors (the dev overlay's "Issue" badge) in the run output.
  page.on("console", (m) => m.type() === "error" && console.log("console error:", page.url(), m.text().slice(0, 1500)));
  page.on("response", (r) => r.status() >= 400 && console.log("http", r.status(), r.url().replace(/\?.*/, "")));
  page.on("pageerror", (e) => console.log("page error:", page.url(), String(e).slice(0, 300)));
  await page.setViewport({ width: Number(process.env.WIDTH ?? 1440), height: 1000, deviceScaleFactor: 1 });
  await browser.setCookie({ name: `sb-${ref}-auth-token`, value, domain: "localhost", path: "/" });
  await page.goto(BASE + "/");
  if (!process.env.EMPTY) await page.evaluate(() => fetch("/api/plaid/sandbox", { method: "POST" }).then((r) => r.text())); // EMPTY=1: a brand-new user with no bank
  for (const p of (process.env.PAGES ? process.env.PAGES.split(",") : ["/", "/spending", "/transactions", "/recurring", "/accounts", "/optimize", "/insights", "/budgets"])) {
    await page.goto(BASE + p, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1200)); // let entrance animations finish
    await page.screenshot({ path: `${OUT}/${p === "/" ? "dashboard" : p.slice(1)}.png`, fullPage: true });
  }
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await page.locator("::-p-text(Ask broke)").click();
  await page.waitForSelector("dialog textarea");
  await page.screenshot({ path: `${OUT}/assistant-panel.png` });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(c.user.id);
}
