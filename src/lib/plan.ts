// Money plan: the facts broke finds in code, the moves they add up to, and the checks on what an AI writes back.
// Pure: no "@/" imports, so `node src/lib/plan.test.ts` runs it directly.
import { z } from "zod";
import type { Cat } from "./cards.ts";
import type { Negotiable } from "./subscriptions.ts";
import { limitFor } from "./invest.ts";
import { goalAccount, investOrder, RISK, TARGET_GOALS, type GoalPlan } from "./advice.ts";
import {
  CAPITAL_LOSS_LIMIT, CHARITY_NONITEMIZER, DEPENDENT_CARE_CAP, ESTIMATED_DUE, IRS, pct, RETURN_DUE, ROTH_PHASE, SAFE_HARBOR, SE_TAX,
  STANDARD_DEDUCTION, STUDENT_LOAN_CAP, STUDENT_LOAN_PHASE, TRAD_COVERED_PHASE, usDay, type Filing,
} from "./tax.ts";

// A move's ref for a goal target. A goal the user typed gets a hash: refs reach cloud models, typed names don't.
const goalRef = (goal: string) => TARGET_GOALS.includes(goal)
  ? `goal:${goal.toLowerCase().replace(/[^a-z]+/g, "-")}`
  : `goal:own-${[...goal.toLowerCase()].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7).toString(36)}`;
