// "AI and your data": what a model may see, and the summary cloud models get instead of rows.
// Pure: no "@/" imports, so `node src/lib/privacy.test.ts` runs it directly.
import { GOALS } from "./advice.ts";
import type { Facts, Move } from "./plan.ts";

export type AiMode = "off" | "summary" | "local";
/** What one model call gets: nothing, a summary, or full detail (the local model in "On this Mac only"). */
export type Level = "off" | "summary" | "full";

export const AI_MODES: { value: AiMode; label: string; what: string }[] = [
  { value: "off", label: "Off", what: "No AI at all. Nothing leaves this Mac." },
  { value: "summary", label: "Summary only", what: "Cloud models get monthly totals and rounded amounts. No merchant names, transactions or account details." },
  { value: "local", label: "On this Mac only", what: "Your local model gets full detail. Cloud models still get a summary only." },
];

// Summary only is the default for everyone, including accounts made before the setting existed.
export const modeOf = (meta: Record<string, unknown> | null | undefined): AiMode =>
  meta?.ai_mode === "off" || meta?.ai_mode === "local" ? meta.ai_mode : "summary";
export const levelFor = (mode: AiMode, provider: string): Level => (mode === "off" ? "off" : mode === "local" && provider === "local" ? "full" : "summary");

// Rounding rule: under 100 to the nearest 5, 100 to 1,000 to the nearest 10, above 1,000 to the nearest 100.
// Never rounds a real charge down to zero.
export function roundMoney(n: number) {
  const a = Math.abs(n);
  if (!Number.isFinite(n) || a === 0) return 0;
  const step = a < 100 ? 5 : a < 1000 ? 10 : 100;
  return Math.round(n / step) * step || Math.sign(n) * step;
}
export const month = (d: string | null | undefined) => (d ? d.slice(0, 7) : null);

// Placeholders: tokens such as "⟨M1⟩" (merchant) or "⟨S2⟩" (subscription). The map stays on the server; replies get
// real names back locally. Tokens, not words: a model shortens "Subscription 1, 2 and 3" to "Subscriptions 1 and 3"
// or "Netflix, 2 and 3", but it writes a bracketed token out whole.
export type Kind = "Merchant" | "Subscription" | "Income" | "Account" | "Holding" | "Link" | "Goal";
export type Names = { fwd: Map<string, string>; back: Map<string, string>; n: Record<Kind, number> };
export const newNames = (): Names => ({ fwd: new Map(), back: new Map(), n: { Merchant: 0, Subscription: 0, Income: 0, Account: 0, Holding: 0, Link: 0, Goal: 0 } });
const LETTER: Record<Kind, string> = { Merchant: "M", Subscription: "S", Income: "I", Account: "A", Holding: "H", Link: "L", Goal: "G" };
// What an unknown token reads as, so a stray one never reaches the screen.
const GENERIC: Record<string, string> = { M: "a merchant", S: "a subscription", I: "an income source", A: "an account", H: "a holding", L: "the link", G: "your goal" };
const key = (s: string) => s.trim().toLowerCase();

/** The placeholder for a real name, made on first sight. A name keeps its first placeholder whatever kind asks later. */
export function ph(names: Names, kind: Kind, real: string | null | undefined): string {
  if (!real?.trim()) return kind === "Merchant" ? "Unnamed merchant" : `Unnamed ${kind.toLowerCase()}`;
  const k = key(real);
  const had = names.fwd.get(k);
  if (had) return had;
  const p = `⟨${LETTER[kind]}${++names.n[kind]}⟩`;
  names.fwd.set(k, p);
  names.back.set(p, real.trim());
  return p;
}

// Bank events are not companies: "Interest charged" is card interest, not a business to call.
// The model sees what they are instead of a merchant placeholder.
const EVENTS: [RegExp, string][] = [
  [/\b(interest|intrst)\b/i, "card or loan interest"],
  [/\b(internal revenue|irs|tax(es)?)\b/i, "tax payment"],
  [/\bfees?\b|overdraft|nsf\b/i, "bank fee"],
  [/\btransfers?\b|venmo|zelle|cash app|\bcd deposit\b/i, "transfer between accounts"],
  [/credit card payment|card .*payment|\bpayment\b|autopay|loan payments?/i, "card or loan payment"],
];
/** "card or loan interest" for a bank event, else null. Name first, then the category (Fees, Transfers, Loan payments). */
export function bankEvent(name: string | null | undefined, category?: string | null): string | null {
  const n = name ?? "";
  for (const [re, label] of EVENTS) if (re.test(n)) return label;
  if (category && /^(fees|bank fees|transfers?( in| out)?|loan payments|credit card payment)$/i.test(category)) {
    for (const [re, label] of EVENTS) if (re.test(category)) return label;
  }
  return null;
}
/** A merchant as a cloud model may see it: a bank event's label, else its placeholder. */
export const who = (names: Names, kind: Kind, name: string, category?: string | null) => bankEvent(name, category) ?? ph(names, kind, name);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AMOUNT = /([$£€])\s?(\d[\d,]*(?:\.\d+)?)/g;

