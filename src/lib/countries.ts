// Every country broke supports: currency, locale, which bank-data providers work there, and which local
// money features apply. The single source the onboarding, formatting, bank linking and Optimize pages read.
// No "@/" imports so tests run with plain node.

export type Provider = "plaid" | "akahu" | "enablebanking" | "basiq" | "belvo" | "csv";
// Which tax-advantaged account set Optimize shows (src/lib/invest.ts per-country modules).
export type TaxModule = "us" | "nz" | "au" | "uk" | "ca" | "in" | "ie" | "none";

export type Country = {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  locale: string; // BCP 47, for number and date formatting
  providers: Provider[]; // in the order the Add account screen offers them; "csv" always last
  tax: TaxModule;
  cards: boolean; // the Cards page (US card catalogue) applies
  regionLabel?: string; // what the profile calls a state/province/region, if it matters for tax
};

// Connectors are chosen from each vendor's public docs (lib/providers/feeds.ts). Countries left on csv: no connector built yet.
export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", currency: "USD", locale: "en-US", providers: ["plaid", "csv"], tax: "us", cards: true, regionLabel: "State" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA", providers: ["plaid", "csv"], tax: "ca", cards: false, regionLabel: "Province" },
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB", providers: ["enablebanking", "plaid", "csv"], tax: "uk", cards: false },
  { code: "IE", name: "Ireland", currency: "EUR", locale: "en-IE", providers: ["enablebanking", "plaid", "csv"], tax: "ie", cards: false },
  { code: "NZ", name: "New Zealand", currency: "NZD", locale: "en-NZ", providers: ["akahu", "csv"], tax: "nz", cards: false },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU", providers: ["basiq", "csv"], tax: "au", cards: false, regionLabel: "State" },
  { code: "IN", name: "India", currency: "INR", locale: "en-IN", providers: ["csv"], tax: "in", cards: false, regionLabel: "State" },
  { code: "DE", name: "Germany", currency: "EUR", locale: "de-DE", providers: ["enablebanking", "plaid", "csv"], tax: "none", cards: false },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-FR", providers: ["enablebanking", "plaid", "csv"], tax: "none", cards: false },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES", providers: ["enablebanking", "plaid", "csv"], tax: "none", cards: false },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT", providers: ["enablebanking", "plaid", "csv"], tax: "none", cards: false },
  { code: "NL", name: "Netherlands", currency: "EUR", locale: "nl-NL", providers: ["enablebanking", "plaid", "csv"], tax: "none", cards: false },
  { code: "SE", name: "Sweden", currency: "SEK", locale: "sv-SE", providers: ["enablebanking", "plaid", "csv"], tax: "none", cards: false },
  { code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG", providers: ["csv"], tax: "none", cards: false },
  { code: "ZA", name: "South Africa", currency: "ZAR", locale: "en-ZA", providers: ["csv"], tax: "none", cards: false },
  { code: "BR", name: "Brazil", currency: "BRL", locale: "pt-BR", providers: ["belvo", "csv"], tax: "none", cards: false },
  { code: "MX", name: "Mexico", currency: "MXN", locale: "es-MX", providers: ["csv"], tax: "none", cards: false },
  { code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP", providers: ["csv"], tax: "none", cards: false },
  { code: "PH", name: "Philippines", currency: "PHP", locale: "en-PH", providers: ["csv"], tax: "none", cards: false },
  { code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE", providers: ["csv"], tax: "none", cards: false },
];

// Anything not listed still works: its own currency guess is the caller's job; banks by CSV, no tax module.
export const OTHER: Country = { code: "XX", name: "Somewhere else", currency: "USD", locale: "en-US", providers: ["csv"], tax: "none", cards: false };

export const countryOf = (code?: string | null): Country => COUNTRIES.find((c) => c.code === code) ?? (code ? { ...OTHER, code } : COUNTRIES[0]);

// Time zones that name a listed country. First-run picker.
const TZ: Record<string, string> = {
  "Pacific/Auckland": "NZ", "Europe/London": "GB", "Europe/Dublin": "IE", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Europe/Berlin": "DE",
  "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Stockholm": "SE", "Asia/Singapore": "SG",
  "Africa/Johannesburg": "ZA", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "Asia/Tokyo": "JP", "Asia/Manila": "PH", "Asia/Dubai": "AE",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Halifax": "CA",
  // The US zones in the IANA database (zone1970.tab), plus Honolulu. "US/Eastern"-style aliases are handled in guessCountry.
  ...Object.fromEntries([
    "New_York", "Detroit", "Kentucky/Louisville", "Kentucky/Monticello", "Indiana/Indianapolis", "Indiana/Vincennes", "Indiana/Winamac",
    "Indiana/Marengo", "Indiana/Petersburg", "Indiana/Vevay", "Chicago", "Indiana/Tell_City", "Indiana/Knox", "Menominee",
    "North_Dakota/Center", "North_Dakota/New_Salem", "North_Dakota/Beulah", "Denver", "Boise", "Phoenix", "Los_Angeles", "Anchorage",
    "Juneau", "Sitka", "Metlakatla", "Yakutat", "Nome", "Adak", "Indianapolis", "Louisville", "Fort_Wayne",
  ].map((z) => [`America/${z}`, "US"])),
  "Pacific/Honolulu": "US",
};
// Best guess at the user's country: their time zone (plenty of people abroad keep "en-US"), else the region of
// their browser languages ("en-NZ"), else US.
export function guessCountry(languages: readonly string[], tz?: string) {
  const listed = (c?: string) => (c && COUNTRIES.some((x) => x.code === c) ? c : undefined);
  const byTz = listed(tz?.startsWith("Australia/") ? "AU" : tz?.startsWith("US/") ? "US" : TZ[tz ?? ""]);
  return byTz ?? languages.map((l) => listed(l.split(/[-_]/)[1]?.toUpperCase())).find(Boolean) ?? "US";
}

/** Akahu reads NZ banks: for people in NZ, and anyone else who says they also bank there (Settings, money profile). */
export const wantsAkahu = (p?: { country?: unknown; alsoBanksIn?: unknown } | null) =>
  countryOf(p?.country as string | undefined).code === "NZ" || (Array.isArray(p?.alsoBanksIn) && p.alsoBanksIn.includes("NZ"));