export const KINDS = ["cancel", "negotiate", "insurance", "card", "signup", "message", "earn", "tax", "budget", "save"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = {
  cancel: "Cancel or pause", negotiate: "Negotiate", insurance: "Switch insurance", card: "Better card", signup: "Sign up", message: "Message someone", earn: "Make more", tax: "Tax",
  budget: "Spend less", save: "Save",
};
// What a move is about: its colour and icon on the page.
export const SECTIONS = ["spending", "debt", "saving", "tax", "bills", "cards"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = { spending: "Spending", tax: "Taxes", debt: "Debt and interest", bills: "Bills and subscriptions", cards: "Cards and rewards", saving: "Saving and investing" };
// Code-built moves set their own section; a move the AI adds (or a row from before 0019) falls back on its ref, then its kind.
export function sectionOf(m: { ref?: string | null; kind: Kind; section?: string | null }): Section {
  if (m.section && (SECTIONS as readonly string[]).includes(m.section)) return m.section as Section;
  const head = (m.ref ?? "").split(":")[0];
  if (head === "tax" || head === "room") return "tax";
  if (head === "interest" || head === "fees") return "debt";
  if (head === "hysa" || head === "match" || head === "fund") return "saving";
  if (head === "overspend" || head === "spike" || head === "subs") return "spending";
  return ({ cancel: "bills", negotiate: "bills", insurance: "bills", message: "bills", card: "cards", signup: "cards", earn: "saving", tax: "tax", budget: "spending", save: "saving" } as const)[m.kind];
}

// The priority ladder: the usual order in mainstream personal-finance guidance. The page sorts and groups by it.
export const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = {
  1: "Stop the bleeding", 2: "Starter emergency fund", 3: "Employer match", 4: "Pay off debt", 5: "Full emergency fund", 6: "Tax-advantaged saving", 7: "Smaller wins",
};
// Rows from before 0021 (and moves the AI adds) get their step from the ref.
export function stepOf(m: { ref?: string | null; kind: Kind; step?: number | null }): Step {
  if (m.step && (STEPS as readonly number[]).includes(m.step)) return m.step as Step;
  const ref = m.ref ?? "", head = ref.split(":")[0];
  if (head === "interest" || head === "fees" || head === "overspend") return 1;
  if (ref === "fund:starter") return 2;
  if (head === "match") return 3;
  if (ref === "goal:debt") return 4;
  if (ref === "fund:full") return 5;
  if (head === "room" || ref === "tax:ira") return 6;
  return 7;
}
// Emergency fund targets, in months of essential spending.
export const STARTER_MONTHS = 1;
export const FULL_MONTHS = 3;
// Categories counted as essential spending for the emergency fund.
export const ESSENTIAL_KEYS = ["GROCERIES", "RENT_AND_UTILITIES", "TRANSPORTATION", "MEDICAL", "LOAN_PAYMENTS"];
export const DOUBT_NOTE = "Some numbers look off. Check your linked accounts.";
export const EFFORTS = ["5 min", "30 min", "1 hour+"] as const;
export const STATUSES = ["todo", "doing", "done", "dismissed"] as const;
export type Status = (typeof STATUSES)[number];

// Assumptions, not quotes. Named in each move's "why" so the user sees them.
export const NEGOTIATE_CUT = 0.15; // a retention or loyalty discount on internet and phone bills
export const INSURANCE_CUT = 0.1; // what shopping 3 quotes commonly saves

export type Bill = {
  name: string;
  yearly: number;
  frequency: string;
  cat: Cat; // card bucket the bill earns in
  negotiable: Negotiable | null;
  cancelUrl: string | null;
  nextDate: string | null;
  sub?: boolean; // a subscription, not rent, utilities or a loan (the Recurring page's split)
};
export type CardOffer = { id: string; name: string; issuer: string; url: string; referral: boolean; fee: number; ongoing: number; yearOne: number; bonus: number | null; bonusReachable: boolean | null; rates: Record<Cat, number>; fitsCredit?: boolean | null };
export type Facts = {
  today: string;
  country: string; // ISO code
  currency: string;
  state: string | null;
  monthlySpend: number;
  bills: Bill[];
  priceHikes: { merchant: string; from: number; to: number; date: string; yearly: number }[];
  duplicates: { group: string; merchants: string[]; monthly: number; cheapestYearly: number }[];
  idle: { cash: number; excess: number; gain: number } | null; // gain = high-yield minus big-bank interest a year
  match: { cap: [number, number]; pct: number; guessed: boolean; gapLow: number; gapHigh: number } | null; // guessed: their rate is unknown, pct is a common one
  room: { label: string; kind: string; left: number; deadline: string; due: string }[];
  cards: { owned: string[]; currentEarn: number; currentRates: Record<Cat, number>; best: CardOffer | null; bonusPick: CardOffer | null } | null;
  rent: { name: string; yearly: number } | null;
  interest90: number; // card interest charged in the last 90 days
  fees90: number; // bank fees in the last 90 days
  topCategories: { label: string; spend90: number }[];
  topMerchants: { name: string; spend90: number; count: number }[];
  bigCharges: { date: string; name: string; amount: number; category: string | null }[];
  // US only, and only for the tax year in tax.ts; null elsewhere so no US rule reaches another country.
  tax: {
    filing: Filing | null; band: [number, number] | null; rate: number; rateNote: string; guessed: boolean;
    work: string | null; age: string | null; dependents: string | null; covered: boolean; // covered: a workplace plan, as far as the profile says
    refunds365: number; payments365: number; // tax refunds in, tax paid out of pocket, last 12 months
    side90: number; sideFrom: string[]; // non-payroll income, last 90 days
    losses: { name: string; loss: number }[]; // taxable (non-retirement) holdings below cost
    charity365: number; studentLoan365: number; childcare365: number;
  } | null;
  allowedUrls: string[];
  // Optional (older callers and tests omit them). planSummary in src/lib/privacy.ts rounds them for cloud models.
  goals?: string[]; // the profile's goals, as ProfileForm writes them
  goalPlans?: GoalPlan[]; // targets for some goals: amount, month, saved so far
  risk?: string | null; // the profile's answer to "if your investments fell 20%" (advice.ts RISK)
  // Monthly averages over the last full months with data, and the cash available now. The affordability gate reads this.
  // essentialsAll: no essential categories found, so all spending. incomeTold: no paycheck found, income is the take-home pay they typed.
  budget?: { income: number; incomeTold?: boolean; spend: number; cash: number; essentials: number; essentialsAll: boolean };
  months?: { month: string; income: number; spend: number }[]; // last month, then this month so far (YYYY-MM)
  spikes?: { id: string; label: string; now: number; avg: number; months: number }[]; // this month vs the average of earlier months
  debts?: { kind: "card" | "student" | "loan"; balance: number }[];
  iraRoth?: boolean; // a linked IRA is a Roth
  futureShare?: number; // share of the last 90 days' transactions dated after today
};

const Effort = z.enum(EFFORTS);
export const MessageSchema = z.object({
  to: z.string().min(1).max(80),
  channel: z.enum(["email", "sms", "call"]),
  subject: z.string().max(140).optional(),
  body: z.string().min(1).max(2000),
});
export const LinkSchema = z.object({ label: z.string().min(1).max(60), url: z.string().min(1).max(500) });
export const MoveSchema = z.object({
  ref: z.string().max(80).default("other"),
  kind: z.enum(KINDS),
  title: z.string().min(3).max(120),
  why: z.string().min(3).max(320),
  yearly_impact: z.number().finite().min(0).max(1e7),
  effort: Effort,
  steps: z.array(z.string().min(2).max(240)).min(3).transform((s) => s.slice(0, 6)),
  message: MessageSchema.nullish(),
  links: z.array(LinkSchema).max(4).nullish(),
  confidence: z.enum(["high", "medium", "low"]),
  section: z.enum(SECTIONS).nullish(),
});
// deadline, step, once and gate: set in code only (the AI can't move a date, a rung or the affordability gate).
// message.phone: only from verified data, never from the model.
export type Move = Omit<z.output<typeof MoveSchema>, "section" | "message"> & {
  links: z.output<typeof LinkSchema>[]; section: Section; deadline: string | null; step: Step; once: boolean; gate: string | null;
  message?: (z.output<typeof MessageSchema> & { phone?: string }) | null;
};
const PlanSchema = z.object({ summary: z.string().max(400).optional(), moves: z.array(z.unknown()).max(20) });

type Money = (n: number) => string;
const usd: Money = (n) => "$" + Math.round(n).toLocaleString("en-US");
const r = Math.round;
const names = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

type In = Omit<Move, "links" | "message" | "section" | "deadline" | "step" | "once" | "gate"> & {
  links?: Move["links"]; message?: Move["message"]; section?: Section; deadline?: string | null; step?: Step; once?: boolean; gate?: string | null;
};

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const monthName = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

// The data looks wrong: card interest in 90 days above half the card balance, or most transactions dated after today.
export function sanity(f: Facts): string | null {
  const cardBalance = sum((f.debts ?? []).filter((d) => d.kind === "card").map((d) => d.balance));
  if (f.interest90 > 0 && cardBalance > 0 && f.interest90 > cardBalance * 0.5) return DOUBT_NOTE;
  if ((f.futureShare ?? 0) > 0.5) return DOUBT_NOTE;
  return null;
}

// Where the user stands on the ladder, from real numbers. No budget facts (a test, an old caller): nothing is gated.
export function ladder(f: Facts) {
  const b = f.budget ?? null;
  const spare = b ? Math.max(0, b.income - b.spend) : null; // a month
  // Essentials, but never under half a month of all spending: a few tagged categories can undercount badly.
  const month = b ? Math.max(b.essentials, b.spend / 2) : 0;
  const starter = b ? month * STARTER_MONTHS : null;
  const full = b ? month * FULL_MONTHS : null;
  const carrying = f.interest90 >= 1; // paying card interest
  const cushion = !b || b.cash >= starter!;
  const over = (f.months ?? []).filter((m) => m.spend - m.income >= 100);
  return { b, spare, starter, full, carrying, cushion, over, creditOk: !carrying && cushion, doubt: sanity(f) };
}
export type Ladder = ReturnType<typeof ladder>;

// The affordability gate for a contribution with a deadline: how much the user can really put in by then.
// Ladder order: card interest and the starter fund come first; after them, spare money each month plus cash above the full fund.
export function fundable(f: Facts, L: Ladder, left: number, due: string, money: Money): { amount: number; gate: string | null; perMonth: number } {
  const months = Math.max(0.5, (Date.parse(due) - Date.parse(f.today)) / 864e5 / 30.4);
  const perMonth = left / months;
  if (!L.b) return { amount: left, gate: null, perMonth };
  const need = `Needs about ${money(perMonth)} a month; you have about ${money(L.spare!)} spare.`;
  if (L.carrying) return { amount: 0, gate: `${need} Pay off card interest first.`, perMonth };
  if (!L.cushion) return { amount: 0, gate: `${need} Build your ${money(L.starter!)} starter fund first.`, perMonth };
  const amount = Math.min(left, L.spare! * months + Math.max(0, L.b.cash - L.full!));
  return { amount, gate: amount < left - 1 ? need : null, perMonth };
}

// The moves straight from the facts. Used as the AI's candidates, and as the plan itself when no AI is ready.
// Sorted by the ladder, then by value.
export function deterministicMoves(f: Facts, money: Money = usd): Move[] {
  const out: Move[] = [];
  const add = (m: In) => out.push({ links: [], deadline: null, once: false, gate: null, ...m, section: sectionOf(m), step: m.step ?? stepOf(m), yearly_impact: r(m.yearly_impact) });
  const L = ladder(f);
  const goals = f.goals ?? [];
  // Over in a recent month, or a typical month (the same figures the affordability gate uses) spends more than comes in.
  const typicalOver = !!L.b && L.b.spend - L.b.income >= 100;
  const bleeding = L.over.length > 0 || typicalOver;
  const cut: Step = bleeding ? 1 : 7; // spending cuts are step 1 while spending runs above income

  // 1. Stop the bleeding: card interest, fees, spending above income, a category that jumped. Interest goes first on a tie.
  // Half the yearly pace: paying balances down or getting a refund takes time.
  if (f.interest90 > 0)
    add({
      ref: "interest", kind: "card", step: 1, confidence: "medium", effort: "1 hour+", yearly_impact: (f.interest90 * 365 / 90) / 2,
      title: "Stop paying card interest",
      why: `You paid ${money(f.interest90)} in card interest in 90 days, about ${money(f.interest90 * 365 / 90)} a year. Counted at half, since paying down takes time.`,
      steps: ["List each card's balance and interest rate.", "Pay at least the full statement balance on new spending.", "Put every spare dollar on the highest-rate card first.", "Call the issuer and ask for a lower rate.", "Don't open new cards until the balance is gone."],
      message: { to: "Your card issuer", channel: "call", body: "Hi, I've been a customer for a while and I'm paying down my balance. Can you lower my interest rate? If not, is there a hardship or payment plan that would lower it?" },
      links: [{ label: "See your cards", url: "/cards" }, { label: "See your accounts", url: "/accounts" }],
    });
  if (f.fees90 >= 10)
    add({
      ref: "fees", kind: "message", step: 1, confidence: "medium", effort: "5 min", yearly_impact: (f.fees90 * 365 / 90) / 2,
      title: "Ask your bank to refund its fees",
      why: `You paid ${money(f.fees90)} in bank fees in 90 days. Banks often refund them when asked; counted at half.`,
      steps: ["Find the fee charges on your statement.", "Message your bank and ask for a refund.", "Ask how to avoid the fee from now on, like a minimum balance or direct deposit."],
      message: { to: "Your bank", channel: "email", subject: "Fee refund request", body: `Hi,\n\nI was charged ${money(f.fees90)} in fees over the last 3 months. Could you refund them, and tell me how to avoid these fees from now on?\n\nThanks,\n[Your name]` },
    });

  if (bleeding) {
    const ms = f.months ?? [];
    add({
      ref: "overspend", kind: "budget", step: 1, confidence: "high", effort: "30 min", yearly_impact: 0,
      title: "Bring spending back under what comes in",
      why: [
        ...(typicalOver ? [`In a typical month you spend about ${money(L.b!.spend)} and about ${money(L.b!.income)} comes in${L.b!.incomeTold ? ", from what you told us" : ""}.`] : []),
        ...ms.map((m) => `${monthName(m.month)}${m === ms.at(-1) && ms.length > 1 ? " so far" : ""}: you spent ${money(m.spend)} and ${money(m.income)} came in.`),
      ].join(" "),
      steps: ["Open this month's transactions and find the 3 biggest categories.", "Set a budget for each one that ran over.", "Pause anything you can until spending is below what comes in.", "Check again at the end of the month."],
      links: [{ label: "See this month's spending", url: "/transactions" }, { label: "Set budgets", url: "/budgets" }],
    });
  }

  for (const s of f.spikes ?? [])
    add({
      ref: `spike:${s.label}`, kind: "budget", section: "spending", step: cut, confidence: "medium", effort: "5 min", yearly_impact: 0,
      title: `Bring ${s.label} back to about ${money(s.avg)} a month`,
      why: `${s.label} is ${money(s.now)} so far this month. Your average over the ${s.months > 1 ? `${s.months} months before` : "month before"} was ${money(s.avg)}.`,
      steps: [`Look through this month's ${s.label} charges for anything unusual.`, `Set a ${money(s.avg)} budget for ${s.label}.`, "Check it once a week until the month ends."],
      links: [{ label: `See ${s.label} charges`, url: `/transactions?category=${s.id}` }, { label: `Set a ${money(s.avg)} budget`, url: `/budgets?set=${s.id}&amount=${r(s.avg)}` }],
    });

  const subs = f.bills.filter((b) => b.sub);
  const subsYearly = sum(subs.map((b) => b.yearly));
  if (subs.length >= 2 && subsYearly >= 100)
    add({
      ref: "subs", kind: "cancel", section: "spending", step: cut, confidence: "medium", effort: "30 min", yearly_impact: 0,
      title: `Review your ${subs.length} subscriptions`,
      why: `They cost ${money(subsYearly)} a year together. The biggest: ${names(subs.slice(0, 3).map((b) => `${b.name} ${money(b.yearly)}`))}.`,
      steps: ["Open Recurring and go down the list.", "Cancel anything you haven't used in the last month.", "For the ones you keep, check for a cheaper plan or a yearly price.", "Check next month's statement that cancelled charges stopped."],
      links: [{ label: "Open Recurring", url: "/recurring" }, ...subs.filter((b) => b.cancelUrl).slice(0, 3).map((b) => ({ label: `Cancel ${b.name}`, url: b.cancelUrl! }))],
    });

  for (const d of f.duplicates)
    add({
      ref: `duplicate:${d.group}`, kind: "cancel", step: cut, confidence: "high", effort: "5 min", yearly_impact: d.cheapestYearly,
      title: `Keep one ${d.group} subscription, not ${d.merchants.length}`,
      why: `You pay for ${names([...new Set(d.merchants)])}, ${money(d.monthly)} a month together.`,
      steps: ["Pick the one you use most.", "Cancel the others from their account page.", "Check next month's statement that the charge stopped."],
      links: f.bills.filter((b) => d.merchants.includes(b.name) && b.cancelUrl).map((b) => ({ label: `Cancel ${b.name}`, url: b.cancelUrl! })),
    });

  for (const h of f.priceHikes) {
    const bill = f.bills.find((b) => b.name === h.merchant);
    add({
      ref: `hike:${h.merchant}`, kind: "cancel", step: cut, confidence: "medium", effort: "30 min", yearly_impact: h.yearly,
      title: `Undo the ${h.merchant} price rise or cancel it`,
      why: `${h.merchant} went from ${money(h.from)} to ${money(h.to)} on ${h.date}, ${money(h.yearly)} more a year.`,
      steps: [`Ask ${h.merchant} support for the old price or a cheaper plan.`, "If they say no, downgrade or cancel.", "Set a reminder to check the next charge."],
      links: bill?.cancelUrl ? [{ label: `${h.merchant} account`, url: bill.cancelUrl }] : [],
      message: { to: `${h.merchant} support`, channel: "email", subject: "Price increase on my account", body: `Hi,\n\nMy ${h.merchant} charge went from ${money(h.from)} to ${money(h.to)}. I'd like to keep my account at the old price or move to a cheaper plan. If that isn't possible, please tell me how to cancel.\n\nThanks,\n[Your name]` },
    });
  }

  // 2. Starter emergency fund, 5. the full one. Not savings, so 0 toward the total.
  const efGoal = goals.includes("Build an emergency fund");
  if (L.b) {
    const what = L.b.essentialsAll ? "spending" : "essential spending (groceries, rent and utilities, transport, medical and loan payments)";
    const noSpare = L.spare! < 1 ? `You have about ${money(0)} spare a month. Bring spending under income first.` : null;
    if (!L.cushion)
      add({
        ref: "fund:starter", kind: "save", section: "saving", step: 2, confidence: "high", effort: "30 min", yearly_impact: 0, gate: noSpare,
        title: `Build a ${money(L.starter!)} starter emergency fund`,
        why: `The rule used here: one month of ${what}, or half a month of all spending if that is more. That is about ${money(L.starter!)}. You have ${money(L.b.cash)} available now.${efGoal ? " You set an emergency fund as a goal." : ""}`,
        steps: ["Use a separate savings account at an insured bank, or open one.", "Set an automatic transfer for each payday, even a small one.", "Put refunds and windfalls in it.", "Use it only for real emergencies, then refill it."],
      });
    else if (L.b.cash < L.full!)
      add({
        ref: "fund:full", kind: "save", section: "saving", step: 5, confidence: "high", effort: "30 min", yearly_impact: 0, gate: noSpare,
        title: `Grow your emergency fund to ${money(L.full!)}`,
        why: `That is ${FULL_MONTHS} months of ${L.b.essentialsAll ? "spending" : "essential spending"}. You have ${money(L.b.cash)} available now.${efGoal ? " You set an emergency fund as a goal." : ""}`,
        steps: ["Keep it in a savings account at an insured bank.", "Raise the automatic transfer on each payday.", "Stop once you reach the target and send the extra to the next step."],
      });
  }

  // 3. The employer match, counted only as far as spare money covers the extra contribution (dollar for dollar).
  if (f.match && f.match.gapHigh > 0) {
    const value = f.match.gapLow || f.match.gapHigh / 2;
    const counted = L.spare == null ? value : Math.min(value, L.spare * 12);
    add({
      ref: "match", kind: "signup", step: 3, confidence: f.match.guessed || !f.match.gapLow ? "low" : "high", effort: "5 min", yearly_impact: counted,
      gate: counted < value - 1 ? `Needs about ${money(value / 12)} a month; you have about ${money(L.spare!)} spare.` : null,
      title: "Get your full 401(k) match",
      why: `Your employer matches up to ${f.match.cap[0]}${f.match.cap[1] !== f.match.cap[0] ? `-${f.match.cap[1]}` : ""}% of pay. ${f.match.guessed ? `If you put in ${r(f.match.pct)}%,` : `At ${r(f.match.pct)}%`} you likely leave about ${money(value)} a year unclaimed.`,
      steps: ["Ask HR how the match works and the rate you need.", "Raise your contribution to at least the match cap in your 401(k) portal.", "Check your next payslip shows the new rate."],
      message: { to: "HR", channel: "email", subject: "Question about the 401(k) match", body: "Hi,\n\nCould you tell me how the 401(k) match works: the percent of pay it matches up to, and when it vests? I want to make sure I contribute enough to get all of it.\n\nThanks,\n[Your name]" },
    });
  }

  // 4. Pay off debt, when it's a stated goal.
  const debts = (f.debts ?? []).filter((d) => d.balance >= 1);
  if (goals.includes("Pay off debt") && debts.length) {
    const label = { card: "cards", student: "student loans", loan: "other loans" } as const;
    const by = (["card", "student", "loan"] as const).map((k) => ({ k, total: sum(debts.filter((d) => d.kind === k).map((d) => d.balance)) })).filter((x) => x.total > 0);
    add({
      ref: "goal:debt", kind: "save", section: "debt", step: 4, confidence: "medium", effort: "1 hour+", yearly_impact: 0,
      title: "Pay off your debt, highest rate first",
      why: `You set paying off debt as a goal. You owe ${names(by.map((x) => `${money(x.total)} on ${label[x.k]}`))}.`,
      steps: [
        "Find the interest rate on each balance.", "Pay every minimum on time, on autopay.", "Put every spare dollar on the highest rate first, usually the card.", "When one is paid off, add its payment to the next one.",
        ...(by.some((x) => x.k === "student") ? ["For federal student loans, check studentaid.gov for an income-driven plan if payments are too high."] : []),
      ],
      links: [{ label: "See your accounts", url: "/accounts" }],
    });
  }

  // Goal targets: the monthly amount to hit each one, against what's spare. Within 5 years it's savings, next to the
  // full emergency fund (step 5); further out it can be invested, next to tax-advantaged saving (step 6).
  for (const g of (f.goalPlans ?? []).filter((x) => goals.includes(x.goal))) {
    const months = Math.max(1, (Number(g.by.slice(0, 4)) - Number(f.today.slice(0, 4))) * 12 + Number(g.by.slice(5, 7)) - Number(f.today.slice(5, 7)));
    const left = Math.max(0, g.amount - (g.saved ?? 0));
    if (left < 1) continue;
    const perMonth = left / months, where = goalAccount(f.country, g.goal), when = `${monthName(g.by)} ${g.by.slice(0, 4)}`;
    const spare = L.spare;
    const first = L.carrying ? "Pay off card interest first." : !L.cushion ? `Build your ${money(L.starter!)} starter fund first.` : null;
    const short = spare != null && spare < perMonth - 1;
    add({
      ref: goalRef(g.goal), kind: "save", section: "saving", step: months <= 60 ? 5 : 6, confidence: "high", effort: "30 min", yearly_impact: 0,
      deadline: `${g.by}-01`, gate: first ? `Needs about ${money(perMonth)} a month. ${first}` : null,
      title: `Put ${money(perMonth)} a month toward ${g.goal === "Buy a home" ? "your home" : g.goal === "Save for kids' college" ? "your kids' education" : g.goal === "Plan a big purchase" ? "your big purchase" : g.goal}`,
      why: [
        `Your target is ${money(g.amount)} by ${when}${g.saved ? `, with ${money(g.saved)} saved` : ""}: ${money(left)} to go over ${months} months.`,
        spare == null ? "" : short ? `You have about ${money(spare)} spare a month, so at that pace it takes about ${Math.ceil(left / Math.max(spare, 1))} months. Push the date out, lower the target, or free up spending.` : `You have about ${money(spare)} spare a month, which covers it.`,
      ].filter(Boolean).join(" "),
      steps: [`Open ${where.label} for it. ${where.why}`, `Set an automatic transfer of ${money(perMonth)} each month${f.budget ? " on payday" : ""}.`, "Keep your emergency fund separate from it.", `Check progress every few months and adjust the amount or the date.`],
    });
  }

  // 6. Tax-advantaged room (HSA, 401(k), IRA in taxMoves), through the gate.
  const t = f.tax;
  const rate = t?.rate ?? 0;
  const employee = !!t && t.work !== "Self-employed" && t.work !== "Not working";
  for (const x of f.room.filter((x) => (x.kind === "hsa" || x.kind === "k401") && x.left >= 500 && t)) {
    // HSA: payroll contributions stop Dec 31 (and skip Social Security and Medicare tax); direct ones count until the April return date.
    const payroll = x.kind === "k401" || employee;
    const due = payroll ? `${f.today.slice(0, 4)}-12-31` : x.due;
    const g = fundable(f, L, x.left, due, money);
    const when = x.kind === "k401" ? "through payroll by Dec 31" : payroll ? `through payroll by Dec 31, or directly by ${x.deadline}` : `directly by ${x.deadline}`;
    add({
      ref: `room:${x.kind}`, kind: "earn", step: 6, confidence: t!.guessed ? "low" : "medium", effort: "5 min", yearly_impact: g.amount * rate, deadline: due, gate: g.gate,
      title: g.amount >= x.left - 1 ? `Use your ${money(x.left)} of ${x.label} room` : g.amount > 0 ? `Put about ${money(g.amount)} more in your ${x.label}` : `Add to your ${x.label} once the steps above are done`,
      why: `You have ${money(x.left)} of ${x.label} room left, ${when}. ${g.amount > 0 ? `${money(g.amount)} at ${pct(rate)} saves about ${money(g.amount * rate)} in federal tax.` : `Each $1,000 in saves about ${money(1000 * rate)} in federal tax at ${pct(rate)}.`}${x.kind === "hsa" && payroll ? " Payroll contributions also skip Social Security and Medicare tax." : ""}`,
      steps: [`Check your ${x.label} balance and this year's contributions.`, x.kind === "k401" ? "Raise your payroll contribution in your 401(k) portal." : payroll ? "Raise your payroll contribution with HR or your benefits portal." : "Add money directly from your bank.", "Keep your emergency fund and card payments covered first."],
    });
  }
  // Outside the US: the local accounts in invest.ts, with no tax figure (local rates aren't checked).
  if (f.country !== "US")
    for (const x of f.room.filter((x) => x.left >= 100)) {
      const g = fundable(f, L, x.left, x.due, money);
      add({
        ref: `room:${x.kind}`, kind: "earn", section: "saving", step: 6, confidence: "low", effort: "30 min", yearly_impact: 0, deadline: x.due, gate: g.gate,
        title: `Use your ${x.label} room before ${x.deadline}`,
        why: `You have ${money(x.left)} of ${x.label} room left for this tax year.`,
        steps: [`Check what you've put into your ${x.label} this year.`, "Decide how much you can add without touching your emergency cash.", `Add it before ${x.deadline}.`],
      });
    }
  if (t) taxMoves(f, t, money, add, L);

  // After the basics (no card interest, full emergency fund, money spare): invest the rest, in the country's account order,
  // with the mix set by how the user says they'd take a fall. General guidance only: broke never names a fund.
  if (L.b && !L.carrying && L.b.cash >= L.full! && L.spare! >= 50 && (goals.includes("Invest more") || goals.includes("Retire early") || !goals.length)) {
    const mix = f.risk === RISK[0] ? "Mostly shares suits you for money you won't touch for 10 years or more."
      : f.risk === RISK[1] ? "A mix of shares and bonds you can hold through a fall suits you."
      : f.risk === RISK[2] ? "You said you'd sell after a 20% fall, so keep more in bonds and cash, and only invest what you won't need for 10 years."
      : "Answer the 20% question in your profile to get a mix that suits you.";
    add({
      ref: "invest", kind: "save", section: "saving", step: 6, confidence: "medium", effort: "1 hour+", yearly_impact: 0,
      title: `Invest about ${money(L.spare! / 2)} a month`,
      why: `Card interest is clear and your emergency fund is full, with about ${money(L.spare!)} spare a month. Investing half leaves room for goals and surprises.${goals.includes("Retire early") ? " You set retiring early as a goal, so the earlier you start the more it compounds." : ""} ${mix}`,
      steps: [`Fill accounts in this order: ${investOrder(f.country).join(", then ")}.`, "Choose low-cost, broad index funds, and compare fees before you buy.", "Set it to invest automatically each month.", "Leave it alone through falls; check once or twice a year."],
    });
  }

  // 7. Smaller wins: cards and bonuses only with no card interest and a starter fund. New credit otherwise is left out.
  // Never a card outside the user's credit range (fitsCredit false).
  const c = f.cards;
  if (c?.best && L.creditOk && c.best.fitsCredit !== false) {
    const best = c.best;
    const gain = best.ongoing - c.currentEarn;
    const moved = f.bills.map((b) => ({ b, extra: (b.yearly * (best.rates[b.cat] - c.currentRates[b.cat])) / 100 })).filter((x) => x.extra > 0.5).sort((a, b) => b.extra - a.extra).slice(0, 3);
    if (gain >= 25)
      add({
        ref: `card:${best.id}`, kind: "card", step: 7, confidence: "medium", effort: "30 min", yearly_impact: gain,
        title: `Pay bills and spending with the ${best.issuer} ${best.name}`,
        why: `It would earn ${money(best.ongoing)} a year after the fee on your spending, ${money(gain)} more than ${c.owned.length ? "your cards" : "now"}.${moved.length ? ` Moving ${names(moved.map((x) => x.b.name))} alone adds ${money(moved.reduce((s, x) => s + x.extra, 0))}.` : ""}`,
        steps: [`Read the terms on the ${best.issuer} page and apply.`, ...(moved.length ? [`Move ${names(moved.map((x) => x.b.name))} to the new card.`] : []), "Use it for everyday spending.", "Set autopay to the full statement balance so you never pay interest."],
        links: [{ label: `Apply for ${best.name}`, url: best.url }],
      });
  }
  if (c?.bonusPick?.bonus && c.bonusPick.bonusReachable && L.creditOk && c.bonusPick.fitsCredit !== false)
    add({
      ref: `bonus:${c.bonusPick.id}`, kind: "signup", step: 7, once: true, confidence: "medium", effort: "30 min", yearly_impact: c.bonusPick.bonus,
      title: `Earn the ${c.bonusPick.issuer} ${c.bonusPick.name} sign-up bonus`,
      why: `Worth about ${money(c.bonusPick.bonus)} once, and your usual spending reaches the minimum in time.${c.bonusPick.fee ? ` The card has a ${money(c.bonusPick.fee)} yearly fee.` : ""}`,
      steps: ["Read the bonus terms on the issuer's page.", "Apply only if you can pay the card in full each month.", "Track your spending until you pass the minimum.", "Set autopay to the full balance."],
      links: [{ label: `Apply for ${c.bonusPick.name}`, url: c.bonusPick.url }],
    });

  if (f.idle && f.idle.gain >= 20)
    add({
      ref: "hysa", kind: "signup", step: 7, confidence: "high", effort: "30 min", yearly_impact: f.idle.gain,
      title: `Move ${money(f.idle.excess)} to a high-yield savings account`,
      why: `You hold ${money(f.idle.cash)} in cash, ${money(f.idle.excess)} more than 3 months of spending. At a typical high-yield rate that earns about ${money(f.idle.gain)} more a year.`,
      steps: ["Compare a few high-yield savings accounts at insured banks.", "Open one and link it to your checking.", `Move ${money(f.idle.excess)} and keep 3 months of spending in checking.`],
    });

  for (const b of f.bills.filter((x) => x.negotiable === "internet" || x.negotiable === "phone"))
    add({
      ref: `negotiate:${b.name}`, kind: "negotiate", step: 7, confidence: "medium", effort: "30 min", yearly_impact: b.yearly * NEGOTIATE_CUT,
      title: `Ask ${b.name} for a lower ${b.negotiable} bill`,
      why: `You pay ${b.name} ${money(b.yearly)} a year. A ${NEGOTIATE_CUT * 100}% retention discount is a common outcome.`,
      steps: ["Look up what new customers pay for the same plan.", `Call ${b.name} and ask for the retention or loyalty team.`, "Ask for a lower rate or a cheaper plan, and drop add-ons you don't use.", "If they say no, say you're ready to switch and ask again."],
      message: { to: `${b.name} retention team`, channel: "call", body: `Hi, I've been a customer for a while and my bill is ${money(b.yearly / 12)} a month. I've seen lower prices for new customers. What can you do to bring my bill down? Otherwise I'm planning to switch.` },
    });

  for (const b of f.bills.filter((x) => x.negotiable === "insurance"))
    add({
      ref: `insurance:${b.name}`, kind: "insurance", step: 7, confidence: "medium", effort: "1 hour+", yearly_impact: b.yearly * INSURANCE_CUT, deadline: b.nextDate,
      title: `Get 3 quotes to beat ${b.name}`,
      why: `You pay ${b.name} ${money(b.yearly)} a year${b.nextDate ? `, next charge ${b.nextDate}` : ""}. Shopping around often saves about ${INSURANCE_CUT * 100}%.`,
      steps: ["Find your current policy's coverage limits and deductible.", "Get 3 quotes for the same coverage from other insurers.", "Compare price, deductible and coverage line by line.", `Ask ${b.name} to match the best quote.`, "Switch at renewal, and only cancel once the new policy is active."],
    });

  if (f.rent)
    add({
      ref: "rent", kind: "message", step: 7, confidence: "low", effort: "5 min", yearly_impact: 0,
      title: "Ask your landlord about renewal terms early",
      why: `Rent is your biggest bill at ${money(f.rent.yearly)} a year. Asking early gives you time to compare.`,
      steps: ["Find your lease end date.", "Email your landlord 60-90 days before it ends.", "Ask for the renewal rent, and whether a longer lease lowers it."],
      message: { to: "Landlord", channel: "email", subject: "Lease renewal", body: "Hi,\n\nMy lease ends soon and I'd like to plan ahead. Could you tell me the renewal rent? Would signing a longer lease lower it?\n\nThanks,\n[Your name]" },
    });

  // Doubtful data: no big move is built on it.
  if (L.doubt)
    for (const m of out)
      if (m.yearly_impact >= 1000) Object.assign(m, { yearly_impact: 0, confidence: "low", gate: "This number looks off. Check your linked accounts first." });

  return ladderSort(out);
}

// Ladder order, then value (yearly before one-time at the same value).
export const ladderSort = <T extends { step: number; yearly_impact: number }>(ms: T[]) => ms.sort((a, b) => a.step - b.step || b.yearly_impact - a.yearly_impact);

// Tax moves, US only. Every figure is from tax.ts. broke never files or pays anything: steps and links only.
function taxMoves(f: Facts, t: NonNullable<Facts["tax"]>, money: Money, add: (m: In) => void, L: Ladder) {
  const year = Number(f.today.slice(0, 4));
  const rate = t.rate, rateWhy = t.guessed ? `Counted at ${pct(rate)}, the lowest bracket. Add your income in your profile for a closer number.` : `At your ${pct(rate)} bracket, from the low end of your income band.`;
  const employee = t.work !== "Self-employed" && t.work !== "Not working";
  const sideEarner = t.work === "Self-employed" || t.work === "Both" || t.side90 >= 400;
  const bandText = t.band ? (t.band[1] === Infinity ? `over ${money(t.band[0])}` : `${money(t.band[0])}-${money(t.band[1])}`) : "";

  // Over-withholding. Not savings: the same money arrives sooner, so it counts 0 toward the total.
  if (t.refunds365 >= 1000 && employee)
    add({
      ref: "tax:withholding-refund", kind: "tax", confidence: "medium", effort: "30 min", yearly_impact: 0,
      title: `Get about ${money(t.refunds365 / 12)} a month back in your pay`,
      why: `You got ${money(t.refunds365)} in tax refunds in the last 12 months. That is your own pay held back all year, so it isn't counted as savings.`,
      steps: ["Run the IRS Tax Withholding Estimator with your latest payslip.", "Fill in a new Form W-4 with the result.", "Give the new W-4 to your employer or payroll portal.", "Check your next payslip shows less tax taken out.", "Leave a small margin so you don't owe next April."],
      links: [{ label: "Tax Withholding Estimator", url: IRS.estimator }, { label: "Form W-4", url: IRS.w4 }],
    });
  // Owed at filing (an IRS or state payment from the bank). Self-employed payments are usually estimates, covered by the quarterly move below.
  if (t.payments365 >= 200 && !sideEarner)
    add({
      ref: "tax:withholding-owed", kind: "tax", confidence: "medium", effort: "30 min", yearly_impact: 0,
      title: "Check your withholding so you don't owe again",
      why: `You paid ${money(t.payments365)} in tax from your bank in the last 12 months. Withholding that covers ${SAFE_HARBOR.current}% of this year's tax avoids the underpayment penalty.`,
      steps: [
        "Run the IRS Tax Withholding Estimator with your latest payslip.",
        "If it shows a gap, add extra withholding on a new Form W-4.",
        `No penalty if you paid ${SAFE_HARBOR.current}% of this year's tax or ${SAFE_HARBOR.prior}% of last year's (${SAFE_HARBOR.priorHigh}% if last year's AGI was over ${money(SAFE_HARBOR.highAgi)}).`,
        "Check your next payslip shows the change.",
      ],
      links: [{ label: "Tax Withholding Estimator", url: IRS.estimator }, { label: "Form W-4", url: IRS.w4 }, { label: "Publication 505", url: IRS.p505 }],
    });

  // Quarterly estimated tax. Avoids a penalty, not a saving, so 0 toward the total.
  if (sideEarner) {
    const next = ESTIMATED_DUE.find((d) => d >= f.today) ?? null;
    const share = SE_TAX + rate, monthly = t.side90 / 3;
    add({
      ref: "tax:estimated", kind: "tax", confidence: t.side90 ? "medium" : "low", effort: "30 min", yearly_impact: 0, deadline: next,
      title: `Set aside about ${pct(share)} of side income for tax`,
      why: t.side90
        ? `${money(t.side90)} came in from ${names(t.sideFrom.slice(0, 3))} in 90 days with no tax taken out. That is ${pct(SE_TAX)} self-employment tax plus your ${pct(rate)} bracket, about ${money(monthly * share)} a month.`
        : `Your profile says you earn for yourself. Nothing takes tax out of that pay: ${pct(SE_TAX)} self-employment tax plus your ${pct(rate)} bracket.`,
      steps: [
        "Open a separate savings account just for tax.",
        `Move about ${pct(share)} of each payment into it when it lands.`,
        next ? `Pay the next estimate by ${usDay(next)} with IRS Direct Pay.` : "Pay each estimate with IRS Direct Pay.",
        `Use the Form 1040-ES worksheet to size each payment. ${year} dates: ${ESTIMATED_DUE.map(usDay).join(", ")}.`,
      ],
      links: [{ label: "Form 1040-ES", url: IRS.es }, { label: "IRS Direct Pay", url: IRS.directPay }],
    });
  }

  // Tax-loss harvesting in taxable accounts: the ordinary-income offset only (gains elsewhere are unknown).
  const loss = t.losses.reduce((s, x) => s + x.loss, 0);
  if (loss >= 100) {
    const cap = CAPITAL_LOSS_LIMIT[t.filing ?? "single"], used = Math.min(loss, cap);
    add({
      ref: "tax:harvest", kind: "tax", confidence: t.guessed ? "low" : "medium", effort: "30 min", yearly_impact: used * rate, deadline: `${year}-12-31`,
      title: `Sell ${money(loss)} of losing investments before Dec 31`,
      why: `${names(t.losses.slice(0, 3).map((x) => x.name))} ${t.losses.length > 1 ? "are" : "is"} below what you paid in a taxable account. Up to ${money(cap)} of losses offsets other income. ${rateWhy}`,
      steps: [
        "Sell the losing positions before Dec 31 to lock in the loss.",
        "Don't buy the same or a substantially identical fund 30 days before or after the sale, in any account, including an IRA. That is the wash-sale rule.",
        "To stay invested, buy a similar fund that isn't substantially identical.",
        `Losses offset gains first, then up to ${money(cap)} of other income. The rest carries to next year.`,
      ],
      links: [{ label: "Capital losses (Topic 409)", url: IRS.tc409 }, { label: "Wash sales (Pub 550)", url: IRS.p550 }],
    });
  }

  // IRA for this tax year, when the profile says they earn and income allows a Roth or a deductible traditional IRA.
  if (t.filing && t.band && t.work && t.work !== "Not working") {
    const linked = f.room.find((x) => x.kind === "ira");
    const { limit } = limitFor("ira", year, { age: t.age ?? undefined });
    const left = linked?.left ?? limit;
    const [r0, r1] = ROTH_PHASE[t.filing];
    const roth = t.band[1] <= r0 ? "full" : t.band[0] >= r1 ? "none" : "partial";
    const deductible = !t.covered || t.band[1] <= TRAD_COVERED_PHASE[t.filing][0];
    if (left >= 500 && (roth !== "none" || deductible)) {
      const g = fundable(f, L, left, RETURN_DUE, money);
      // A linked IRA: add to it, don't open one. Plaid's "roth" subtype says which kind.
      const acct = linked ? (f.iraRoth ? "your Roth IRA" : "your IRA") : "an IRA";
      add({
        ref: "tax:ira", kind: "tax", step: 6, confidence: "medium", effort: "30 min", yearly_impact: deductible ? g.amount * rate : 0, deadline: RETURN_DUE, gate: g.gate,
        title: g.amount >= left - 1 ? `${linked ? "Add" : "Put"} up to ${money(left)} ${linked ? "to" : "in"} ${acct} for ${year}` : g.amount > 0 ? `${linked ? "Add" : "Put"} about ${money(g.amount)} ${linked ? "to" : "in"} ${acct} for ${year}` : `Add to ${acct} once the steps above are done`,
        why: `${linked ? `You have ${money(left)} of IRA room left` : `The ${year} IRA limit is ${money(limit)}`}, open until ${usDay(RETURN_DUE)}. ${roth === "full" ? `On ${bandText} a Roth IRA is open to you.` : roth === "partial" ? `On ${bandText} your Roth amount may be reduced.` : `On ${bandText} a Roth IRA isn't open to you.`}${deductible && g.amount > 0 ? ` A traditional IRA deduction on ${money(g.amount)} saves about ${money(g.amount * rate)}.` : ""}`,
        steps: [
          linked ? "Check this year's contributions in your IRA account." : "Check whether you've put any money in an IRA this year.",
          linked ? `Add the money to ${acct} by ${usDay(RETURN_DUE)} and mark it for ${year}.` : deductible && roth !== "none" ? "Pick Roth (tax-free later) or traditional (a deduction now)." : deductible ? "Use a traditional IRA and claim the deduction." : "Use a Roth IRA.",
          linked ? "Set a monthly transfer so it fills over time." : "Open one at a low-cost brokerage.",
          ...(linked ? [] : [`Add the money by ${usDay(RETURN_DUE)} and mark it for ${year}.`]),
        ],
        links: [{ label: "IRA rules (Pub 590-A)", url: IRS.p590a }],
      });
    }
  }

  // Charity: from 2026 cash gifts count up to the cap even with the standard deduction.
  if (t.charity365 >= 50) {
    const cap = CHARITY_NONITEMIZER[t.filing ?? "single"], used = Math.min(t.charity365, cap);
    add({
      ref: "tax:charity", kind: "tax", confidence: "low", effort: "5 min", yearly_impact: used * rate, deadline: RETURN_DUE,
      title: `Deduct up to ${money(used)} of cash gifts to charity`,
      why: `You gave ${money(t.charity365)} to groups your bank marks as charities in the last 12 months. From ${year} up to ${money(cap)} of cash gifts counts without itemizing.`,
      steps: [
        "Check each gift went to a qualified charity. School fees and gifts to people don't count.",
        "Keep the bank record or receipt for every gift.",
        "Only cash gifts count this way, not donor-advised funds or goods.",
        `Itemizing only helps if all your deductions pass the ${money(STANDARD_DEDUCTION[t.filing ?? "single"])} standard deduction.`,
      ],
      links: [{ label: "Charitable gifts (Topic 506)", url: IRS.tc506 }],
    });
  }

  // Student loan interest: an adjustment to income, so it helps with the standard deduction too.
  const [s0, s1] = t.filing === "mfj" ? STUDENT_LOAN_PHASE.mfj : STUDENT_LOAN_PHASE.other;
  if (t.studentLoan365 > 0 && !(t.band && t.band[0] >= s1))
    add({
      ref: "tax:student-loan", kind: "tax", confidence: "medium", effort: "5 min", yearly_impact: 0, deadline: RETURN_DUE,
      title: "Claim your student loan interest",
      why: `You paid ${money(t.studentLoan365)} toward student loans in the last 12 months. Up to ${money(STUDENT_LOAN_CAP)} of the interest is deductible without itemizing; the payments don't show how much was interest.`,
      steps: [
        "Download Form 1098-E from your loan servicer in January.",
        `Enter the interest on your return, up to ${money(STUDENT_LOAN_CAP)}.`,
        `The deduction shrinks between ${money(s0)} and ${money(s1)} of modified AGI.`,
      ],
      links: [{ label: "Student loan interest (Topic 456)", url: IRS.tc456 }],
    });

  // Dependent care FSA: pre-tax pay for childcare, through an employer plan.
  if (t.childcare365 >= 500 && employee && t.filing !== "mfs" && t.dependents && t.dependents !== "0") {
    const used = Math.min(t.childcare365, DEPENDENT_CARE_CAP);
    add({
      ref: "tax:dependent-care", kind: "tax", confidence: "low", effort: "30 min", yearly_impact: used * rate,
      title: "Pay for childcare with a dependent care FSA",
      why: `You spent ${money(t.childcare365)} on childcare in the last 12 months. From ${year} up to ${money(DEPENDENT_CARE_CAP)} can come from pre-tax pay. ${rateWhy}`,
      steps: [
        "Ask HR if your employer offers a dependent care FSA.",
        "Sign up at open enrollment for what you expect to spend next year.",
        "Send your childcare receipts to the plan to get paid back.",
        "You can't use the same costs for the child and dependent care credit.",
      ],
    });
  }
}

// Real links only: one from the facts' allow-list (cancel pages, card pages), or a page inside broke.
const norm = (u: string) => u.trim().replace(/\/+$/, "");
export function allowLinks(links: { label: string; url: string }[] | null | undefined, allowed: string[]) {
  const ok = new Set([...allowed, ...Object.values(IRS)].map(norm));
  return (links ?? []).filter((l) => ok.has(norm(l.url)) || /^\/(plan|cards|recurring|optimize|insights|accounts|budgets|transactions|spending|settings)(\/|\?|#|$)/.test(l.url));
}

const clean = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").trim();
const cleanMove = (m: Move): Move => ({
  ...m, title: clean(m.title), why: clean(m.why), steps: m.steps.map(clean),
  message: m.message ? { ...m.message, body: m.message.body.replace(/—/g, ",") } : m.message,
});

// The one sentence of a move's "why" the dashboard shows: the first with a dollar figure the title doesn't already have.
export function whyLine(title: string, why: string) {
  const ss = why.split(/(?<=[.!?])\s+(?=[A-Z$])/);
  const inTitle = dollars(title);
  return ss.find((x) => dollars(x).some((n) => !inTitle.includes(n))) ?? ss.find((x) => dollars(x).length) ?? ss[0] ?? why;
}

// Dollar figures in a text. "$3.3k" counts as 3,300.
const dollars = (s: string) => [...s.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/gi)].map((x) => Number(x[1].replace(/,/g, "")) * (x[2] ? 1000 : 1));
// The model may round a code figure ("about $3,300" for $3,323), never bring a new one.
export function sameNumbers(text: string, cand: Move) {
  const known = dollars([cand.title, cand.why, ...cand.steps, cand.gate ?? "", cand.message?.body ?? ""].join(" "));
  return dollars(text).every((n) => known.some((k) => Math.abs(n - k) <= Math.max(1, k * 0.05)));
}
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9()]{4,}/g) ?? []);
const overlaps = (a: string, b: string) => { const w = words(b); return [...words(a)].some((x) => w.has(x)); };
// New credit the model might add on its own.
const CREDIT = /\b(card|bonus|credit|balance transfer|apply)\b/i;
const TAX_ADVANTAGED = /401\(?k\)?|\bira\b|\bhsa\b|403\(?b\)?/i;