/** Real names (3+ letters) to placeholders, longest first. For text going to a model. */
export function mask(text: string, names: Names) {
  const reals = [...names.back.entries()].filter(([, r]) => r.length >= 3).sort((a, b) => b[1].length - a[1].length);
  for (const [p, r] of reals) text = text.replace(new RegExp(`(?<![\\w])${esc(r)}(?![\\w])`, "gi"), p);
  return text;
}
/** mask(), plus every money amount in the text rounded. For free text such as plan steps or cancel prompts. */
// Links first, so a name inside a URL ("netflix.com") stays part of the real link instead of becoming "⟨S1⟩.com".
// A URL never takes the full stop that ends its sentence.
export const scrubText = (text: string, names: Names) =>
  mask(text.replace(/https?:\/\/[^\s)"'<>]*[^\s)"'<>.,;:!?]/g, (u) => ph(names, "Link", u)), names).replace(AMOUNT, (_, c: string, n: string) => `about ${c}${roundMoney(Number(n.replace(/,/g, ""))).toLocaleString("en-US")}`);

// A token, or several in one bracket ("⟨S1, S3⟩", "⟨S1 and 3⟩"). ASCII "<S1>" too, but only when the token is known.
const TOKEN = /([⟨<])\s*([MSIAHLG]\s*\d+(?:\s*(?:,|&|\band\b|\bor\b)\s*(?:[MSIAHLG]\s*)?\d+)*)\s*([⟩>])/g;
function swapTokens(text: string, names: Names) {
  return text.replace(TOKEN, (all, open: string, body: string) => {
    let letter = "";
    const out = body.replace(/([MSIAHLG]\s*)?(\d+)/g, (_m, l: string | undefined, d: string) => {
      letter = l?.trim() ?? letter;
      const p = `⟨${letter}${d}⟩`;
      return names.back.get(p) ?? (open === "⟨" ? GENERIC[letter] : `\u0000`);
    });
    return out.includes("\u0000") ? all : out;
  });
}
// "Interest (Interest)", "Your checking (Checking)": a name repeated in brackets right after itself. Drops the bracket.
function dedupe(before: string, text: string) {
  return text.replace(/[ \t]\(([^()\n]{1,60})\)/g, (all, inner: string, at: number) => {
    const words = inner.trim().split(/\s+/).length;
    const prior = (before + text.slice(0, at)).split(/\s+/).filter(Boolean).slice(-words).join(" ").replace(/^[^\w]+/, "");
    return prior.toLowerCase() === inner.trim().toLowerCase() ? "" : all;
  });
}

/** Placeholders back to real names. Runs on the server before the reply reaches the user. */
export const unmask = (text: string, names: Names) => dedupe("", swapTokens(text, names));

// While streaming, hold back a tail that could still grow into a token ("⟨S", "⟨S1, S") or a bracket that may repeat
// the name before it (" (Interest"), so any chunking gives the same text as unmasking the whole reply.
function heldTail(s: string) {
  let hold = /[ \t]*$/.exec(s)![0].length; // a space that may come before a bracket
  const t = Math.max(s.lastIndexOf("⟨"), s.lastIndexOf("<"));
  if (t >= 0 && s.length - t <= 40 && !/[⟩>]/.test(s.slice(t))) hold = s.length - t;
  const p = s.lastIndexOf("(");
  if (p >= 0 && s.length - p <= 62 && !/[)\n]/.test(s.slice(p))) hold = Math.max(hold, s.length - p + (/[ \t]/.test(s[p - 1] ?? "") ? 1 : 0));
  return hold;
}
export function unmaskStream(names: Names, emit: (t: string) => void) {
  let buf = "";
  let sent = ""; // the last words already sent, for dedupe()
  const out = (raw: string) => {
    const text = dedupe(sent, swapTokens(raw, names));
    sent = (sent + text).slice(-200);
    if (text) emit(text);
  };
  return {
    push(t: string) {
      buf += t;
      const hold = heldTail(buf);
      const ready = buf.slice(0, buf.length - hold);
      buf = buf.slice(buf.length - hold);
      if (ready) out(ready);
    },
    flush() {
      if (buf) out(buf);
      buf = "";
    },
  };
}

// "a streaming service, about $15 a month": what a recurring charge is, never who.
const KINDS: [RegExp, string][] = [
  [/netflix|hulu|disney|hbo|\bmax\b|peacock|paramount|prime video|youtube|tv_and_movies|streaming/i, "a streaming service"],
  [/spotify|apple music|tidal|pandora|music/i, "a music service"],
  [/icloud|dropbox|google one|google storage|cloud/i, "a cloud storage service"],
  [/comcast|xfinity|spectrum|internet|broadband|cable/i, "an internet bill"],
  [/verizon|t-mobile|at&t|wireless|mobile|phone|telecom/i, "a phone bill"],
  [/insurance|geico|progressive|allstate|state farm/i, "an insurance bill"],
  [/gym|fitness|planet|equinox|peloton/i, "a gym or fitness membership"],
  [/rent|mortgage|property/i, "a housing payment"],
  [/electric|water|gas|utilit|energy|power/i, "a utility bill"],
  [/loan|credit card payment|loan_payments/i, "a loan or card payment"],
  [/payroll|salary|paycheck|direct dep/i, "a paycheck"],
  [/adobe|software|microsoft|google workspace|openai|anthropic|github|notion/i, "a software subscription"],
];
const FREQ: Record<string, string> = { WEEKLY: "a week", BIWEEKLY: "every 2 weeks", SEMI_MONTHLY: "twice a month", MONTHLY: "a month", ANNUALLY: "a year" };
export function describeCharge(o: { merchant: string; category?: string | null; amount: number; frequency?: string | null; income?: boolean; currency?: string }) {
  const what = KINDS.find(([re]) => re.test(`${o.merchant} ${o.category ?? ""}`))?.[1] ?? (o.income ? "a regular payment in" : o.category ? `a ${o.category.toLowerCase()} charge` : "a recurring charge");
  const $ = o.currency && o.currency !== "USD" ? `${o.currency} ` : "$";
  return `${what}, about ${$}${roundMoney(Math.abs(o.amount)).toLocaleString("en-US")} ${FREQ[o.frequency ?? ""] ?? "each time"}`;
}

// --- Summaries of rows ---

export type Row = { date: string; amount: number; merchant: string; category: string | null; spend: boolean; income: boolean };

const tally = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const rounded = (m: Map<string, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, roundMoney(v)]));
type Spent = Map<string, { total: number; count: number; category: string | null }>;
const addTo = (m: Spent, r: Row) => {
  const x = m.get(r.merchant) ?? { total: 0, count: 0, category: r.category };
  m.set(r.merchant, { ...x, total: x.total + r.amount, count: x.count + 1 });
};
// Top merchants as placeholders. Bank events (interest, fees, transfers, payments, tax) are merged under what they are.
function merchantList(m: Spent, names: Names, top: number) {
  const out = new Map<string, { merchant?: string; bank_event?: string; total: number; count: number }>();
  for (const [name, x] of [...m].sort((a, b) => b[1].total - a[1].total)) {
    const event = bankEvent(name, x.category);
    const k = event ?? name;
    const e = out.get(k) ?? (event ? { bank_event: event, total: 0, count: 0 } : { merchant: ph(names, "Merchant", name), total: 0, count: 0 });
    out.set(k, { ...e, total: e.total + x.total, count: e.count + x.count });
  }
  return [...out.values()].sort((a, b) => b.total - a.total).slice(0, top).map((e) => ({ ...e, total: roundMoney(e.total) }));
}

