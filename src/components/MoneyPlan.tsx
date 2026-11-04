"use client";

import { Bell, CalendarDays, Check, ChevronDown, Copy, LoaderCircle, Mail, MessageSquare, Phone, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAssistant } from "@/components/Assistant";
import { CategoryIcon } from "@/components/Icons";
import { useMoney } from "@/components/Money";
import { PayoffChart } from "@/components/PayoffChart";
import { toast } from "@/components/Toast";
import { STEP_LABEL, STEPS, sectionOf, stepOf, type Kind, type Section, type Status } from "@/lib/plan";
import type { Later, PMove } from "@/lib/projection";
import { createClient } from "@/utils/supabase/client";

type Message = { to: string; channel: "email" | "sms" | "call"; subject?: string; body: string; phone?: string };
export type PlanMove = {
  id: string; ref: string | null; kind: Kind; title: string; why: string; yearly_impact: number; effort: string; steps: string[];
  message: Message | null; links: { label: string; url: string }[]; confidence: string; status: Status; done_at: string | null;
  section: Section | null; deadline: string | null; step: number | null; once: boolean | null; gate: string | null; steps_done: number[] | null;
};
export type PlanState = {
  ready: boolean; running: boolean; error: string | null; saved: number; looksDone?: string[];
  stale?: string | null; // why the saved plan is out of date (loadPlan), or null
  done?: (PMove & { id: string })[]; // done moves across every run
  plan: { id: string; created_at: string; provider: string | null; summary: string | null; total_impact: number; note?: string | null } | null;
  moves: PlanMove[];
};

const PROVIDER: Record<string, string> = { openrouter: "OpenRouter", claude: "Claude", codex: "ChatGPT", gemini: "Gemini", opencode: "opencode", local: "your local model" };
// What the audit is doing, shown while it runs. Time-based: the CLI doesn't report its own progress.
const STAGES = ["Reading your spending, bills and subscriptions", "Checking cash, debt, cards and your match", "Writing your plan", "Checking every number and link"];
const LOOKS_AT = ["Spending above income, card interest and fees", "An emergency fund sized from your own essential spending", "Your employer match, then debt, then 401(k), HSA and IRA room you can afford", "Tax: your bracket, refunds, payments, losses to harvest and deductions", "Subscriptions, price rises and bills worth a call", "Messages worth sending, drafted for you"];

