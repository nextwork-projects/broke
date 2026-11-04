// Contribution limits and fund fees. No "@/" imports, so invest.test.ts runs with plain node.
import type { SupabaseClient } from "@supabase/supabase-js";

// IRS limits by tax year. Sources: 2026 IRS Notice 2025-67 (401(k), IRA) and Rev. Proc. 2025-19 (HSA);
// 2025 IRS Notice 2024-80 and Rev. Proc. 2024-25. HSA catch-up ($1,000 at 55+) is fixed by law.
// ponytail: the 60-63 "super catch-up" for 401(k) is left out, the profile's "60+" can't tell 60-63 from 64+.
export const LIMITS: Record<number, { k401: number; k401CatchUp: number; ira: number; iraCatchUp: number; hsaSelf: number; hsaFamily: number; hsaCatchUp: number }> = {
  2025: { k401: 23500, k401CatchUp: 7500, ira: 7000, iraCatchUp: 1000, hsaSelf: 4300, hsaFamily: 8550, hsaCatchUp: 1000 },
  2026: { k401: 24500, k401CatchUp: 8000, ira: 7500, iraCatchUp: 1100, hsaSelf: 4400, hsaFamily: 8750, hsaCatchUp: 1000 },
};

export type Kind = "hsa" | "k401" | "ira";
// Plaid account subtype -> limit bucket. 403(b) and 401(k) share one limit.
// ponytail: 457(b) actually has its own separate limit of the same size; split it out if anyone holds both.
export const KIND: Record<string, Kind> = { hsa: "hsa", "401k": "k401", "403b": "k401", "457b": "k401", "roth 401k": "k401", ira: "ira", roth: "ira" };
export const KIND_LABEL: Record<Kind, string> = { hsa: "HSA", k401: "401(k)", ira: "IRA" };

// Money moved into the account. Plaid amounts: negative = cash credited to the account.
// ponytail: a 401(k) employer match also shows as a contribution and only your own money counts toward the limit; split when Plaid tags it.
export const isContribution = (t: { type: string | null; subtype: string | null; amount: number }) =>
  t.subtype === "contribution" || t.subtype === "deposit" || (t.type === "transfer" && t.amount < 0);

type Profile = { age?: string; dependents?: string; health?: string; hsaCover?: string };
// Limit for one bucket plus how it was worked out. Ages come as ranges ("50-59", "60+").
export function limitFor(kind: Kind, year: number, p: Profile = {}) {
  const L = LIMITS[year] ?? LIMITS[Math.max(...Object.keys(LIMITS).map(Number))];
  const over50 = p.age === "50-59" || p.age === "60+";
  if (kind === "k401") return { limit: L.k401 + (over50 ? L.k401CatchUp : 0), note: over50 ? "includes the 50+ catch-up" : "" };
  if (kind === "ira") return { limit: L.ira + (over50 ? L.iraCatchUp : 0), note: over50 ? "includes the 50+ catch-up" : "" };
  // Who the plan covers, when the profile says; otherwise kids on the plan almost always means family coverage.
  const told = p.hsaCover === "Me and family" ? true : p.hsaCover === "Just me" ? false : null;
  const family = told ?? (!!p.dependents && p.dependents !== "0");
  const over55 = p.age === "60+";
  const limit = (family ? L.hsaFamily : L.hsaSelf) + (over55 ? L.hsaCatchUp : 0);
  const note = [
    family ? "family plan" : `self-only plan${told == null ? `, family is $${L.hsaFamily.toLocaleString("en-US")}` : ""}`,
    over55 ? "includes the 55+ catch-up" : p.age === "50-59" ? `add $${L.hsaCatchUp.toLocaleString("en-US")} if you're 55 or older` : "",
  ].filter(Boolean).join(", ");
  return { limit, note };
}

// IRA and HSA money for a tax year can go in until April 15 of the next year; 401(k) only through payroll by Dec 31.
export const deadline = (kind: Kind, year: number) => (kind === "k401" ? `Dec 31, ${year}` : `April 15, ${year + 1}`);