/** Monthly totals by category plus top merchants as placeholders. No single transaction, no day. */
export function spendSummary(rows: Row[], names: Names, top = 15) {
  const months = new Map<string, { spent: number; income: number; n: number; cats: Map<string, number> }>();
  const merchants: Spent = new Map();
  for (const r of rows) {
    const m = month(r.date)!;
    const e = months.get(m) ?? { spent: 0, income: 0, n: 0, cats: new Map() };
    months.set(m, e);
    if (r.spend) {
      e.spent += r.amount;
      e.n++;
      tally(e.cats, r.category ?? "Other", r.amount);
      addTo(merchants, r);
    } else if (r.income) e.income += -r.amount;
  }
  return {
    months: [...months].sort((a, b) => a[0].localeCompare(b[0])).map(([m, e]) => ({ month: m, spent: roundMoney(e.spent), received: roundMoney(e.income), purchases: e.n, by_category: rounded(e.cats) })),
    top_merchants: merchantList(merchants, names, top),
  };
}

/** What a transaction search matched, as totals. Individual rows never go to the model in summary mode. */
export function searchSummary(rows: Row[], names: Names) {
  const byMonth = new Map<string, number>(), byCat = new Map<string, number>(), byMerchant: Spent = new Map();
  for (const r of rows) {
    tally(byMonth, month(r.date)!, r.amount);
    tally(byCat, r.category ?? "Other", r.amount);
    addTo(byMerchant, r);
  }
  return {
    matches: rows.length,
    total: roundMoney(rows.reduce((s, r) => s + r.amount, 0)),
    by_month: Object.fromEntries([...byMonth].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, roundMoney(v)])),
    by_category: rounded(byCat),
    by_merchant: merchantList(byMerchant, names, 20),
    note: "Totals only. Positive = money out. You see a summary, not single transactions. A bank_event is interest, a fee, a transfer, a payment or tax, not a company.",
  };
}

