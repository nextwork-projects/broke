// The first result after onboarding: one true fact from the user's own data, the most important that holds.
// Pure, no "@/" imports, so `node src/lib/first-fact.test.ts` runs it. /api/onboarding gathers the inputs.

export type FactInput = {
  typical: { income: number; spend: number } | null; // typicalMonth (insights.ts)
  interest90: number; // card or loan interest charged in the last 90 days
  subs: { monthly: number }[]; // active recurring charges that aren't bills
  top: { id: string; label: string; month: string; spent: number; typical: number | null } | null; // biggest category in the last full month
};
export type Fact = { kind: "overspend" | "interest" | "subscriptions" | "category"; headline: string; detail: string; cta: { label: string; href: string } };

// The same bar the plan uses for "spends more than comes in" (plan.ts typicalOver).
export const OVERSPEND_MIN = 100;

/** In order: spending over income, card interest a year, subscriptions a year, the biggest category. Null when none holds. */
export function firstFact(f: FactInput, money: (n: number) => string): Fact | null {
  const t = f.typical;
  if (t && t.income > 0 && t.spend - t.income >= OVERSPEND_MIN)
    return {
      kind: "overspend",
      headline: `You spend ${money(t.spend - t.income)} a month more than you earn`,
      detail: `In a typical month ${money(t.spend)} goes out and ${money(t.income)} comes in.`,
      cta: { label: "See your plan", href: "/plan" },
    };
  if (f.interest90 >= 1)
    return {
      kind: "interest",
      headline: `You pay about ${money((f.interest90 * 365) / 90)} a year in card interest`,
      detail: `You paid ${money(f.interest90)} in the last 90 days.`,
      cta: { label: "Plan to pay it off", href: "/plan" },
    };
  const monthly = f.subs.reduce((s, x) => s + x.monthly, 0);
  if (f.subs.length && monthly >= 1)
    return {
      kind: "subscriptions",
      headline: `Your ${f.subs.length === 1 ? "subscription costs" : `${f.subs.length} subscriptions cost`} ${money(monthly * 12)} a year`,
      detail: `That is ${money(monthly)} a month.`,
      cta: { label: "Review subscriptions", href: "/recurring" },
    };
  const c = f.top;
  if (c && c.spent >= 1)
    return {
      kind: "category",
      headline: `You spent ${money(c.spent)} on ${c.label.toLowerCase()} in ${c.month}`,
      detail: c.typical != null && c.typical >= 1 ? `Your typical month is ${money(c.typical)}.` : `It was your biggest category that month.`,
      cta: { label: `See ${c.label.toLowerCase()}`, href: `/transactions?category=${c.id}` },
    };
  return null;
}