// Local tax-advantaged accounts outside the US. Figures checked on each government's site on 2026-10-22:
// NZ ird.govt.nz/kiwisaver-changes and .../getting-the-kiwisaver-government-contribution
// AU ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds (contributions caps, super guarantee)
// UK gov.uk/individual-savings-accounts, gov.uk/lifetime-isa, gov.uk/tax-on-your-private-pension/annual-allowance
// CA canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html
// IN nsiindia.gov.in (PPF), incometaxindia.gov.in/w/deductions-allowable-to-tax-payer (80C, 80CCD(1B), new regime)
// IE revenue.ie/en/jobs-and-pensions/pension/relief/tax-relief-limits.aspx
// ponytail: one year's figures each; update the table when the next tax year starts.
type Local = {
  kind: string; label: string;
  start: [number, number]; // month and day the year starts
  limit: (p: Profile) => { limit: number | null; note: string };
  match: RegExp; // account subtype or name
  goal?: true; // a target to reach (KiwiSaver), not a cap to stay under
  deadline?: (end: Date) => Date; // default: the last day of the year
};
const fixed = (limit: number, note = "") => () => ({ limit, note });
// Ireland's relief limit is a share of earnings by age. The profile's "50-59" spans two bands.
const IE_PCT: Record<string, string> = { "Under 30": "15%", "30-39": "20%", "40-49": "25%", "50-59": "30% (35% from 55)", "60+": "40%" };
export const LOCAL: Record<string, Local[]> = {
  nz: [{ kind: "kiwisaver", label: "KiwiSaver", start: [7, 1], match: /kiwi\s?saver/i, goal: true,
    limit: fixed(1042.86, "Put in $1,042.86 of your own money by 30 June to get the full $260.72 government contribution (25c per $1). Employer money doesn't count. Ages 16-65, taxable income $180,000 or less") }],
  au: [{ kind: "super", label: "Super (before-tax)", start: [7, 1], match: /super|smsf/i,
    limit: fixed(32500, "Concessional cap. Your employer's 12% super guarantee counts toward it. The after-tax cap is $130,000") }],
  uk: [
    { kind: "isa", label: "ISA", start: [4, 6], match: /\bisa\b/i, limit: fixed(20000, "Across all your ISAs. A Lifetime ISA takes up to £4,000 of it") },
    { kind: "pension", label: "Pension", start: [4, 6], match: /pension|sipp/i,
      limit: fixed(60000, "Annual allowance, including your employer's money. Tax relief only on up to 100% of your earnings") },
  ],
  ca: [
    { kind: "rrsp", label: "RRSP", start: [1, 1], match: /rrsp/i, deadline: (end) => new Date(Date.UTC(end.getUTCFullYear() + 1, 0, 60)),
      limit: fixed(33810, "Or 18% of last year's earned income if that's less. Your notice of assessment shows your exact room, including unused room") },
    { kind: "tfsa", label: "TFSA", start: [1, 1], match: /tfsa/i, limit: fixed(7000, "This year's new room. Unused room from past years carries forward") },
  ],
  in: [
    { kind: "ppf", label: "PPF", start: [4, 1], match: /\bppf\b|provident/i, limit: fixed(150000, "Counts toward the ₹1,50,000 section 80C deduction, old tax regime only") },
    { kind: "nps", label: "NPS extra", start: [4, 1], match: /\bnps\b|national pension/i,
      limit: fixed(50000, "Section 80CCD(1B), on top of 80C. Old tax regime only; the new regime allows only your employer's share") },
  ],
  ie: [{ kind: "pension", label: "Pension", start: [1, 1], match: /pension|prsa|\bavc\b/i,
    limit: (p) => ({ limit: null, note: `Tax relief on up to ${IE_PCT[p.age ?? ""] ?? "15-40%, by age,"} of your earnings, counting earnings up to €115,000` }) }],
};

// The tax year holding `today` (YYYY-MM-DD) for a year that starts on `start`.
export function taxYear([m, d]: [number, number], today: string) {
  const [y, tm, td] = today.split("-").map(Number);
  const s = tm > m || (tm === m && td >= d) ? y : y - 1;
  const from = new Date(Date.UTC(s, m - 1, d)), to = new Date(Date.UTC(s + 1, m - 1, d - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), end: to, label: m === 1 && d === 1 ? `${s}` : `${s}-${String(s + 1).slice(2)}` };
}

export type Room = { kind: string; label: string; goal?: boolean; year: string; contributed: number | null; from: "linked" | "you" | null; limit: number | null; left: number | null; deadline: string; due: string; note: string };
const day = (d: Date, locale: string) => d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// One row per local account type. `linked` = contributions from matching linked accounts; `mine` = what the user typed in, keyed "kind:year".
export function localRoom(tax: string, today: string, p: Profile, linked: Record<string, number>, mine: Record<string, number> = {}, locale = "en-US"): Room[] {
  return (LOCAL[tax] ?? []).map((b) => {
    const y = taxYear(b.start, today);
    const typed = mine[`${b.kind}:${y.label}`];
    const contributed = b.kind in linked ? linked[b.kind] : typed ?? null;
    const { limit, note } = b.limit(p);
    const end = b.deadline?.(y.end) ?? y.end;
    return { kind: b.kind, label: b.label, goal: b.goal, year: y.label, contributed, from: b.kind in linked ? "linked" : typed != null ? "you" : null, limit,
      left: limit != null && contributed != null ? limit - contributed : null, deadline: day(end, locale), due: end.toISOString().slice(0, 10), note };
  });
}

type Acc = { subtype: string | null; name: string; investment_transactions: { type: string | null; subtype: string | null; amount: number; date: string }[] };
const put = (a: Acc, from = "", to = "9999") => a.investment_transactions.filter((t) => t.date >= from && t.date <= to && isContribution(t)).reduce((s, t) => s - Number(t.amount), 0);