// The AI's reply -> valid moves. Bad moves are dropped one by one; an unreadable reply is an error (the caller retries once).
// A move tied to a candidate keeps the candidate's step, gate, deadline, one-time flag and links, can't claim more
// than its number, and can't bring a dollar figure the candidate doesn't have.
export const KEEP_MIN = 100;
// Code moves that always stay, whatever their value: the ladder's first six steps and the spending reviews.
const PINNED = (c: Move) => c.yearly_impact >= KEEP_MIN || c.step <= 6 || /^(subs|spike:|tax:withholding)/.test(c.ref);

export function parsePlan(text: string, f: Facts, candidates: Move[]): { summary: string | null; moves: Move[]; dropped: number } | { error: string } {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { error: "No JSON object found. Reply with only the JSON object." };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}` };
  }
  const top = PlanSchema.safeParse(raw);
  if (!top.success) return { error: `Wrong shape: ${top.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  const L = ladder(f);
  const byRef = new Map(candidates.map((c) => [c.ref, c]));
  const parsed = top.data.moves.map((m) => MoveSchema.safeParse(m));
  const named = new Set(parsed.flatMap((p) => (p.success && byRef.has(p.data.ref) ? [p.data.ref] : [])));
  const moves: Move[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const p of parsed) {
    if (!p.success) { dropped++; continue; }
    const d = p.data;
    // A candidate the model kept under a new ref: same kind and section, a shared word in the title, not named elsewhere.
    const sec = sectionOf({ ref: d.ref, kind: d.kind, section: d.section });
    const cand = byRef.get(d.ref) ?? candidates.find((c) => !seen.has(c.ref) && !named.has(c.ref) && c.kind === d.kind && c.section === sec && overlaps(c.title, d.title));
    if (!cand && !L.creditOk && (d.kind === "card" || d.kind === "signup") && CREDIT.test(`${d.title} ${d.why}`) && !/interest/i.test(d.title)) { dropped++; continue; }
    const ref = cand ? cand.ref : `other:${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
    if (seen.has(ref)) { dropped++; continue; }
    seen.add(ref);
    if (cand) {
      const ok = sameNumbers([d.title, d.why, ...d.steps, d.message?.body ?? ""].join(" "), cand);
      moves.push(cleanMove({
        // The code title always wins: it is already plain, and a model echo of a placeholder can change its case.
        ...d, ref, title: cand.title, why: ok ? d.why : cand.why, steps: ok ? d.steps : cand.steps,
        message: d.message && ok ? { ...d.message, phone: cand.message?.phone } : cand.message ?? null,
        section: cand.section, step: cand.step, once: cand.once, gate: cand.gate, deadline: cand.deadline, links: cand.links,
        yearly_impact: r(Math.min(d.yearly_impact, cand.yearly_impact)),
      }));
    } else {
      const step = TAX_ADVANTAGED.test(d.title) ? 6 : stepOf({ ref, kind: d.kind });
      const held = step === 6 && (L.carrying || !L.cushion);
      moves.push(cleanMove({
        ...d, ref, section: sec, step, once: false, gate: held ? "Once the steps above are done." : null, deadline: null,
        message: d.message ? { ...d.message } : null,
        yearly_impact: held ? 0 : r(d.yearly_impact),
        confidence: d.confidence === "high" ? "medium" : d.confidence,
        links: allowLinks(d.links, f.allowedUrls).filter((l) => !l.url.includes("?set=")),
      }));
    }
  }
  if (!moves.length) return { error: dropped ? `All ${dropped} moves failed validation against the schema.` : "No moves." };
  for (const c of candidates) if (PINNED(c) && !seen.has(c.ref)) moves.push(c);
  return { summary: top.data.summary ? clean(top.data.summary) : null, moves: ladderSort(moves), dropped };
}

// A new run keeps what the user already did: done and dismissed moves don't come back, doing stays doing.
export function carryStatus(moves: Move[], earlier: { ref: string | null; status: Status }[]) {
  const last = new Map(earlier.filter((e) => e.ref).map((e) => [e.ref!, e.status]));
  return moves.filter((m) => !["done", "dismissed"].includes(last.get(m.ref) ?? "")).map((m) => ({ ...m, status: (last.get(m.ref) === "doing" ? "doing" : "todo") as Status }));
}

export const PLAN_SYSTEM = `You are broke AI, the money assistant inside broke. You write the user's money plan: a ranked list of concrete moves that save or earn money.
Use only the facts given. Every number in "why" must come from the facts. Never invent prices, offers, phone numbers, email addresses or URLs.
Never say broke will do something for the user: give the steps they take. broke never files taxes, pays the IRS or changes withholding: tax moves are steps, drafts and links only.
Tax moves (kind "tax") use only the figures in their candidate. Never add a tax rule, limit, rate or date that isn't in the candidates or facts, and never apply US tax rules outside the US. A move with yearly_impact 0 stays 0: a smaller refund or a paid estimate is not savings.
Follow the priority ladder. Each candidate has a "step": 1 stop the bleeding (card interest, fees, spending above income), 2 a starter emergency fund, 3 the employer 401(k) match, 4 the rest of the debt, 5 a full emergency fund, 6 HSA, IRA and 401(k) room, 7 smaller wins (cards, bonuses, switching providers). Keep each candidate's step; the plan is ordered by it.
The affordability gate is already applied in code: a candidate's yearly_impact is only what the user can fund, and "gate" says why it is lower. Never raise it, never tell the user to put in more than the candidate says, and never drop a gate's point from the why.
Never recommend a new credit card, a sign-up bonus, a balance transfer card or any new credit while the user pays card interest or has no starter emergency fund ("new_credit_ok" false). Card and bonus moves you add then are dropped.
Never contradict a candidate's numbers: a rewrite may round a dollar figure the candidate has, never bring a new one. "once" means the value comes once, not every year; keep that wording.
You get candidate moves already worked out in code. Every candidate in steps 1 to 6, and every one worth $100 a year or more, must stay as its own move with its own ref (improve its wording); you may merge or drop the smaller ones in step 7, improve the wording, steps and drafted messages, and add at most 3 more moves only when the facts clearly show them (for example a large charge that looks shared with a friend, so a message asking them to settle up). No generic tips.
Reply with ONLY one JSON object, no prose, no code fence:
{"summary": "one plain sentence naming the first thing to do", "moves": [{"ref": "the candidate's ref, or \\"other\\"", "kind": "cancel|negotiate|insurance|card|signup|message|earn|tax|budget|save", "section": "spending|debt|saving|tax|bills|cards", "title": "short imperative", "why": "one or two sentences citing their numbers, under 300 characters", "yearly_impact": number, "effort": "5 min|30 min|1 hour+", "steps": ["3 to 6 short imperative steps"], "message": {"to": "who", "channel": "email|sms|call", "subject": "optional", "body": "the drafted text"} or null, "links": [{"label": "...", "url": "only from allowed_urls"}], "confidence": "high|medium|low"}]}
yearly_impact is conservative, in the user's currency, never above the candidate's number. Plain short sentences, sentence case, no em dashes, no markdown.`;