const enc = encodeURIComponent;
const mailto = (m: Message) => `mailto:?${m.subject ? `subject=${enc(m.subject)}&` : ""}body=${enc(m.body)}`;
const helpPrompt = (m: PlanMove) =>
  [
    `Help me do this move from my money plan: "${m.title}".`,
    `Why: ${m.why}`,
    m.gate ? `Note: ${m.gate}` : "",
    `Steps:\n${m.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    m.message ? `Drafted ${m.message.channel === "call" ? "call script" : m.message.channel} for ${m.message.to}:\n${m.message.body}` : "",
    "Look up what you need from my accounts, then walk me through it with my real numbers: exactly what to say, click or compare. You can't do it for me, so give me the steps. Don't invent prices, phone numbers or links.",
  ].filter(Boolean).join("\n\n");

// A calendar file for the move: at its deadline, or a week from today when it has none. Built in the browser.
function remind(m: PlanMove, today: string) {
  const day = m.deadline ?? new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);
  const d = day.replace(/-/g, ""), next = new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10).replace(/-/g, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//broke//money plan//EN", "BEGIN:VEVENT",
    `UID:${m.id}@broke`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${esc(m.title)}`, `DESCRIPTION:${esc([m.why, ...m.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${m.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50)}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// "Set a $X budget" links: /budgets?set=<category id>&amount=<n>. Written like BudgetEditor does.
const budgetLink = (url: string) => {
  const q = url.startsWith("/budgets?") ? new URLSearchParams(url.slice(9)) : null;
  const id = q?.get("set"), amount = Number(q?.get("amount"));
  return id && amount > 0 ? { id, amount } : null;
};
async function setBudget(category_id: string, amount: number) {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { error } = await db.from("budgets").upsert([{ user_id: user.id, category_id, amount, updated_at: new Date().toISOString() }]);
  return !error;
}

// Section colours: var(--chart) and the muted category hues from migration 0017.
const SECTION_COLOR: Record<Section, string> = { spending: "#b07a2a", tax: "var(--chart)", debt: "#9c4a3a", bills: "#2e7a8c", cards: "#a24f7c", saving: "#3f8a52" };
// The same Phosphor duotone glyphs the category icons use.
const SECTION_ICON: Record<Section, string> = { spending: "shopping", tax: "taxes", debt: "loan", bills: "bills", cards: "credit_card", saving: "income" };

// When to do a move: its deadline if it has one, else how long it takes.
const WHEN = ["week", "month", "dec31", "taxday", "anytime"] as const;
type When = (typeof WHEN)[number];
const WHEN_LABEL: Record<When, string> = { week: "This week", month: "This month", dec31: "Before Dec 31", taxday: "By the tax deadline", anytime: "Anytime" };
function whenOf(m: PlanMove, today: string): When {
  const year = Number(today.slice(0, 4));
  if (!m.deadline) return m.effort === "5 min" ? "week" : m.effort === "30 min" ? "month" : "anytime";
  const days = (Date.parse(m.deadline) - Date.parse(today)) / 864e5;
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  if (m.deadline <= `${year}-12-31`) return "dec31";
  if (m.deadline <= `${year + 1}-04-15`) return "taxday";
  return "anytime";
}

const value = (ms: PlanMove[], once: boolean) => ms.filter((m) => !!m.once === once).reduce((s, m) => s + Number(m.yearly_impact), 0);

export function MoneyPlan({ initial, today, name, payoff }: { initial: PlanState; today: string; name: string; payoff: { rate: number | null; later: Later | null } }) {
  const { money0, dateLabel } = useMoney();
  const [state, setState] = useState(initial);
  const [moves, setMoves] = useState(initial.moves);
  const [stage, setStage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  // Saved across every run = the server's yearly total, adjusted for what changed on this page.
  const doneBefore = value(initial.moves.filter((m) => m.status === "done"), false);
  const saved = state.saved - doneBefore + value(moves.filter((m) => m.status === "done"), false);
  const live = moves.filter((m) => m.status === "todo" || m.status === "doing").sort((a, b) => stepOf(a) - stepOf(b));
  const yearly = value(live, false), once = value(live, true);
  const first = live[0];
  const ladder = STEPS.map((k) => ({ k, ms: live.filter((m) => stepOf(m) === k && m !== first) })).filter((x) => x.ms.length);
  const closed = moves.filter((m) => m.status === "done" || m.status === "dismissed");
  const timeline = WHEN.map((w) => ({ w, ms: live.filter((m) => whenOf(m, today) === w) })).filter((x) => x.ms.length);
  const short = (d: string) => dateLabel(d, { month: "short", day: "numeric" });
  const looks = new Set(state.looksDone ?? []);

  const poll = () => {
    if (timer.current) return;
    const started = Date.now();
    timer.current = setInterval(async () => {
      setStage(Math.min(STAGES.length - 1, Math.floor((Date.now() - started) / 12000)));
      const r = await fetch("/api/plan").catch(() => null);
      if (!r?.ok) return;
      const s = (await r.json()) as PlanState;
      if (s.running) return;
      clearInterval(timer.current!);
      timer.current = null;
      setState(s);
      setMoves(s.moves);
      setOpen(null);
      router.refresh(); // the payoff chart's possible-later layer is worked out on the server from the new plan
    }, 2000);
  };
  useEffect(() => {
    if (initial.running) poll();
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setState((s) => ({ ...s, running: true, error: null }));
    setStage(0);
    const r = await fetch("/api/plan", { method: "POST" }).catch(() => null);
    if (!r?.ok) return setState((s) => ({ ...s, running: false, error: "Couldn't start the audit. Try again." }));
    poll();
  };

  const setStatus = async (m: PlanMove, status: Status, quiet = false) => {
    const before = m.status;
    const patch = { status, done_at: status === "done" ? new Date().toISOString() : null };
    setMoves((ms) => ms.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    const { error } = await createClient().from("plan_moves").update(patch).eq("id", m.id);
    if (error) {
      setMoves((ms) => ms.map((x) => (x.id === m.id ? { ...x, status: before } : x)));
      return toast("Couldn't save that. Try again.");
    }
    if (!quiet) toast(status === "done" ? `Done: ${m.title}` : status === "dismissed" ? "Hidden from your plan" : "Moved back to to do", () => setStatus({ ...m, status }, before, true));
  };

  // Ticked steps save to the move (0021 lets the browser update steps_done only).
  const setSteps = async (m: PlanMove, steps_done: number[]) => {
    const before = m.steps_done ?? [];
    setMoves((ms) => ms.map((x) => (x.id === m.id ? { ...x, steps_done } : x)));
    const { error } = await createClient().from("plan_moves").update({ steps_done }).eq("id", m.id);
    if (error) {
      setMoves((ms) => ms.map((x) => (x.id === m.id ? { ...x, steps_done: before } : x)));
      toast("Couldn't save that step. Try again.");
    } else if (m.status === "todo" && steps_done.length) setStatus(m, "doing", true);
  };

  const jump = (id: string) => {
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(`move-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const p = state.plan;
  const row = (m: PlanMove, i: number) => (
    <MoveRow key={m.id} m={m} first={i === 0} open={open === m.id} toggle={() => setOpen(open === m.id ? null : m.id)} setStatus={setStatus} setSteps={setSteps} short={short} today={today} name={name} looksDone={looks.has(m.id)} />
  );

  return (
    <div className="space-y-6">
      <section className="card p-6 md:p-7 space-y-5">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex-1 min-w-60 space-y-1.5">
            <div className="text-sm text-muted">{p ? `Last audit ${dateLabel(p.created_at, { month: "short", day: "numeric" })}, ${p.provider ? `written by ${PROVIDER[p.provider] ?? p.provider}` : "built from your numbers"}` : "No audit yet"}</div>
            <div className="figure">
              {money0(yearly)}<span className="text-base font-normal tracking-normal text-muted"> a year on the table</span>
            </div>
            <div className="text-sm text-muted tabular-nums">
              {once > 0 && <>Plus {money0(once)} one-time. </>}Saved so far: {money0(saved)} a year
            </div>
          </div>
          <button onClick={run} disabled={state.running || !state.ready} className="btn-primary disabled:opacity-60 flex items-center gap-2">
            {state.running && <LoaderCircle size={16} className="animate-spin" />}
            {state.running ? "Auditing..." : p ? "Run again" : "Run my money audit"}
          </button>
        </div>
        {state.running && <p className="text-sm text-muted" aria-live="polite">{STAGES[stage]}. This takes a minute or two; you can leave the page.</p>}
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        {state.stale && !state.running && <p className="text-sm text-bad">{state.stale} Run it again to use your current accounts.</p>}
        {!state.ready && <p className="text-sm text-muted">The money plan needs a database update. Open Setup to apply it.</p>}
        {p?.note && !state.running && (
          <p className="flex gap-2 items-start rounded-2xl bg-amber-50 text-amber-600 px-4 py-3 text-sm" role="note">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span><span className="font-medium">{p.note}</span> Moves built on those numbers are marked low confidence and not counted.</span>
          </p>
        )}
        {p?.summary && !state.running && <p className="text-sm">{p.summary}</p>}
      </section>

      {p && moves.length > 0 && <PayoffChart moves={[...(state.done ?? []).filter((d) => !moves.some((m) => m.id === d.id)), ...moves]} today={today} rate={payoff.rate} later={payoff.later} note={p.note ?? null} />}

      {!p ? (
        <section className="card p-6 space-y-3">
          <div className="card-title">What the audit looks at</div>
          <ul className="text-sm space-y-2">
            {LOOKS_AT.map((l) => (
              <li key={l} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-good" />{l}</li>
            ))}
          </ul>
          <p className="text-sm text-muted">Moves come in the usual order: stop the bleeding, a starter emergency fund, your match, debt, a full fund, tax-advantaged saving, then smaller wins. Each one has its value, the steps and any message to send. broke never acts for you: you choose what to do.</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-[1.6fr_1fr] items-start">
          <div className="space-y-6 min-w-0">
            {first && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 px-1">
                  <div className="section-label">Do this first</div>
                  <div className="text-sm text-muted">Step {stepOf(first)}: {STEP_LABEL[stepOf(first)]}</div>
                </div>
                <section className="card overflow-hidden ring-2 ring-brand/30">{row(first, 0)}</section>
              </div>
            )}
            {ladder.map((x) => (
              <div key={x.k} className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 px-1">
                  <div className="section-label">{x.k}. {STEP_LABEL[x.k]}</div>
                  <Total ms={x.ms} />
                </div>
                <section className="card overflow-hidden">{x.ms.map(row)}</section>
              </div>
            ))}
            {!live.length && <p className="card p-6 text-sm text-muted">{moves.length ? "Nothing left to do. Run the audit again after your next statement." : "This audit found no moves."}</p>}
            {closed.length > 0 && (
              <div className="space-y-3">
                <button onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="w-full flex items-baseline justify-between gap-3 px-1 text-left">
                  <span className="section-label flex items-center gap-1.5">
                    Done <span className="tabular">{closed.filter((m) => m.status === "done").length}</span>
                    <ChevronDown size={14} className={`transition-transform ${showDone ? "rotate-180" : ""}`} />
                  </span>
                  <span className="text-sm text-muted tabular">Saved {money0(saved)} a year</span>
                </button>
                {showDone && <section className="card overflow-hidden">{closed.map(row)}</section>}
              </div>
            )}
          </div>

          {timeline.length > 0 && (
            <div className="space-y-3 @5xl:sticky @5xl:top-6">
              <div className="section-label px-1">Timeline</div>
              <section className="card p-5 space-y-5">
                {timeline.map(({ w, ms }) => (
                  <div key={w} className="space-y-1">
                    <div className="text-sm font-medium">{WHEN_LABEL[w]}</div>
                    <ul>
                      {ms.map((m) => (
                        <li key={m.id}>
                          <button onClick={() => jump(m.id)} className="w-full flex items-center gap-2.5 py-1.5 text-left text-sm group">
                            <span className="size-2 rounded-full shrink-0" style={{ background: SECTION_COLOR[sectionOf(m)] }} />
                            <span className="flex-1 min-w-0 truncate group-hover:underline underline-offset-4">{m.title}</span>
                            <span className="text-xs text-muted tabular whitespace-nowrap">{m.deadline ? short(m.deadline) : m.effort}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted px-1">General education, not financial advice. Values are estimates from your own transactions and stated assumptions; a move only counts what your spare money can cover.{moves.some((m) => m.kind === "tax") && " Tax moves use 2026 US federal rules from irs.gov. broke never files or pays anything for you."}</p>
    </div>
  );
}

function Total({ ms }: { ms: PlanMove[] }) {
  const { money0 } = useMoney();
  const y = value(ms, false), o = value(ms, true);
  if (!y && !o) return null;
  return <div className="text-sm text-muted tabular">{[y ? `${money0(y)} a year` : "", o ? `${money0(o)} once` : ""].filter(Boolean).join(" + ")}</div>;
}

function MoveRow({ m, first, open, toggle, setStatus, setSteps, short, today, name, looksDone }: {
  m: PlanMove; first: boolean; open: boolean; toggle: () => void; setStatus: (m: PlanMove, s: Status) => void; setSteps: (m: PlanMove, s: number[]) => void;
  short: (d: string) => string; today: string; name: string; looksDone: boolean;
}) {
  const { money0 } = useMoney();
  const { ask } = useAssistant();
  const ticked = m.steps_done ?? [];
  const done = m.status === "done";
  const live = m.status === "todo" || m.status === "doing";
  const start = () => m.status === "todo" && setStatus(m, "doing");
  const msg = m.message ? { ...m.message, body: m.message.body.replace(/\[Your name\]/g, name) } : null;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select the text instead.");
    }
  };
  const chip = "rounded-full border border-line px-2 py-0.5";
  const amount = Number(m.yearly_impact);
  return (
    <div id={`move-${m.id}`} className={`scroll-mt-6 ${first ? "" : "border-t border-line"} ${m.status === "dismissed" ? "opacity-60" : ""}`}>
      <button onClick={toggle} aria-expanded={open} className="w-full text-left px-5 py-4 flex gap-3.5 items-start row-hover">
        <CategoryIcon icon={SECTION_ICON[sectionOf(m)]} color={SECTION_COLOR[sectionOf(m)]} size={36} />
        <span className="flex-1 min-w-0 space-y-1">
          <span className="flex items-start gap-3">
            <span className={`flex-1 min-w-0 font-medium ${done ? "line-through decoration-muted" : ""}`}>{m.title}</span>
            {amount > 0 && <span className="font-semibold tabular whitespace-nowrap">{money0(amount)}<span className="text-xs font-normal text-muted">{m.once ? " once" : "/yr"}</span></span>}
          </span>
          <span className={`text-sm text-muted ${open ? "block" : "line-clamp-1"}`}>{m.why}</span>
          {m.gate && <span className={`text-sm block ${open ? "" : "line-clamp-1"}`}>{m.gate}</span>}
          <span className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-muted">
            <span className={chip}>{m.effort}</span>
            {m.deadline && <span className={`${chip} flex items-center gap-1`}><CalendarDays size={12} />By {short(m.deadline)}</span>}
            {ticked.length > 0 && <span className={`${chip} tabular`}>{ticked.length} of {m.steps.length} steps</span>}
            {amount === 0 && <span className={chip}>Not counted in the total</span>}
            {m.status === "doing" && <span className="rounded-full bg-brand-soft text-brand px-2 py-0.5">Started</span>}
            {done && <span className="rounded-full bg-green-50 text-good px-2 py-0.5">Done</span>}
            {m.status === "dismissed" && <span className="rounded-full bg-canvas px-2 py-0.5">Not for me</span>}
            {looksDone && live && <span className="rounded-full bg-green-50 text-good px-2 py-0.5">Looks done, confirm?</span>}
          </span>
        </span>
        <ChevronDown size={18} className={`mt-0.5 text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 @md:pl-[70px] space-y-4">
          {looksDone && live && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-green-50 px-4 py-3 text-sm">
              <span className="flex-1 min-w-48">Your latest transactions suggest this is done.</span>
              <button onClick={() => setStatus(m, "done")} className="btn">Yes, mark done</button>
            </div>
          )}
          <ol className="space-y-2">
            {m.steps.map((s, i) => (
              <li key={i}>
                <label className="flex gap-3 items-start text-sm cursor-pointer">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)] shrink-0" checked={ticked.includes(i)} onChange={() => setSteps(m, ticked.includes(i) ? ticked.filter((x) => x !== i) : [...ticked, i].sort())} />
                  <span className={ticked.includes(i) ? "line-through text-muted" : ""}><span className="tabular text-muted">{i + 1}.</span> {s}</span>
                </label>
              </li>
            ))}
          </ol>
          {msg && (
            <div className="rounded-2xl bg-canvas border border-line p-4 space-y-2">
              <div className="text-xs text-muted">
                {msg.channel === "call" ? "What to say on the call" : msg.channel === "sms" ? "Text" : "Email"} to {msg.to}
                {msg.subject ? `, subject: ${msg.subject}` : ""}
              </div>
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => copy(msg.body)} className="btn flex items-center gap-1.5"><Copy size={14} /> Copy</button>
                {msg.channel === "email" && <a href={mailto(msg)} onClick={start} className="btn flex items-center gap-1.5"><Mail size={14} /> Open in Mail</a>}
                {msg.channel === "sms" && <a href={`sms:?&body=${enc(msg.body)}`} onClick={start} className="btn flex items-center gap-1.5"><MessageSquare size={14} /> Text</a>}
                {msg.phone && <a href={`tel:${msg.phone.replace(/[^\d+]/g, "")}`} onClick={start} className="btn flex items-center gap-1.5"><Phone size={14} /> Call {msg.phone}</a>}
              </div>
            </div>
          )}
          {m.links.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {m.links.map((l) => {
                const b = budgetLink(l.url);
                if (b)
                  return (
                    <button key={l.url} className="btn" onClick={async () => { start(); toast((await setBudget(b.id, b.amount)) ? `Budget set: ${money0(b.amount)} a month` : "Couldn't set the budget. Try it on Budgets."); }}>
                      {l.label}
                    </button>
                  );
                return <a key={l.url} href={l.url} onClick={start} {...(l.url.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })} className="text-sm font-medium underline underline-offset-4">{l.label}</a>;
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button onClick={() => { start(); ask(helpPrompt(m)); }} className="btn !border-brand/40 text-brand">Help me do this</button>
            {done ? (
              <button onClick={() => setStatus(m, "todo")} className="btn">Move back to to do</button>
            ) : (
              <button onClick={() => setStatus(m, "done")} className="btn-primary">Mark done</button>
            )}
            {live && <button onClick={() => remind(m, today)} className="btn flex items-center gap-1.5"><Bell size={14} /> Remind me</button>}
            {m.status === "dismissed" ? (
              <button onClick={() => setStatus(m, "todo")} className="text-sm text-muted hover:text-ink px-2">Bring back</button>
            ) : !done && (
              <button onClick={() => setStatus(m, "dismissed")} className="text-sm text-muted hover:text-ink px-2">Not for me</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