// Contributions per bucket against its limit. US: this calendar year, only buckets with a linked account.
// Elsewhere: every local account type, from linked accounts when one matches, else what the user typed in.
// ponytail: US counts by calendar year, so Jan 1 to Apr 15 deposits marked for last year land in this year. Plaid doesn't say which year they're for.
export async function contributionRoom(supabase: SupabaseClient, profile: Profile & { country?: string } = {}, opts: { tax?: string; today?: string; locale?: string; mine?: Record<string, number> } = {}): Promise<Room[]> {
  const tax = opts.tax ?? "us", today = opts.today ?? new Date().toISOString().slice(0, 10);
  if (tax !== "us" && !LOCAL[tax]) return [];
  const from = tax === "us" ? `${today.slice(0, 4)}-01-01` : LOCAL[tax].map((b) => taxYear(b.start, today).from).sort()[0];
  const { data } = await supabase
    .from("accounts")
    .select("subtype, name, investment_transactions(type, subtype, amount, date)")
    .eq("type", "investment")
    .is("owner_label", null) // own accounts only; a partner's shared 401(k) is not the viewer's room
    .gte("investment_transactions.date", from);
  const accts = (data ?? []) as Acc[];
  if (tax !== "us") {
    const linked: Record<string, number> = {};
    for (const b of LOCAL[tax]) {
      const y = taxYear(b.start, today);
      const hits = accts.filter((a) => b.match.test(`${a.subtype ?? ""} ${a.name}`));
      if (hits.some((a) => a.investment_transactions.length)) linked[b.kind] = hits.reduce((s, a) => s + put(a, y.from, y.to), 0);
    }
    return localRoom(tax, today, profile, linked, opts.mine, opts.locale);
  }
  const year = Number(today.slice(0, 4));
  const sums: Partial<Record<Kind, number>> = {};
  for (const a of accts) {
    const kind = KIND[a.subtype ?? ""];
    if (kind) sums[kind] = (sums[kind] ?? 0) + put(a, `${year}-01-01`, `${year}-12-31`);
  }
  // The HSA follows the health plan: an eligible plan with no linked HSA still has room (what they typed in, else
  // assumed $0 so far); a plan that isn't eligible has none, linked account or not.
  const health = profile.health ?? "";
  const hdhp = health.startsWith("High-deductible");
  const typedHsa = opts.mine?.[`hsa:${year}`];
  const kinds = (Object.keys(sums) as Kind[]).filter((k) => k !== "hsa" || !health || hdhp || health === "Not sure");
  if (hdhp && !kinds.includes("hsa")) kinds.push("hsa");
  return kinds.map((kind) => {
    const { limit, note } = limitFor(kind, year, profile);
    const linked = kind in sums, contributed = linked ? sums[kind]! : typedHsa ?? 0;
    const why = linked ? note : [note, typedHsa != null ? "from what you typed in" : "no HSA linked, so assumes nothing put in yet"].filter(Boolean).join(", ");
    return { kind, label: KIND_LABEL[kind], year: `${year}`, contributed, from: linked ? "linked" : typedHsa != null ? "you" : null, limit, left: limit - contributed, deadline: deadline(kind, year), due: kind === "k401" ? `${year}-12-31` : `${year + 1}-04-15`, note: why };
  });
}

// Expense ratios in percent, from each fund's own fact sheet (2025).
export const EXPENSE_RATIO: Record<string, number> = {
  VTI: 0.03, VOO: 0.03, VTSAX: 0.04, VFIAX: 0.04, VXUS: 0.05, VTIAX: 0.09, VEA: 0.03, VWO: 0.07, BND: 0.03, VBTLX: 0.04,
  VUG: 0.04, VTV: 0.04, VIG: 0.05, VNQ: 0.13,
  FXAIX: 0.015, FSKAX: 0.015, FZROX: 0, FZILX: 0, FXNAX: 0.025,
  SWPPX: 0.02, SCHB: 0.03, SCHX: 0.03, SCHD: 0.06,
  SPY: 0.0945, IVV: 0.03, ITOT: 0.03, AGG: 0.03, QQQ: 0.2, DIA: 0.16, IWM: 0.19,
  // Vanguard Target Retirement (Investor shares).
  VTTVX: 0.08, VTHRX: 0.08, VTTHX: 0.08, VFORX: 0.08, VTIVX: 0.08, VFIFX: 0.08, VFFVX: 0.08, VTTSX: 0.08, VLXVX: 0.08,
};

export const INDEX_RATIO = 0.03;
// Extra fees over 30 years versus a 0.03% index fund, on the value held today, at 7% growth before fees.
export function feeCost30(value: number, ratio: number, years = 30, growth = 0.07) {
  const grow = (r: number) => value * (1 + growth - r / 100) ** years;
  return Math.max(0, grow(INDEX_RATIO) - grow(ratio));
}