export type StreamRow = { merchant_name: string; frequency: string | null; average_amount: number; next_date?: string | null; last_date?: string | null; is_income: boolean; active?: boolean | null; category?: string | null };
export function recurringSummary(streams: StreamRow[], names: Names, currency?: string) {
  return streams.map((s) => ({
    name: ph(names, s.is_income ? "Income" : "Subscription", s.merchant_name),
    what: describeCharge({ merchant: s.merchant_name, category: s.category, amount: s.average_amount, frequency: s.frequency, income: s.is_income, currency }),
    frequency: s.frequency,
    average: roundMoney(Math.abs(s.average_amount)),
    next_month: month(s.next_date),
    income: s.is_income,
    active: s.active ?? true,
  }));
}

export type AccountRow = { name: string; type: string | null; subtype: string | null; current_balance: number | null; available_balance: number | null; credit_limit: number | null; included: boolean };
export const accountsSummary = (accounts: AccountRow[], names: Names) =>
  accounts.map((a) => ({
    account: ph(names, "Account", a.name), type: a.type, subtype: a.subtype, included: a.included,
    balance: a.current_balance == null ? null : roundMoney(a.current_balance),
    available: a.available_balance == null ? null : roundMoney(a.available_balance),
    credit_limit: a.credit_limit == null ? null : roundMoney(a.credit_limit),
  }));

export type HoldingRow = { type: string | null; value: number | null; cost_basis: number | null; account_subtype: string | null };
export function holdingsSummary(rows: HoldingRow[]) {
  const by = new Map<string, { count: number; value: number; cost: number }>();
  for (const h of rows) {
    const k = `${h.account_subtype ?? "account"}: ${h.type ?? "other"}`;
    const e = by.get(k) ?? { count: 0, value: 0, cost: 0 };
    by.set(k, { count: e.count + 1, value: e.value + Number(h.value ?? 0), cost: e.cost + Number(h.cost_basis ?? h.value ?? 0) });
  }
  return [...by].map(([k, e]) => ({ group: k, holdings: e.count, value: roundMoney(e.value), gain: roundMoney(e.value - e.cost) }));
}

