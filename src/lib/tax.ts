// US federal tax figures for tax year 2026. No "@/" imports, so plan.test.ts runs it with plain node.
// Every number was checked on irs.gov on 2026-10-22; the source is next to each one.
// ponytail: one tax year only. plan-facts skips tax moves in any other year; add the next year's table when the IRS publishes it.
export const TAX_YEAR = 2026;

export type Filing = "single" | "mfj" | "mfs" | "hoh";
export const FILING: Record<string, Filing> = { Single: "single", "Married filing jointly": "mfj", "Married filing separately": "mfs", "Head of household": "hoh" };

// Lower bound of each bracket, on taxable income. Rev. Proc. 2025-32 section 4.01, tables 1-4.
// https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (checked 2026-10-22)
export const BRACKETS: Record<Filing, [number, number][]> = {
  mfj: [[0, 0.1], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]],
  hoh: [[0, 0.1], [17700, 0.12], [67450, 0.22], [105700, 0.24], [201750, 0.32], [256200, 0.35], [640600, 0.37]],
  single: [[0, 0.1], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]],
  mfs: [[0, 0.1], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [384350, 0.37]],
};
// Rev. Proc. 2025-32 section 4.14. https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (checked 2026-10-22)
export const STANDARD_DEDUCTION: Record<Filing, number> = { mfj: 32200, hoh: 24150, single: 16100, mfs: 16100 };

// Roth IRA and deductible traditional IRA (if a workplace plan covers you) income phase-outs.
// IR-2025-111, https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500 (checked 2026-10-22)
// The release names single filers for the traditional range; Pub 590-A treats head of household the same way.
export const ROTH_PHASE: Record<Filing, [number, number]> = { single: [153000, 168000], hoh: [153000, 168000], mfj: [242000, 252000], mfs: [0, 10000] };
export const TRAD_COVERED_PHASE: Record<Filing, [number, number]> = { single: [81000, 91000], hoh: [81000, 91000], mfj: [129000, 149000], mfs: [0, 10000] };
// IRA money for 2026 can go in until the 2026 return is due, not counting extensions (Pub 590-A,
// https://www.irs.gov/publications/p590a, checked 2026-10-22). Same date as the filing deadline below.
export const RETURN_DUE = "2027-04-15";

// Estimated tax due dates for 2026. Pub 505 (2026), https://www.irs.gov/publications/p505 (checked 2026-10-22)
export const ESTIMATED_DUE = ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"];
// Safe harbor: no underpayment penalty if you paid 90% of this year's tax or 100% of last year's,
// 110% if last year's AGI was over $150,000. Topic 306, https://www.irs.gov/taxtopics/tc306, and Pub 505 (checked 2026-10-22)
export const SAFE_HARBOR = { current: 90, prior: 100, priorHigh: 110, highAgi: 150000 };
// Self-employment tax rate. https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes (checked 2026-10-22)
export const SE_TAX = 0.153;

// Net capital loss that offsets other income a year. Topic 409, https://www.irs.gov/taxtopics/tc409 (checked 2026-10-22)
export const CAPITAL_LOSS_LIMIT: Record<Filing, number> = { single: 3000, hoh: 3000, mfj: 3000, mfs: 1500 };
// Student loan interest: up to $2,500, no itemizing needed. Topic 456, https://www.irs.gov/taxtopics/tc456;
// 2026 phase-out from Rev. Proc. 2025-32 section 4.29 (checked 2026-10-22)
export const STUDENT_LOAN_CAP = 2500;
export const STUDENT_LOAN_PHASE = { other: [85000, 100000], mfj: [175000, 205000] } as const;
// Cash gifts to charity deductible without itemizing, from 2026. Topic 506, https://www.irs.gov/taxtopics/tc506 (checked 2026-10-22)
export const CHARITY_NONITEMIZER: Record<Filing, number> = { single: 1000, hoh: 1000, mfs: 1000, mfj: 2000 };
// Dependent care FSA exclusion from 2026. https://www.irs.gov/forms-pubs/correction-to-the-dependent-care-benefits-exclusion-amount-in-the-2026-general-instructions-for-forms-w-2-and-w-3
// (checked 2026-10-22). That page gives no married-filing-separately figure, so that status gets no move.
export const DEPENDENT_CARE_CAP = 7500;

// Pages the plan may link to. Each one opened on 2026-10-22.
export const IRS = {
  estimator: "https://www.irs.gov/individuals/tax-withholding-estimator",
  w4: "https://www.irs.gov/forms-pubs/about-form-w-4",
  es: "https://www.irs.gov/forms-pubs/about-form-1040-es",
  directPay: "https://www.irs.gov/payments/direct-pay",
  p505: "https://www.irs.gov/publications/p505",
  p550: "https://www.irs.gov/publications/p550",
  p590a: "https://www.irs.gov/publications/p590a",
  tc409: "https://www.irs.gov/taxtopics/tc409",
  tc456: "https://www.irs.gov/taxtopics/tc456",
  tc506: "https://www.irs.gov/taxtopics/tc506",
};

// The profile's household income bands, as [low, high] dollars.
export const INCOME_BANDS: Record<string, [number, number]> = {
  "Under $50k": [0, 50000], "$50k-$100k": [50000, 100000], "$100k-$200k": [100000, 200000], "$200k-$400k": [200000, 400000], "Over $400k": [400000, Infinity],
};

export const bracketFor = (filing: Filing, taxable: number) => BRACKETS[filing].filter(([low]) => taxable >= low).at(-1)![1];

// The federal rate on the user's top dollar, from the low end of their income band less the standard deduction.
// Missing filing or income: the lowest bracket, flagged as a guess.
export const DEFAULT_RATE = 0.1;
export function marginalRate(p: { filing?: string; income?: string }) {
  const filing = FILING[p.filing ?? ""] ?? null, band = INCOME_BANDS[p.income ?? ""] ?? null;
  if (!filing || !band) return { rate: DEFAULT_RATE, filing, band, guessed: true, note: `Counted at ${DEFAULT_RATE * 100}%, the lowest federal bracket. Add your income in your profile for a closer number.` };
  const rate = bracketFor(filing, Math.max(0, band[0] - STANDARD_DEDUCTION[filing]));
  return { rate, filing, band, guessed: false, note: `Your ${pct(rate)} federal bracket comes from the low end of your income band, less the standard deduction.` };
}

// "2027-04-15" -> "April 15, 2027". US moves only, so US style.
export const usDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
export const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
