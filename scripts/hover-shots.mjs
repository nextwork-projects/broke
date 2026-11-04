// Hover-state screenshots: spend chart crosshair, a month bar, a donut slice, a transaction row.
// Usage: node --env-file=.env scripts/hover-shots.mjs <outdir>
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";
import { randomBytes } from "node:crypto";

const BASE = "http://localhost:3000", OUT = process.argv[2] ?? "hover";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `hover-${Date.now()}@broke.test`, password = randomBytes(18).toString("base64url");
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  await browser.setCookie({ name: `sb-${ref}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`, domain: "localhost", path: "/" });
  await page.goto(BASE + "/");
  await page.evaluate(() => fetch("/api/plaid/sandbox", { method: "POST" }).then((r) => r.text()));

  await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await wait(1500);
  const chart = await page.$("svg[aria-label^='Cumulative']");
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5); await wait(300);
  await (await chart.evaluateHandle((n) => n.closest(".card"))).asElement().screenshot({ path: `${OUT}/chart-hover.png` });
  const row = await page.$("a.row-hover"); await row.hover(); await wait(300);
  await (await row.evaluateHandle((n) => n.closest(".card"))).asElement().screenshot({ path: `${OUT}/row-hover.png` });

  await page.goto(BASE + "/spending", { waitUntil: "networkidle0" }); await wait(1500);
  const bars = await page.$$("a[aria-label*=': $']"); await bars[3].hover(); await wait(300);
  await (await bars[3].evaluateHandle((n) => n.closest(".card"))).asElement().screenshot({ path: `${OUT}/bars-hover.png` });
  const slice = await page.$("[data-slice]"); await slice.hover(); await wait(500);
  await (await slice.evaluateHandle((n) => n.closest(".card"))).asElement().screenshot({ path: `${OUT}/donut-hover.png` });
  await page.goto(BASE + "/transactions", { waitUntil: "networkidle0" }); await wait(800);
  await page.locator("button[aria-label='Categories']").click(); await wait(400);
  await page.keyboard.type("din"); await wait(300);
  await page.screenshot({ path: `${OUT}/dropdown.png`, clip: { x: 240, y: 60, width: 1200, height: 520 } });
  // Keyboard focus: tab into the page and capture the focus ring.
  await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await wait(1200);
  for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
  await page.screenshot({ path: `${OUT}/focus.png`, clip: { x: 0, y: 0, width: 1440, height: 700 } });
  // Transaction row note editor open.
  await page.goto(BASE + "/transactions", { waitUntil: "networkidle0" }); await wait(800);
  await page.locator("button[title='Add a note']").click(); await wait(300);
  await page.screenshot({ path: `${OUT}/note.png`, clip: { x: 240, y: 60, width: 1200, height: 400 } });
  // Phone width: what can you do with a transaction?
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE + "/transactions", { waitUntil: "networkidle0" }); await wait(800);
  await page.screenshot({ path: `${OUT}/txn-phone.png` });
  await page.locator("tbody tr").click(); await wait(400);
  await page.screenshot({ path: `${OUT}/sheet.png` });
  await page.locator("[role=dialog] button.btn").click(); await wait(600);
  await page.screenshot({ path: `${OUT}/toast.png` });
  await page.keyboard.press("Escape"); await wait(200);
  await page.goto(BASE + "/transactions", { waitUntil: "networkidle0" }); await wait(800);
  await page.locator("button[aria-label='Accounts']").click(); await wait(400);
  await page.screenshot({ path: `${OUT}/dropdown-phone.png` });
  await page.goto(BASE + "/", { waitUntil: "networkidle0" }); await wait(1200);
  await page.screenshot({ path: `${OUT}/dash-phone.png` });
  await page.locator("nav[aria-label=Main] button[aria-expanded]").click(); await wait(300);
  await page.screenshot({ path: `${OUT}/more-phone.png` });
  await page.goto(BASE + "/accounts", { waitUntil: "networkidle0" }); await wait(800);
  await page.screenshot({ path: `${OUT}/accounts-phone.png` });
  await page.goto(BASE + "/login", { waitUntil: "networkidle0" }); await wait(500);
  await page.screenshot({ path: `${OUT}/login-phone.png` });
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(c.user.id);
}
