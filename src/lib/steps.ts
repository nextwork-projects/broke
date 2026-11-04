// The three steps on Home: where your money goes, a budget, where what's left can go. Pure, so
// `node src/lib/steps.test.ts` runs it. All of it works with no AI.
import { investOrder } from "./advice.ts";
import type { Ladder } from "./plan.ts";

type Row = { month: string; category_id: string; spend: number; income: number };
type Cat = { id: string; key?: string; label: string; color: string; icon: string };
export type Slice = { id: string | null; label: string; color: string; icon: string | null; amount: number };

/** One month as a split-up paycheck: the biggest categories and any loan payments, the rest as Other. income falls back to told when none landed. */
export function moneyPicture(rows: Row[], cats: Cat[], month: string, told: number | null, loans = 0) {
  const inMonth = rows.filter((r) => r.month.startsWith(month));
  const by = new Map<string, number>();
  for (const r of inMonth) if (r.spend > 0) by.set(r.category_id, (by.get(r.category_id) ?? 0) + r.spend);
  const sorted = [...by].sort((a, b) => b[1] - a[1]);
  const slices: Slice[] = sorted.slice(0, 4).map(([id, amount]) => {
    const c = cats.find((x) => x.id === id);
    return { id, label: c?.label ?? "Other", color: c?.color ?? "#888780", icon: c?.icon ?? null, amount };
  });
  const rest = sorted.slice(4).reduce((s, [, n]) => s + n, 0);
  if (loans > 0) {
    const c = cats.find((x) => x.key === "LOAN_PAYMENTS");
    slices.push({ id: c?.id ?? null, label: "Loan payments", color: c?.color ?? "#888780", icon: c?.icon ?? null, amount: loans });
    slices.sort((a, b) => b.amount - a.amount);
  }
  if (rest > 0) slices.push({ id: null, label: "Everything else", color: "#888780", icon: null, amount: rest });
  const spent = slices.reduce((s, x) => s + x.amount, 0);
  const landed = inMonth.reduce((s, r) => s + r.income, 0);
  const income = landed > 0 ? landed : told;
  return { spent, income, left: income == null ? null : income - spent, slices, base: Math.max(income ?? 0, spent) };
}

/** What each goal with a target needs a month, first goal first, paid out of what's left over. got: how much of it fits. */
export function goalSlices(plans: { goal: string; amount: number; by: string; saved?: number }[], today: string, left: number | null) {
  let room = Math.max(0, left ?? 0);
  return plans.flatMap((g) => {
    const months = Math.max(1, (Number(g.by.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(g.by.slice(5, 7)) - Number(today.slice(5, 7)));
    const toGo = g.amount - (g.saved ?? 0);
    if (toGo < 1) return [];
    const need = toGo / months, got = Math.min(need, room);
    room -= got;
    return [{ label: g.goal, need, got, by: g.by }];
  });
}

/** The month to show: the last full one once it has spending, else this one. */
export const pictureMonth = (rows: Row[], thisMonth: string, lastMonth: string) => (rows.some((r) => r.month.startsWith(lastMonth) && r.spend > 0) ? lastMonth : thisMonth);

export type BudgetLine = { label: string; amount: number; spent: number };
/** Budgets as sentences' worth of numbers. perDay: what's left across unspent budgets, per day left. */
export function budgetCheck(lines: BudgetLine[], daysLeft: number) {
  const over = lines.filter((l) => l.spent - l.amount >= 1).map((l) => ({ label: l.label, by: l.spent - l.amount })).sort((a, b) => b.by - a.by);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const left = lines.reduce((s, l) => s + Math.max(0, l.amount - l.spent), 0);
  return { total, over, onTrack: lines.length - over.length, perDay: left / Math.max(1, daysLeft) };
}

// What the account names mean, in one line. General facts about each account, not advice on what to buy.
const PLAIN: [RegExp, string][] = [
  [/401\(k\)/, "A retirement account through your job. Many employers add money when you do."],
  [/HSA/, "A health savings account with tax breaks for medical costs."],
  [/IRA/, "A retirement account you open yourself, with tax breaks."],
  [/brokerage|general investment|non-registered/i, "A regular investing account with no tax break."],
  [/KiwiSaver/, "New Zealand's retirement savings scheme. Your employer and the government can add money."],
  [/Stocks and Shares ISA/, "An investing account where growth is tax-free."],
  [/SIPP|pension|Pension/, "Retirement savings with tax relief."],
  [/RRSP/, "A retirement account. What you put in lowers your taxable income."],
  [/TFSA/, "An account where growth is tax-free."],
  [/Super/, "Australia's retirement savings, through your job."],
];
export const plainAccount = (name: string) => PLAIN.find(([re]) => re.test(name))?.[1] ?? null;

export type Rung = { title: string; why: string; state: "done" | "now" | "later"; accounts?: { name: string; plain: string | null }[] };

/** Where left-over money goes, in order. The first rung not done is "now". Account types only, never funds or shares. */
export function excessLadder(L: Pick<Ladder, "b" | "starter" | "full" | "carrying">, country: string | null | undefined, money: (n: number) => string): Rung[] {
  if (!L.b) return [];
  const cash = L.b.cash;
  const out: (Omit<Rung, "state"> & { done: boolean })[] = [];
  if (L.carrying) out.push({ title: "Pay off your credit cards", why: "Card interest usually costs more than saving or investing can earn.", done: false });
  out.push({ title: `Save ${money(L.starter!)} for surprises`, why: "A starter emergency fund, in a savings account. It stops one car repair turning into debt.", done: cash >= L.starter! });
  out.push({ title: `Grow that to ${money(L.full!)}`, why: "A full emergency fund: a few months of the things you can't skip.", done: cash >= L.full! });
  out.push({
    title: "Invest the rest",
    why: "Money you won't need for 5 years or more can grow in these accounts. Fill them in this order.",
    done: false,
    accounts: investOrder(country).map((name) => ({ name, plain: plainAccount(name) })),
  });
  const now = out.findIndex((r) => !r.done);
  return out.map(({ done, ...r }, i) => ({ ...r, state: done ? "done" : i === now ? "now" : "later" }));
}

/** Which step is open: 1 until there's a budget, 2 while a budget is over or nothing is left over, then 3. */
export const openStep = (hasBudget: boolean, overCount: number, spare: number | null): 1 | 2 | 3 =>
  !hasBudget ? 1 : overCount > 0 || spare === 0 ? 2 : 3;