// Free text the user typed (profile notes) never leaves in summary mode, and neither does a credit score number:
// the credit band (profile.credit) is enough for the model.
// notes: the user's own words about themselves ("What should your plan know?"). With the names map they go to the
// model with every known name swapped for its placeholder; without one they're left out.
const goalName = (g: string, names?: Names) => (GOALS.includes(g) || !names ? g : ph(names, "Goal", g));
export const profileForModel = (p: Record<string, unknown> | undefined, names?: Names) => {
  if (!p) return p;
  const { notes, creditScore: _score, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  if (names && typeof notes === "string" && notes.trim()) rest.notes = mask(notes.slice(0, 1000), names);
  // A goal the user typed is their words too: a placeholder with the names map, left out without one.
  if (Array.isArray(rest.goals)) rest.goals = (rest.goals as string[]).flatMap((g) => (GOALS.includes(g) ? [g] : names ? [ph(names, "Goal", g)] : []));
  if (Array.isArray(rest.goalPlans) && !names) rest.goalPlans = (rest.goalPlans as { goal: string }[]).filter((g) => GOALS.includes(g.goal));
  // Goal targets are the user's own numbers, but cloud models still only see them rounded.
  if (Array.isArray(rest.goalPlans))
    rest.goalPlans = (rest.goalPlans as { goal: string; amount: number; saved?: number }[]).map((g) => ({ ...g, goal: goalName(g.goal, names), amount: roundMoney(g.amount), ...(g.saved != null ? { saved: roundMoney(g.saved) } : {}) }));
  return rest;
};

// For tool results that are already totals: round money, months for dates, placeholders for names, drop links and notes.
const DROP = /^(url|cancel_url|links?|message|notes?|tags?|mask|logo_url|ticker|referral_link)$/;
const NAME: Record<string, Kind> = { merchant: "Merchant", merchant_name: "Merchant", merchants: "Merchant", name: "Merchant", account: "Account", holding: "Holding" };
const KEEP_NUMBER = /pct|apy|ratio|rate|count|year|matches|holdings|purchases|months|assumed/i;
const TEXT = /^(group|title|why|steps|note|cancel_instructions|negotiate_instructions|bonus|label|detail|summary)$/;
export function scrubJson(v: unknown, names: Names, nameKind: Kind = "Merchant", k = ""): unknown {
  if (Array.isArray(v)) return v.map((x) => scrubJson(x, names, nameKind, k));
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (k === "account" && typeof o.name === "string") return ph(names, "Account", o.name);
    const out: Record<string, unknown> = {};
    for (const [kk, x] of Object.entries(o)) if (!DROP.test(kk)) out[kk] = scrubJson(x, names, nameKind, kk);
    return out;
  }
  if (typeof v === "number") return KEEP_NUMBER.test(k) ? v : roundMoney(v);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return month(v);
    if (k in NAME) return NAME[k] === "Merchant" && (k !== "name" || nameKind === "Merchant") ? who(names, "Merchant", v) : ph(names, k === "name" ? nameKind : NAME[k], v);
    return TEXT.test(k) || /^\d+$/.test(k) ? scrubText(v, names) : v;
  }
  return v;
}

// --- Check-ins and the money plan ---

type CheckinFactsLike = {
  unusual: { date: string; merchant: string; amount: number; usual: number }[];
  newSubs: { merchant: string; amount: number; frequency: string; since: string }[];
  priceUps: { merchant: string; usual: number; last: number }[];
  upcoming: { merchant: string; date: string; amount: number }[];
  upcomingTotal: number;
  cash: number | null;
};
/** The weekly check-in facts as lines a cloud model may see. */
export function checkinSummary(f: CheckinFactsLike, names: Names) {
  const $ = (n: number) => `about $${roundMoney(n).toLocaleString("en-US")}`;
  return [
    ...f.unusual.map((u) => `${who(names, "Merchant", u.merchant)} charged ${$(u.amount)} this week. Usually ${$(u.usual)}.`),
    ...f.newSubs.map((s) => `New recurring charge: ${ph(names, "Subscription", s.merchant)}, ${describeCharge({ merchant: s.merchant, amount: s.amount, frequency: s.frequency })}, first seen in ${month(s.since)}.`),
    ...f.priceUps.map((p) => `${ph(names, "Subscription", p.merchant)} went up: last charge ${$(p.last)}, usually ${$(p.usual)}.`),
    ...(f.upcoming.length ? [`${f.upcoming.length} bills due in the next 10 days, ${$(f.upcomingTotal)} in all: ${f.upcoming.map((u) => ph(names, "Subscription", u.merchant)).join(", ")}.`] : ["No bills due in the next 10 days."]),
    ...(f.cash == null ? [] : [`Checking balance: ${$(f.cash)}.`]),
  ];
}

