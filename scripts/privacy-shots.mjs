// Screenshots of "AI and your data" as a throwaway sandbox user: the Settings card, the "What Claude sees" modal and
// the chat panel line, light and dark, 1440 and 390 wide, at 2x. Usage: node --env-file=.env scripts/privacy-shots.mjs <outdir>
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const BASE = "http://localhost:3000", OUT = process.argv[2] ?? ".context/privacy";
mkdirSync(OUT, { recursive: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `shots-${Date.now()}@broke.test`, password = randomBytes(18).toString("base64url");
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { profile: { country: "US" } } });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  await browser.setCookie({ name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`, domain: "localhost", path: "/" });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 300)));
  await page.goto(BASE + "/");
  await page.evaluate(() => fetch("/api/plaid/sandbox", { method: "POST" }).then((r) => r.text()));
  await wait(8000); // let the sync land so the summary has data

  for (const width of [1440, 390])
    for (const theme of ["light", "dark"]) {
      const tag = `${width}-${theme}`;
      await page.setViewport({ width, height: width > 500 ? 1000 : 844, deviceScaleFactor: 2 });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
      await page.goto(BASE + "/settings#ai", { waitUntil: "networkidle0" });
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await wait(1200);
      // The phone tab bar is fixed over the bottom of the page: hide it so the card and its button show.
      await page.evaluate(() => document.querySelectorAll("body *").forEach((e) => getComputedStyle(e).position === "fixed" && e.tagName !== "DIALOG" && (e.style.visibility = "hidden")));
      const card = await page.waitForSelector("::-p-xpath(//section[.//h3[text()='AI and your data']])");
      await card.screenshot({ path: `${OUT}/settings-card-${tag}.png` });

      await page.locator("::-p-text(What Claude sees)").click();
      await page.waitForSelector("dialog[open] pre", { timeout: 30000 });
      await wait(500);
      const modal = await page.$("dialog[open] > div");
      await modal.screenshot({ path: `${OUT}/what-claude-sees-${tag}.png` });
      await page.keyboard.press("Escape");
      await wait(300);

      await page.goto(BASE + "/", { waitUntil: "networkidle0" });
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /ask broke|broke ai|ask ai/i.test(b.textContent ?? "") && b.offsetParent)?.click());
      await page.waitForSelector('dialog[aria-label="broke ai chat"] header');
      await wait(800);
      const panel = await page.$('dialog[aria-label="broke ai chat"] > div');
      const height = await page.evaluate(() => {
        const h = document.querySelector('dialog[aria-label="broke ai chat"] header');
        return h.nextElementSibling.getBoundingClientRect().bottom - h.getBoundingClientRect().top + 24;
      });
      const { width: w } = await panel.boundingBox();
      await panel.screenshot({ path: `${OUT}/chat-line-${tag}.png`, clip: { x: 0, y: 0, width: w, height } });
    }
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(c.user.id);
}
