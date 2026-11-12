import "server-only";
import type { CountryCode } from "plaid";
import { countryOf, type Provider } from "@/lib/countries";
import { isPlaceholder } from "@/lib/envfile";
import { PLAID_COUNTRIES } from "@/lib/plaid";
import type { Tokens } from "@/lib/providers/akahu";
import { FEEDS, isFeed, type FeedId } from "@/lib/providers/feeds";

// Which bank providers this server has keys for. CSV import needs none.
// GoCardless Bank Account Data: not built. Actual Budget's docs (read 2026-10-22,
// https://actualbudget.org/docs/advanced/bank-sync/gocardless/) say GoCardless stopped taking new accounts in July 2025,
// so UK and EU fall back to Plaid (where it covers the country) and CSV.
export const akahuTokens = (env: Record<string, string | undefined> = process.env): Tokens | null =>
  !isPlaceholder(env.AKAHU_APP_TOKEN) && !isPlaceholder(env.AKAHU_USER_TOKEN) ? { app: env.AKAHU_APP_TOKEN!, user: env.AKAHU_USER_TOKEN! } : null;
const plaidKeys = () => !isPlaceholder(process.env.PLAID_CLIENT_ID) && !isPlaceholder(process.env.PLAID_SECRET);

export const configured = (p: Provider) => p === "csv" || (p === "plaid" ? plaidKeys() : p === "akahu" ? !!akahuTokens() : isFeed(p) && FEEDS[p].envKeys.every((k) => !isPlaceholder(process.env[k])));

/** The Add account options for a country, in its order, only those this server can run. CSV is always there. */
export const addOptions = (country?: string | null) => countryOf(country).providers.filter(configured);

// Plaid Link's country_codes enum, from https://plaid.com/docs/api/link/ (read 2026-10-22).
const PLAID_LINK = ["US", "GB", "ES", "NL", "FR", "IE", "CA", "DE", "IT", "PL", "DK", "NO", "SE", "EE", "LT", "LV", "PT", "BE", "AT", "FI"];
/** Link shows the user's own country's banks when Plaid covers it, else the server's PLAID_COUNTRY_CODES. */
export const plaidCountries = (country?: string | null): CountryCode[] =>
  country && PLAID_LINK.includes(country) ? [country as CountryCode] : PLAID_COUNTRIES;

/** What the Add accounts screen (and the empty state) offers this user. Statement import and manual accounts need no keys. */
export function addChoices(country?: string | null, alsoNz = false) {
  const code = countryOf(country).code;
  const options = addOptions(code);
  const plaid = options.includes("plaid");
  return {
    bank: plaid ? ("plaid" as const) : options.includes("akahu") ? ("akahu" as const) : null,
    // Hosted-consent connections this server has keys for. Offered first: they reach more of the country's banks.
    feeds: options.filter((p): p is FeedId => isFeed(p)),
    investments: plaid && code === "US",
    sandbox: plaid && process.env.PLAID_ENV === "sandbox",
    // No Plaid keys at all: a made-up bank instead (api/demo-bank), so broke can be tried with only a database.
    demo: !configured("plaid"),
    // The country has Plaid banks but this copy has no Plaid keys yet: offer the bank card anyway, pointing at Setup.
    plaidMissing: countryOf(code).providers.includes("plaid") && !configured("plaid"),
    // NZ without Akahu keys: say where to add them.
    akahuMissing: (countryOf(code).providers.includes("akahu") || alsoNz) && !configured("akahu"),
    // Lives elsewhere but also banks in NZ (Settings, money profile): the NZ option beside their own.
    alsoAkahu: alsoNz && code !== "NZ" && configured("akahu"),
  };
}
export type AddChoices = ReturnType<typeof addChoices>;
