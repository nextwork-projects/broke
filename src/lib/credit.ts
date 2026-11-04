// The user's credit range. Today the user picks it in the money profile; a credit data provider can fill the same
// shape later (score, model, asOf). Pure: no "@/" imports, so node can test it.
//
// Bands are the FICO Score 8 ranges as Experian publishes them, read 2026-10-23:
// https://www.experian.com/blogs/ask-experian/credit-education/score-basics/what-is-a-good-credit-score/
// Poor 300-579, Fair 580-669, Good 670-739, Very good 740-799, Exceptional 800-850.
// myFICO gives the same cut-offs: https://www.myfico.com/credit-education/what-is-a-fico-score (read 2026-10-23).
// "Excellent (740+)" here is Very good and Exceptional together.

export type Band = "excellent" | "good" | "fair" | "poor" | "none" | "unsure";
export const BANDS: { value: Band; label: string }[] = [
  { value: "excellent", label: "Excellent (740+)" },
  { value: "good", label: "Good (670-739)" },
  { value: "fair", label: "Fair (580-669)" },
  { value: "poor", label: "Poor (under 580)" },
  { value: "none", label: "No credit history yet" },
  { value: "unsure", label: "Not sure" },
];
export const bandLabel = (b?: string | null) => BANDS.find((x) => x.value === b)?.label;

// source is "self" until a provider is connected; add its id to the union then.
export type CreditInfo = { band: Band; score?: number; model?: string; source: "self"; asOf?: string /* YYYY-MM */ };

// profile.credit is a Band, profile.creditAsOf the "Last checked" month. Anything else reads as not set.
export function creditOf(p: Record<string, unknown> | undefined | null): CreditInfo | null {
  const band = BANDS.find((x) => x.value === p?.credit)?.value;
  if (!band) return null;
  const asOf = typeof p?.creditAsOf === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.creditAsOf) ? p.creditAsOf : undefined;
  return { band, source: "self", ...(asOf ? { asOf } : {}) };
}

// "2026-09" -> "September 2026".
export const monthText = (ym: string) => new Date(ym + "-01T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