/** The plan's facts and candidate moves as a cloud model may see them. unmask() on the reply restores names and links. */
export function planSummary(f: Facts, candidates: Move[], names: Names): { facts: Facts; candidates: Move[] } {
  const M = (n: string) => who(names, "Merchant", n);
  const S = (n: string) => ph(names, "Subscription", n);
  const link = (u: string) => ph(names, "Link", u);
  const r = roundMoney;
  // Recurring names first, so a bill keeps its "Subscription N" wherever else it shows up.
  for (const n of [...f.bills.map((b) => b.name), ...f.priceHikes.map((p) => p.merchant), ...f.duplicates.flatMap((d) => d.merchants)]) S(n);
  for (const m of f.topMerchants) M(m.name);
  for (const u of f.allowedUrls) link(u);
  // Listed field by field, no spread: a new Facts field fails the type check here until it is summarised too.
  const facts: Facts = {
    today: f.today,
    country: f.country,
    currency: f.currency,
    state: f.state,
    monthlySpend: r(f.monthlySpend),
    bills: f.bills.map((b) => ({ ...b, name: S(b.name), yearly: r(b.yearly), cancelUrl: b.cancelUrl && link(b.cancelUrl), nextDate: month(b.nextDate) })),
    priceHikes: f.priceHikes.map((p) => ({ merchant: S(p.merchant), from: r(p.from), to: r(p.to), date: month(p.date)!, yearly: r(p.yearly) })),
    duplicates: f.duplicates.map((d) => ({ group: mask(d.group, names), merchants: d.merchants.map(S), monthly: r(d.monthly), cheapestYearly: r(d.cheapestYearly) })),
    idle: f.idle && { cash: r(f.idle.cash), excess: r(f.idle.excess), gain: r(f.idle.gain) },
    match: f.match && { ...f.match, gapLow: r(f.match.gapLow), gapHigh: r(f.match.gapHigh) },
    room: f.room.map((x) => ({ ...x, left: r(x.left) })),
    cards: f.cards && { ...f.cards, owned: f.cards.owned.map((c) => ph(names, "Account", c)), currentEarn: r(f.cards.currentEarn) },
    rent: f.rent && { name: S(f.rent.name), yearly: r(f.rent.yearly) },
    interest90: r(f.interest90),
    fees90: r(f.fees90),
    topCategories: f.topCategories.map((c) => ({ label: c.label, spend90: r(c.spend90) })),
    topMerchants: f.topMerchants.map((m) => ({ name: M(m.name), spend90: r(m.spend90), count: m.count })),
    bigCharges: [], // single transactions: never in a summary
    tax: f.tax && {
      ...f.tax, refunds365: r(f.tax.refunds365), payments365: r(f.tax.payments365), side90: r(f.tax.side90), sideFrom: f.tax.sideFrom.map((n) => ph(names, "Income", n)),
      losses: f.tax.losses.map((l) => ({ name: ph(names, "Holding", l.name), loss: r(l.loss) })), charity365: r(f.tax.charity365), studentLoan365: r(f.tax.studentLoan365), childcare365: r(f.tax.childcare365),
    },
    allowedUrls: f.allowedUrls.map(link),
    // Ladder and gate inputs: fixed goal labels (typed ones as placeholders), category labels and rounded totals only.
    goals: f.goals?.map((g) => goalName(g, names)),
    goalPlans: f.goalPlans?.map((g) => ({ ...g, goal: goalName(g.goal, names), amount: roundMoney(g.amount), ...(g.saved != null ? { saved: roundMoney(g.saved) } : {}) })),
    risk: f.risk,
    budget: f.budget && { ...f.budget, income: r(f.budget.income), spend: r(f.budget.spend), cash: r(f.budget.cash), essentials: r(f.budget.essentials) },
    months: f.months?.map((m) => ({ month: m.month, income: r(m.income), spend: r(m.spend) })),
    spikes: f.spikes?.map((x) => ({ ...x, now: r(x.now), avg: r(x.avg) })),
    debts: f.debts?.map((d) => ({ kind: d.kind, balance: r(d.balance) })),
    iraRoth: f.iraRoth,
    futureShare: f.futureShare,
  };
  const candidatesOut = candidates.map((m) => ({
    ...m,
    ref: mask(m.ref, names),
    deadline: month(m.deadline),
    title: scrubText(m.title, names),
    why: scrubText(m.why, names),
    steps: m.steps.map((s) => scrubText(s, names)),
    message: m.message ? { ...m.message, to: scrubText(m.message.to, names), subject: m.message.subject && scrubText(m.message.subject, names), body: scrubText(m.message.body, names) } : m.message,
    links: m.links.map((l) => ({ label: scrubText(l.label, names), url: link(l.url) })),
    yearly_impact: r(m.yearly_impact),
  }));
  return { facts, candidates: candidatesOut };
}

/** Runs a model call only when the level allows one. Off returns null without calling anything. */
export const withAi = async <T>(level: Level, run: (level: "summary" | "full") => Promise<T>): Promise<T | null> => (level === "off" ? null : run(level));
