import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changeLines, checkinFacts, sameDollars, type CheckinFacts } from "@/lib/checkins";
import { allRows, today as todayDate, displayName, isSpend, TXN_SELECT, typicalMonthly, type Txn } from "@/lib/data";
import { runViaHelper } from "@/lib/llm/helper";
import { runCodex, runGemini, runOpencode } from "@/lib/llm/cli-snapshot";
import { AGENT_DIR, runClaudeCode } from "@/lib/llm/claude-code";
import { levelOf, namesFor, pickProvider, unmask } from "@/lib/llm/gate";
import { deterministicMoves, stepOf, whyLine, type Kind } from "@/lib/plan";
import { loadPlan, planFacts } from "@/lib/plan-facts";
import { runOpenAICompat } from "@/lib/llm/openai-compat";
import { compatRun, providersFor } from "@/lib/llm/providers";
import { makeTools } from "@/lib/llm/shared";
import { month, ph, roundMoney, who } from "@/lib/privacy";
import { fmtFor, fmtWith, ymd } from "@/lib/format";
import { ACCT_COLS, toHome } from "@/lib/cash";
import { addDays, cashBalance, cashWords, isCash, type Acct } from "@/lib/insights";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import type { User } from "@supabase/supabase-js";

export const maxDuration = 300;

type Sb = Awaited<ReturnType<typeof createClient>>;
const COLS = "id, created_at, facts, summary, provider";
const WEEK = 7 * 864e5;
const SINCE = 5 * 864e5; // "since last week" compares with the latest review at least this old

// The AI only rewords "what changed". Tips, on track and the next move are shown from code, so their numbers can't drift.
const SYSTEM = `You are broke AI, the money assistant inside broke. Reword what changed in the user's week, from the facts given.
Use only those facts, their exact dollar figures and names. Never add a number, a tip or advice: tips are shown separately.
Write 2 to 4 lines, each starting with "- ". Plain short sentences. No headings, no bold, no em dashes. Lead with low cash or spending well above a usual week when the facts list them.`;

// One generation per user at a time: a second request waits for the first. Memory only (one local server).
const g = globalThis as unknown as { __brokeCheckins?: Map<string, Promise<unknown>> };
const running = (g.__brokeCheckins ??= new Map());

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { data, error } = await supabase.from("checkins").select(COLS).order("created_at", { ascending: false }).limit(6);
  // 503 before migration 0008: the card then only writes a check-in when asked.
  return error ? new Response("Check-ins aren't set up yet", { status: 503 }) : Response.json(data);
}

