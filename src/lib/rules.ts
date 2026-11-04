// Transaction rules. Pure, no "@/" imports, so rules.test.ts runs with plain node.
export type Rule = {
  id: string; match: string; amount_min: number | null; amount_max: number | null;
  account_id?: string | null; day_from?: number | null; day_to?: number | null; // migration 0020
  direction?: "in" | "out" | null; // migration 0026
  category_id: string | null; rename: string | null; ignore: boolean | null; add_tags: string[] | null;
};
/** The columns every rules query selects. */
export const RULE_COLS = "id, match, amount_min, amount_max, account_id, day_from, day_to, direction, category_id, rename, ignore, add_tags";
type T = { name: string; merchant_name?: string | null; amount: number; account_id?: string | null; date?: string | null };
type Find = Pick<Rule, "match" | "amount_min" | "amount_max" | "account_id" | "day_from" | "day_to" | "direction">;
export type RulePatch = { category_id?: string; custom_name?: string; ignored?: boolean; tags?: string[] };

/** Tags are trimmed, lowercase-insensitive unique, in first-seen order. */
export const mergeTags = (...lists: (string[] | null | undefined)[]) => {
  const out: string[] = [];
  for (const t of lists.flat()) {
    const v = t?.trim();
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
};

/** A rule with nothing to find by matches nothing (never every transaction). */
export const findsSomething = (r: Find) =>
  !!r.match?.trim() || r.amount_min != null || r.amount_max != null || !!r.account_id || r.day_from != null || r.day_to != null || !!r.direction;

/** Day of the month in [from, to], both inclusive. One side missing: that day only. from > to wraps (28 to 3). */
export function inDays(day: number, from?: number | null, to?: number | null) {
  const a = from ?? to, b = to ?? from;
  if (a == null || b == null) return true;
  return a <= b ? day >= a && day <= b : day >= a || day <= b;
}

/** Every condition set must hold. Name: case-insensitive "contains" on merchant + name. Amount: compared as a
 * positive number (spent or received). Direction: money in is a negative amount. Account: that account only.
 * Day: the day of the month of t.date. */
export function matches(r: Find, t: T) {
  if (!findsSomething(r)) return false;
  const m = (r.match ?? "").trim().toLowerCase();
  const a = Math.abs(Number(t.amount));
  const days = r.day_from != null || r.day_to != null;
  return (!m || `${t.merchant_name ?? ""} ${t.name}`.toLowerCase().includes(m))
    && (r.amount_min == null || a >= Number(r.amount_min))
    && (r.amount_max == null || a <= Number(r.amount_max))
    && (!r.direction || (r.direction === "in" ? Number(t.amount) < 0 : Number(t.amount) > 0))
    && (!r.account_id || t.account_id === r.account_id)
    && (!days || (!!t.date && inDays(Number(t.date.slice(8, 10)), r.day_from, r.day_to)));
}

/** What the rules change on one transaction. Rules come newest first; the first rule to set a field wins. Tags add up. */
export function applyRules(rules: Rule[], t: T): RulePatch {
  const p: RulePatch = {};
  for (const r of rules) {
    if (!matches(r, t)) continue;
    if (r.category_id && p.category_id === undefined) p.category_id = r.category_id;
    if (r.rename && p.custom_name === undefined) p.custom_name = r.rename;
    if (r.ignore != null && p.ignored === undefined) p.ignored = r.ignore;
    if (r.add_tags?.length) p.tags = mergeTags(p.tags, r.add_tags);
  }
  return p;
}

/** The rule's conditions as label + value, for the rules list: [{ label: "Name contains", value: "uber" }, ...].
 * money: the user's format, US dollars by default. account: the account's display name. */
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const nth = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
export function conditions(r: Find, money: (n: number) => string = usd, account?: string) {
  const $ = (n: number) => money(Number(n));
  const out: { label: string; value: string }[] = [];
  if (r.match?.trim()) out.push({ label: "Name contains", value: r.match.trim() });
  if (r.amount_min != null && r.amount_max != null)
    out.push(r.amount_min === r.amount_max ? { label: "Amount is", value: $(r.amount_min) } : { label: "Amount from", value: `${$(r.amount_min)} to ${$(r.amount_max)}` });
  else if (r.amount_min != null) out.push({ label: "Amount is at least", value: $(r.amount_min) });
  else if (r.amount_max != null) out.push({ label: "Amount is up to", value: $(r.amount_max) });
  if (r.direction) out.push({ label: "Money", value: r.direction === "in" ? "coming in" : "going out" });
  if (r.account_id) out.push({ label: "Account is", value: account ?? "a removed account" });
  const a = r.day_from ?? r.day_to, b = r.day_to ?? r.day_from;
  if (a != null && b != null) out.push({ label: "On the", value: a === b ? `${nth(a)} of the month` : `${nth(a)} to ${nth(b)} of the month` });
  return out;
}

/** One line: 'Name contains "uber", amount from $10 to $40'. */
export const describeMatch = (r: Find, money?: (n: number) => string, account?: string) =>
  conditions(r, money, account).map((c, i) => `${i ? c.label[0].toLowerCase() + c.label.slice(1) : c.label} ${c.label === "Name contains" ? `"${c.value}"` : c.value}`).join(", ");

export type ProposedRule = { match: string; direction: "in" | "out" | null; category_id: string; category: string };
/** Rules the AI proposed (```rules block), checked against the user's categories. Needs a name of 2+ letters to find by, so a
 * rule can never sweep up every transaction, and a category that exists. Anything else is dropped. Nothing here saves. */
export function validRules(proposed: unknown, cats: { id: string; label: string }[]): ProposedRule[] {
  if (!Array.isArray(proposed)) return [];
  const out: ProposedRule[] = [];
  for (const p of proposed.slice(0, 20)) {
    const match = typeof p?.match === "string" ? p.match.trim().slice(0, 80) : "";
    const c = cats.find((x) => typeof p?.category === "string" && x.label.toLowerCase() === p.category.trim().toLowerCase());
    if (match.length < 2 || !c) continue;
    const direction = p.direction === "in" || p.direction === "out" ? p.direction : null;
    if (!out.some((r) => r.match.toLowerCase() === match.toLowerCase() && r.direction === direction)) out.push({ match, direction, category_id: c.id, category: c.label });
  }
  return out;
}
