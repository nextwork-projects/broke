import { countryOf } from "./countries.ts";

// How money and dates print: the user's home currency and their country's locale. Server pages get it per
// request (setFmtScope in data.ts), client components from useMoney (components/Money.tsx). Default: US dollars.
// tz: the user's time zone (tz cookie). Only timestamps use it; unset means the runtime's own zone (the browser's on the client).
export type Fmt = { currency: string; locale: string; tz?: string };
export const US_FMT: Fmt = { currency: "USD", locale: "en-US" };
let scope = () => US_FMT;
export const setFmtScope = (get: () => Fmt) => void (scope = get);
export const homeCurrency = () => scope().currency;
// Home currency: the profile's own pick (countries not listed), else the country's.
export const fmtFor = (p?: { country?: string; currency?: string } | null): Fmt => {
  const c = countryOf(p?.country);
  return { currency: p?.currency || c.currency, locale: c.locale };
};

const cache = new Map<string, Intl.NumberFormat>();
const nf = (f: Fmt, cur: string, digits?: number) => {
  const key = `${f.locale}|${cur}|${digits}`;
  let x = cache.get(key);
  if (!x) cache.set(key, (x = new Intl.NumberFormat(f.locale, { style: "currency", currency: cur, ...(digits === 0 && { minimumFractionDigits: 0, maximumFractionDigits: 0 }) })));
  return x;
};

// cur: the amount's own currency (an account's or a transaction's); null means the home currency.
// "|| 0" turns -0 into 0, so a zero total never prints as -$0.00.
export const money = (n: number | null | undefined, cur?: string | null, f = scope()) => nf(f, cur || f.currency).format(n || 0);
export const money0 = (n: number | null | undefined, cur?: string | null, f = scope()) => nf(f, cur || f.currency, 0).format(Math.round(n || 0) || 0);

// Plaid sign: positive = money out. Shown as plain amount; money in gets a "+".
export const signed = (amount: number, cur?: string | null, f = scope()) => (amount < 0 ? `+${money(-amount, cur, f)}` : money(amount, cur, f));

// What the user typed ("12,50" in Germany, "$1,200.00" in the US) as a number, NaN when it isn't one.
export const parseAmount = (s: string, f = scope()) => {
  const dec = new Intl.NumberFormat(f.locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
  const clean = s.replace(new RegExp(`[^0-9${dec === "." ? "\\." : dec}-]`, "g"), "");
  return clean ? Number(clean.replace(dec, ".")) : NaN;
};

// A date in the user's locale. Calendar days ("YYYY-MM-DD" and UTC-midnight Dates) format in UTC.
// A timestamp string (created_at) is a moment, so it formats in the user's time zone: 23:30 UTC is still yesterday in Chicago.
export const dateLabel = (d: Date | string, opts: Intl.DateTimeFormatOptions, f = scope()) => {
  const moment = typeof d === "string" && d.length > 10;
  const timeZone = moment ? (f.tz && tzOk(f.tz) ? f.tz : undefined) : "UTC";
  return (typeof d === "string" ? new Date(moment ? d : d + "T00:00:00Z") : d).toLocaleDateString(f.locale, { timeZone, ...opts });
};

// Everything above bound to one Fmt, for client components (useMoney) and code that runs outside a page render.
export const fmtWith = (f: Fmt) => ({
  ...f,
  money: (n: number | null | undefined, cur?: string | null) => money(n, cur, f),
  money0: (n: number | null | undefined, cur?: string | null) => money0(n, cur, f),
  signed: (n: number, cur?: string | null) => signed(n, cur, f),
  dateLabel: (d: Date | string, opts: Intl.DateTimeFormatOptions) => dateLabel(d, opts, f),
  monthLabel: (d: Date) => monthLabel(d, f),
  dayLabel: (iso: string) => dayLabel(iso, f),
  parseAmount: (s: string) => parseAmount(s, f),
  symbol: nf(f, f.currency).formatToParts(0).find((p) => p.type === "currency")?.value ?? f.currency,
});

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

// The server runs in UTC; "today" and "this month" follow the user's clock (tz cookie, set by the browser).
export const DEFAULT_TZ = "America/New_York";
const tzOk = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const zone = (tz?: string | null) => (tz && tzOk(tz) ? tz : DEFAULT_TZ);
export const todayIn = (tz?: string | null, at = new Date()) => at.toLocaleDateString("en-CA", { timeZone: zone(tz) }); // YYYY-MM-DD
// The user's date as a UTC-midnight Date, so ymd, monthStart and getUTCDate read their calendar.
export const dayIn = (tz?: string | null, at = new Date()) => new Date(todayIn(tz, at) + "T00:00:00Z");
export const hourIn = (tz?: string | null, at = new Date()) => Number(at.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: zone(tz) }));
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const monthStart = (d: Date, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
export const monthLabel = (d: Date, f = scope()) => dateLabel(d, { month: "short" }, f);
export const dayLabel = (iso: string, f = scope()) => dateLabel(iso, { weekday: "short", month: "short", day: "numeric" }, f);

export const FREQ_PER_MONTH: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  SEMI_MONTHLY: 2,
  MONTHLY: 1,
  ANNUALLY: 1 / 12,
};
export const FREQ_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly",
  ANNUALLY: "Yearly",
  UNKNOWN: "Irregular",
};

// Raw bank descriptions ("PURCHASE AUTHORIZED ON 05/27 ROYAL FARMS 100 ... CARD 44") -> "Royal Farms".
const NOISE = /\b(purchase authorized on|pos purchase|purchase-sig|visa purchase|debit card purchase|recurring payment|ach (debit|credit)|card \d+|ppd id|web id|inc)\b|\b\d{2}\/\d{2}\b|#\s*\d+|\b\d+\b/gi;
export function cleanName(raw: string) {
  const s = raw.replace(NOISE, " ").replace(/[^\p{L}\p{N}&' .-]/gu, " ").replace(/\s+/g, " ").trim();
  const base = (s || raw).split(" ").slice(0, 4).join(" ");
  return base === base.toUpperCase() ? base.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase()) : base;
}
export const displayName = (t: { custom_name: string | null; merchant_name: string | null; name: string }) =>
  t.custom_name || t.merchant_name || cleanName(t.name);