/** Writes a new check-in when the latest is 7+ days old, or with {"refresh": true} (rewriting the latest when it is under
 * 5 days old). Returns the latest. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { refresh } = (await request.json().catch(() => ({}))) as { refresh?: boolean };

  if (!running.has(user.id)) {
    const { data: latest } = await supabase.from("checkins").select(COLS).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!refresh && latest && Date.now() - Date.parse(latest.created_at) < WEEK) return Response.json(latest);
    // A refresh of a review under 5 days old rewrites it in place. A second row would compare with the same older
    // review and repeat its changes and tip checks.
    const replace = latest && Date.now() - Date.parse(latest.created_at) < SINCE ? latest.id : null;
    running.set(user.id, generate(supabase, user, replace).finally(() => running.delete(user.id)));
  }
  try {
    return Response.json(await running.get(user.id));
  } catch (e) {
    console.error("[broke] checkin:", e);
    return new Response("Couldn't write the check-in", { status: 500 });
  }
}

async function generate(supabase: Sb, user: User, replace: string | null) {
  const userId = user.id;
  const profile = user.user_metadata?.profile as { country?: string; currency?: string } | undefined;
  const fmt = fmtWith(fmtFor(profile));
  const today = ymd(await todayDate());
  // "Since last week": the latest review at least 5 days old, so a refresh still compares with last week.
  const [txns, { data: streams }, { data: accounts }, typical, { data: budgets }, { data: prev }, plan] = await Promise.all([
    allRows<Txn>((a, b) => supabase.from("transactions").select(TXN_SELECT).eq("user_id", userId).gte("date", ymd(new Date(Date.now() - 180 * 864e5))).order("id").range(a, b)),
    supabase.from("recurring").select("merchant_name, frequency, average_amount, last_amount, next_date, is_income").eq("user_id", userId).eq("active", true),
    supabase.from("accounts").select(ACCT_COLS).eq("user_id", userId),
    typicalMonthly(supabase, userId, today),
    supabase.from("budgets").select("amount, category:categories(label)").eq("user_id", userId),
    supabase.from("checkins").select("facts").eq("user_id", userId).lt("created_at", new Date(Date.now() - SINCE).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    loadPlan(supabase, userId).catch(() => null),
  ]);
  // The plan's next move by the ladder, or one marked done in the last 7 days.
  type M = { title: string; why: string; status?: string; done_at?: string | null; deadline: string | null; ref: string | null; kind: Kind; step: number | null };
  const moves = (plan?.moves ?? []) as unknown as M[];
  const justDone = moves.find((m) => m.status === "done" && m.done_at && Date.now() - Date.parse(m.done_at) < 7 * 864e5);
  const next = moves.filter((m) => m.status === "todo" || m.status === "doing").sort((a, b) => stepOf(a) - stepOf(b))[0];
  // No plan yet: the first code-built move, as on the dashboard.
  const pick = justDone ?? next ?? (plan && !plan.plan ? deterministicMoves(await planFacts(supabase, userId, user.user_metadata?.profile ?? {}, today), fmt.money0)[0] : undefined);
  // Home-currency balances, the same accounts and rule as Safe to spend (cash.ts), so low cash and it agree.
  const accts = toHome((accounts ?? []) as (Acct & { bank_balance: number | null })[]);
  const checking = accts.filter((a) => a.included && a.type === "depository" && a.subtype !== "savings");
  const words = cashWords(accts);
  const facts = checkinFacts({
    txns: txns.filter(isSpend).map((t) => ({ date: t.date, amount: t.amount, merchant: displayName(t), category: t.category?.label ?? null })),
    streams: (streams ?? []).map((s) => ({ ...s, average_amount: Number(s.average_amount), last_amount: s.last_amount == null ? null : Number(s.last_amount) })),
    cash: checking.length ? checking.reduce((s, a) => s + Number(a.current_balance ?? 0), 0) : null,
    // Available when the bank gives it, per account, else that account's balance (cashBalance in insights.ts).
    available: checking.some((a) => a.available_balance != null) ? checking.reduce((s, a) => s + Number(a.available_balance ?? a.current_balance ?? 0), 0) : null,
    spendable: accts.some(isCash) ? cashBalance(accts) : null,
    spendableIn: `${words.available ? "available " : ""}in ${words.where}`,
    income: typical?.income ?? null,
    usualSpend: typical?.spend ?? null,
    budgets: ((budgets ?? []) as unknown as { amount: number; category: { label: string } | null }[]).map((b) => ({ category: b.category?.label ?? "Other", amount: Number(b.amount) })),
    prev: (prev?.facts as CheckinFacts | undefined) ?? null,
    move: pick ? { title: pick.title, line: whyLine(pick.title, pick.why), done: pick === justDone, by: pick.deadline ?? addDays(today, 7) } : null,
    today,
  });

  // Off: no model call, the card shows the plain facts. Summary: placeholders and rounded amounts, names swapped back below.
  const provider = pickProvider(await providersFor(userId), user);
  let summary: string | null = null;
  if (provider) {
    let out = "";
    const emit = (t: string) => (out += t);
    const names = levelOf(user, provider.id) === "summary" ? await namesFor(supabase, userId) : null;
    // Summary level: placeholder names, rounded amounts, months not days. Full detail is the local model only (gate.ts).
    const lines = changeLines(facts, names
      ? { $: (n) => `about $${roundMoney(n).toLocaleString("en-US")}`, name: (k, n) => (k === "sub" ? ph(names, "Subscription", n) : who(names, "Merchant", n)), day: (d) => `in ${month(d)}` }
      : { $: fmt.money, day: (d) => new Date(d + "T00:00:00Z").toLocaleDateString(fmt.locale, { month: "short", day: "numeric", timeZone: "UTC" }) });
    const messages = [{ role: "user" as const, content: `Today is ${today}. This week's facts:\n${lines.map((l) => `- ${l}`).join("\n")}` }];
    if (provider.helper) await runViaHelper({ userId, provider: provider.id, model: provider.use, system: SYSTEM, tools: makeTools(supabase, undefined, userId), messages, emit });
    else if (provider.id === "claude") {
      // No data tools needed: the facts are in the prompt, so the MCP config is empty.
      const mcpFile = join(AGENT_DIR, "mcp", "none.json");
      mkdirSync(join(AGENT_DIR, "mcp"), { recursive: true, mode: 0o700 });
      writeFileSync(mcpFile, '{"mcpServers":{}}');
      await runClaudeCode({ messages, mcpFile, system: SYSTEM, emit, model: provider.use });
    } else if (provider.id === "codex") await runCodex({ system: SYSTEM, tools: makeTools(supabase, undefined, userId), messages, emit });
    else if (provider.id === "gemini") await runGemini({ system: SYSTEM, tools: makeTools(supabase, undefined, userId), messages, emit });
    else if (provider.id === "opencode") await runOpencode({ system: SYSTEM, tools: makeTools(supabase, undefined, userId), messages, emit, model: provider.use ?? provider.model! });
    else await runOpenAICompat({ ...(await compatRun(provider, userId)), label: provider.label, system: SYSTEM, messages, tools: [], emit });
    out = out.replace(/^\u001e.*$/gm, "").replace(/—/g, ",").trim();
    // A dollar figure the facts don't have: keep the code wording.
    const newNumber = !sameDollars(out, lines);
    if (newNumber) console.warn("[broke] checkin: reply brought a new dollar figure, using the code wording");
    if (names) out = unmask(out, names);
    // The runners write their own error text into the reply; keep the plain facts instead.
    const failed = newNumber || /isn't (installed|signed in)|couldn't (answer|sign in)|usage limit|went wrong|Could not reach|Too many requests|doesn't recognise/i.test(out);
    summary = out && !failed ? out : null;
  }

  const row = { facts, summary, provider: summary ? provider!.id : null };
  // Server-written only (0013 revokes the browser's insert), for the user verified above.
  const admin = createAdminClient();
  const { data, error } = replace
    ? await admin.from("checkins").update({ ...row, created_at: new Date().toISOString() }).eq("id", replace).eq("user_id", userId).select(COLS).single()
    : await admin.from("checkins").insert({ user_id: userId, ...row }).select(COLS).single();
  // Saving is best-effort (before migration 0008 there is no table): still show this one.
  return error ? { id: "unsaved", created_at: new Date().toISOString(), ...row } : data;
}
