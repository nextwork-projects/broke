// Card catalogue and the math that matches cards to a user's spending. Pure: no "@/" imports, so node can test it.
// Every figure was read on the issuer's own page on CHECKED. null = not shown there; the UI says "check the issuer's page".
// Category rates only count where the card's bucket fits broke's category; partial buckets (online grocery,
// drugstores, streaming, travel booked in the issuer portal, rotating 5%) are left at the base rate and named in notes.

import type { Band } from "./credit.ts";

export const CHECKED = "2026-10-22";

export type Cat = "dining" | "groceries" | "travel" | "transport" | "entertainment" | "other";
export const CAT_LABEL: Record<Cat, string> = {
  dining: "Dining", groceries: "Groceries", travel: "Travel", transport: "Gas & transport", entertainment: "Entertainment", other: "Everything else",
};
// broke category key -> card bucket.
const KEY_CAT: Record<string, Cat> = { FOOD_AND_DRINK: "dining", GROCERIES: "groceries", TRAVEL: "travel", TRANSPORTATION: "transport", ENTERTAINMENT: "entertainment" };
export const catOf = (key?: string | null): Cat => KEY_CAT[key ?? ""] ?? "other";

// rate = points (or %) per $1. cap = yearly $ at that rate, then the card earns 1x.
export type Earn = { rate: number; cap?: number };
export type Bonus = { points: number; minSpend: number; months: number };
// "building" = for building or rebuilding credit (secured cards).
export type CreditNeed = "excellent" | "good" | "fair" | "building";

export type Card = {
  id: string;
  issuer: string;
  name: string;
  kind: "cash" | "travel";
  fee: number | null;
  feeYear1?: number;
  earn: Partial<Record<Cat, Earn>> & { other: Earn };
  currency: string;
  pointCents: number; // assumed value of 1 point in cents
  bonus: Bonus | null;
  cashbackMatch?: boolean; // first-year cash back matched by the issuer
  // The credit level the issuer's own page names, read 2026-10-23. null = the page names none.
  credit: CreditNeed | null;
  notes: string[];
  url: string;
  domains: string[]; // referral links must be https on one of these
  match: RegExp; // finds this card in a linked account name
  asOf: string;
  source: string;
  referral: string | null;
};

// Point values (assumptions, not quotes): cash back 1c. Chase Ultimate Rewards and Capital One miles 1c (cash or travel
// at their fixed rate). Amex Membership Rewards 1c (flights through Amex Travel; cash out is worth less).
const CHASE = ["chase.com", "referyourchasecard.com"], AMEX = ["americanexpress.com"], CAP1 = ["capitalone.com"];
const base = { asOf: CHECKED, referral: null };

export const CARDS: Card[] = [
  {
    ...base, id: "chase-sapphire-preferred", issuer: "Chase", name: "Sapphire Preferred", kind: "travel", fee: 95,
    earn: { dining: { rate: 3 }, transport: { rate: 3 }, travel: { rate: 2 }, other: { rate: 1 } },
    currency: "Ultimate Rewards points", pointCents: 1, bonus: { points: 75000, minSpend: 5000, months: 3 }, credit: null,
    notes: ["3x is on gas and EV charging; counted on all auto & transport.", "5x on Chase Travel and 3x on streaming and online grocery not counted."],
    url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred", domains: CHASE, match: /sapphire\s*preferred/i,
    source: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
  },
  {
    ...base, id: "chase-freedom-unlimited", issuer: "Chase", name: "Freedom Unlimited", kind: "cash", fee: 0,
    earn: { dining: { rate: 3 }, other: { rate: 1.5 } },
    currency: "cash back", pointCents: 1, bonus: { points: 20000, minSpend: 500, months: 3 }, credit: null,
    notes: ["3% on drugstores and 5% on Chase Travel not counted."],
    url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited", domains: CHASE, match: /freedom\s*unlimited/i,
    source: "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited",
  },
  {
    ...base, id: "chase-freedom-flex", issuer: "Chase", name: "Freedom Flex", kind: "cash", fee: 0,
    earn: { dining: { rate: 3 }, other: { rate: 1 } },
    currency: "cash back", pointCents: 1, bonus: { points: 25000, minSpend: 500, months: 3 }, credit: null,
    notes: ["5% on up to $1,500 a quarter in rotating categories you activate. Not counted.", "3% on drugstores and 5% on Chase Travel not counted."],
    url: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex", domains: CHASE, match: /freedom\s*flex/i,
    source: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
  },
  {
    ...base, id: "amex-gold", issuer: "American Express", name: "Gold Card", kind: "travel", fee: 325,
    earn: { dining: { rate: 4, cap: 50000 }, groceries: { rate: 4, cap: 25000 }, other: { rate: 1 } },
    currency: "Membership Rewards points", pointCents: 1, bonus: null, credit: null,
    notes: ["4x groceries is at U.S. supermarkets only.", "3x on flights booked with airlines and 5x on prepaid hotels through Amex Travel not counted."],
    url: "https://www.americanexpress.com/us/credit-cards/card/gold-card/", domains: AMEX, match: /(amex|american express)\s*gold|^gold card/i,
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
  },
  {
    ...base, id: "amex-blue-cash-preferred", issuer: "American Express", name: "Blue Cash Preferred", kind: "cash", fee: 95, feeYear1: 0,
    earn: { groceries: { rate: 6, cap: 6000 }, transport: { rate: 3 }, other: { rate: 1 } },
    currency: "cash back", pointCents: 1, bonus: null, credit: null,
    notes: ["6% groceries at U.S. supermarkets on up to $6,000 a year.", "3% is on transit and U.S. gas stations.", "6% on select U.S. streaming not counted."],
    url: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/", domains: AMEX, match: /blue\s*cash\s*preferred/i,
    source: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/",
  },
  {
    ...base, id: "amex-blue-cash-everyday", issuer: "American Express", name: "Blue Cash Everyday", kind: "cash", fee: 0,
    earn: { groceries: { rate: 3, cap: 6000 }, transport: { rate: 3, cap: 6000 }, other: { rate: 1 } },
    currency: "cash back", pointCents: 1, bonus: null, credit: null,
    notes: ["3% is at U.S. supermarkets and U.S. gas stations, each on up to $6,000 a year. Gas counted on all auto & transport.", "3% on U.S. online retail not counted."],
    url: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/", domains: AMEX, match: /blue\s*cash\s*everyday/i,
    source: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/",
  },
  {
    ...base, id: "capital-one-venture", issuer: "Capital One", name: "Venture", kind: "travel", fee: 95,
    earn: { other: { rate: 2 } },
    currency: "miles", pointCents: 1, bonus: { points: 75000, minSpend: 4000, months: 3 }, credit: "excellent" /* "Excellent Credit" */,
    notes: ["5x on hotels and rental cars through Capital One Travel not counted."],
    url: "https://www.capitalone.com/credit-cards/venture/", domains: CAP1, match: /\bventure\b(?!\s*(x|one))/i,
    source: "https://www.capitalone.com/credit-cards/venture/",
  },
  {
    ...base, id: "capital-one-savor", issuer: "Capital One", name: "Savor", kind: "cash", fee: 0,
    earn: { dining: { rate: 3 }, groceries: { rate: 3 }, entertainment: { rate: 3 }, other: { rate: 1 } },
    currency: "cash back", pointCents: 1, bonus: { points: 20000, minSpend: 500, months: 3 }, credit: "excellent" /* "Excellent Credit" */,
    notes: ["3% groceries excludes superstores like Walmart and Target.", "5% on Capital One Travel not counted."],
    url: "https://www.capitalone.com/credit-cards/savor/", domains: CAP1, match: /\bsavor\b(?!\s*one)/i,
    source: "https://www.capitalone.com/credit-cards/savor/",
  },
  {
    ...base, id: "capital-one-quicksilver", issuer: "Capital One", name: "Quicksilver", kind: "cash", fee: 0,
    earn: { other: { rate: 1.5 } },
    currency: "cash back", pointCents: 1, bonus: { points: 20000, minSpend: 500, months: 3 }, credit: "excellent" /* "Excellent Credit" */,
    notes: [],
    url: "https://www.capitalone.com/credit-cards/quicksilver/", domains: CAP1, match: /quicksilver(?!\s*one)/i,
    source: "https://www.capitalone.com/credit-cards/compare/",
  },
  {
    ...base, id: "citi-double-cash", issuer: "Citi", name: "Double Cash", kind: "cash", fee: 0,
    earn: { other: { rate: 2 } },
    currency: "cash back", pointCents: 1, bonus: null, credit: null,
    notes: ["1% when you buy and 1% as you pay.", "5% on hotels, car rentals and attractions through Citi Travel not counted."],
    url: "https://www.citi.com/credit-cards/citi-double-cash-credit-card", domains: ["citi.com"], match: /double\s*cash/i,
    source: "https://www.citi.com/credit-cards/citi-double-cash-credit-card",
  },
  {
    ...base, id: "wells-fargo-active-cash", issuer: "Wells Fargo", name: "Active Cash", kind: "cash", fee: 0,
    earn: { other: { rate: 2 } },
    currency: "cash back", pointCents: 1, bonus: { points: 10000, minSpend: 500, months: 3 }, credit: null,
    notes: [],
    url: "https://creditcards.wellsfargo.com/active-cash-credit-card/", domains: ["wellsfargo.com"], match: /active\s*cash/i,
    source: "https://creditcards.wellsfargo.com/active-cash-credit-card/",
  },
  {
    ...base, id: "wells-fargo-autograph", issuer: "Wells Fargo", name: "Autograph", kind: "travel", fee: 0,
    earn: { dining: { rate: 3 }, travel: { rate: 3 }, transport: { rate: 3 }, other: { rate: 1 } },
    currency: "Wells Fargo Rewards points", pointCents: 1, bonus: { points: 20000, minSpend: 1000, months: 3 }, credit: null,
    notes: ["Also 3x on popular streaming services and phone plans. Not counted: broke files those under other categories.", "No foreign transaction fee."],
    url: "https://creditcards.wellsfargo.com/autograph-visa-credit-card/", domains: ["wellsfargo.com"], match: /autograph/i,
    source: "https://creditcards.wellsfargo.com/autograph-visa-credit-card/",
  },
  {
    ...base, id: "discover-it", issuer: "Discover", name: "Discover it Cash Back", kind: "cash", fee: 0,
    earn: { other: { rate: 1 } },
    currency: "cash back", pointCents: 1, bonus: { points: 20000, minSpend: 500, months: 3 }, cashbackMatch: true, credit: null,
    notes: ["5% on up to $1,500 a quarter in rotating categories you activate. Not counted.", "All cash back from year one is matched."],
    url: "https://www.discover.com/credit-cards/cash-back/it-card.html", domains: ["discover.com", "capitalone.com"] /* Capital One owns Discover; its referral links are i.capitalone.com */, match: /discover\s*it(?!.*secured)/i,
    source: "https://www.discover.com/credit-cards/cash-back/it-card.html",
  },
  {
    ...base, id: "bilt-blue", issuer: "Bilt", name: "Bilt Blue Card", kind: "travel", fee: 0,
    earn: { other: { rate: 1 } },
    currency: "Bilt Points", pointCents: 1, bonus: null, credit: null,
    notes: ["Up to 1.25x on rent or mortgage and up to 4x at Bilt partner restaurants. Not counted.", "Comes with $100 Bilt Cash; spend needed not shown."],
    url: "https://www.bilt.com/card", domains: ["bilt.com"], match: /\bbilt\b/i,
    source: "https://www.bilt.com/card",
  },
  {
    ...base, id: "discover-it-secured", issuer: "Discover", name: "Discover it Secured", kind: "cash", fee: 0,
    earn: { other: { rate: 1 } },
    currency: "cash back", pointCents: 1, bonus: null, cashbackMatch: true, credit: "building" /* "No credit score required to apply" */,
    notes: ["Refundable deposit of $49, $99 or $200.", "5% on up to $1,500 a quarter in rotating categories you activate. Not counted.", "All cash back from year one is matched."],
    url: "https://www.discover.com/credit-cards/secured/", domains: ["discover.com", "capitalone.com"] /* Capital One owns Discover; its referral links are i.capitalone.com */, match: /discover.*secured/i,
    source: "https://www.discover.com/credit-cards/secured/",
  },
];

// Spending a card would earn rewards on. Interest, fees, tax payments, loan and card payments and transfers earn
// nothing (issuers exclude them), so they never count toward a card's value or a sign-up bonus.
const NO_REWARDS_KEYS = ["BANK_FEES", "LOAN_PAYMENTS", "CREDIT_CARD_PAYMENT", "TRANSFER_IN", "TRANSFER_OUT"];
const NO_REWARDS_PFC = /^(BANK_FEES_|LOAN_PAYMENTS_|TRANSFER_|GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT)/;
export const earnsRewards = (t: { key?: string | null; plaid?: string | null; name?: string | null }) =>
  !NO_REWARDS_KEYS.includes(t.key ?? "") && !NO_REWARDS_PFC.test(t.plaid ?? "") && !/\binterest charge|\binternal revenue service\b|\birs\b/i.test(t.name ?? "");

// Yearly spend by bucket from spend transactions. Under 12 months of history is annualised (at least 30 days counted).
export function yearlySpend(txns: { date: string; amount: number; key?: string | null }[], today = new Date()): Record<Cat, number> {
  const out: Record<Cat, number> = { dining: 0, groceries: 0, travel: 0, transport: 0, entertainment: 0, other: 0 };
  if (!txns.length) return out;
  const first = Math.min(...txns.map((t) => Date.parse(t.date)));
  const days = Math.min(365, Math.max(30, (today.getTime() - first) / 864e5));
  for (const t of txns) out[catOf(t.key)] += t.amount;
  for (const k in out) out[k as Cat] *= 365 / days;
  return out;
}

const rateFor = (c: Card, cat: Cat) => c.earn[cat] ?? c.earn.other;
// $ earned in one bucket: the card's rate up to its cap, then 1x.
const earnIn = (c: Card, cat: Cat, spend: number) => {
  const e = rateFor(c, cat), at = e.cap == null ? spend : Math.min(spend, e.cap);
  return (at * e.rate + (spend - at) * 1) * c.pointCents / 100;
};

export type Fit = {
  card: Card;
  byCat: { cat: Cat; spend: number; rate: number; earn: number }[];
  earn: number;
  ongoing: number; // earn minus the yearly fee
  bonus: number | null; // $ value of the sign-up bonus (and year-one match)
  bonusReachable: boolean | null; // typical monthly spend hits the minimum in time
  yearOne: number;
  fitsCredit?: boolean | null; // null: no credit range to check against
};

export function fit(card: Card, spend: Record<Cat, number>): Fit {
  const byCat = (Object.keys(spend) as Cat[]).filter((cat) => spend[cat] > 0).map((cat) => ({ cat, spend: spend[cat], rate: rateFor(card, cat).rate, earn: earnIn(card, cat, spend[cat]) }));
  const earn = byCat.reduce((s, x) => s + x.earn, 0);
  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  const b = card.bonus;
  const bonusReachable = b && total > 0 ? (total / 12) * b.months >= b.minSpend : null; // no spending history: unknown, not "no"
  const bonus = b ? (b.points * card.pointCents) / 100 + (card.cashbackMatch ? earn : 0) : card.cashbackMatch ? earn : null;
  const fee = card.fee ?? 0;
  return { card, byCat, earn, ongoing: earn - fee, bonus, bonusReachable, yearOne: earn - (card.feeYear1 ?? fee) + (bonusReachable !== false ? bonus ?? 0 : 0) };
}

// Does the card fit the user's credit range? Only the issuer's stated level counts, mapped by its own word onto
// the FICO bands in credit.ts (Capital One's "Excellent Credit" = Excellent). With no stated level, Experian's
// general rule applies: rewards cards "generally need good or excellent credit scores, which corresponds to a FICO
// Score of 670 or higher" (https://www.experian.com/blogs/ask-experian/what-credit-score-do-you-need-to-get-a-rewards-card/,
// read 2026-10-23). No band or "Not sure": null, nothing is filtered. Never a statement about approval.
const BAND_RANK: Record<Exclude<Band, "unsure">, number> = { none: 0, poor: 1, fair: 2, good: 3, excellent: 4 };
const NEED_RANK: Record<CreditNeed, number> = { building: 0, fair: 2, good: 3, excellent: 4 };
export function fitsCredit(c: Pick<Card, "credit">, band?: Band | null): boolean | null {
  if (!band || band === "unsure") return null;
  return BAND_RANK[band] >= NEED_RANK[c.credit ?? "good"];
}
// Why a card doesn't fit, for the list.
export const creditNote = (c: Pick<Card, "credit" | "issuer">) =>
  c.credit === "excellent" || c.credit === "fair" ? `${c.issuer} lists this card for ${c.credit} credit.` : "Usually needs Good credit or better.";

// Ranked by value. With a credit range, cards that fit come first; the rest stay, below them.
export const rank = (cards: Card[], spend: Record<Cat, number>, by: "yearOne" | "ongoing" = "yearOne", band?: Band | null) =>
  cards.map((c) => ({ ...fit(c, spend), fitsCredit: fitsCredit(c, band) })).sort((a, b) => creditFirst(a, b) || b[by] - a[by] || b.ongoing - a.ongoing);
export const creditFirst = (a: Pick<Fit, "fitsCredit">, b: Pick<Fit, "fitsCredit">) => Number(a.fitsCredit === false) - Number(b.fitsCredit === false);
// The best card for the user's spending, only from cards that fit their credit range.
export const bestFit = <F extends Pick<Fit, "fitsCredit" | "ongoing">>(fits: F[]) => [...fits].filter((f) => f.fitsCredit !== false).sort((a, b) => b.ongoing - a.ongoing)[0];

// Linked credit accounts -> catalogue cards they look like.
export const ownedCards = (accounts: { name: string; official_name?: string | null }[], cards = CARDS) =>
  cards.filter((c) => accounts.some((a) => c.match.test(`${a.name} ${a.official_name ?? ""}`)));

// What the user's own cards earn, putting each bucket on whichever owned card pays most for it.
export const currentEarn = (owned: Card[], spend: Record<Cat, number>) =>
  owned.length ? (Object.keys(spend) as Cat[]).reduce((s, cat) => s + Math.max(...owned.map((c) => earnIn(c, cat, spend[cat]))), 0) : null;

// Owner-supplied referral links: https only, on the card's own issuer domains. Anything else is dropped with a warning.
export function withReferrals(cards: Card[], links: Record<string, unknown>, warn = console.warn): Card[] {
  const ok = new Map<string, string>();
  for (const [id, link] of Object.entries(links ?? {})) {
    const card = cards.find((c) => c.id === id);
    let u: URL | null = null;
    try { u = typeof link === "string" ? new URL(link) : null; } catch {}
    const host = u?.hostname.toLowerCase() ?? "";
    if (card && u?.protocol === "https:" && !u.username && !u.password && card.domains.some((d) => host === d || host.endsWith("." + d))) ok.set(id, u.href);
    else warn(`[broke] card-referrals.json: dropped ${id} (${!card ? "unknown card id" : "link must be https on " + card.domains.join(" or ")})`);
  }
  return cards.map((c) => ({ ...c, referral: ok.get(c.id) ?? null }));
}

// Plain-text terms for the page, shared by the server page and the client list.
const CHECK = "check the issuer's page";
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const feeText = (c: Pick<Card, "fee" | "feeYear1">) =>
  c.fee == null ? `Annual fee: ${CHECK}` : c.feeYear1 != null && c.feeYear1 !== c.fee ? `${usd(c.feeYear1)} first year, then ${usd(c.fee)}` : c.fee ? `${usd(c.fee)} a year` : "No annual fee";

export function bonusText(f: { card: Pick<Card, "bonus" | "cashbackMatch" | "currency" | "pointCents">; bonusReachable: boolean | null }) {
  const { bonus: b, cashbackMatch, currency, pointCents } = f.card;
  const match = cashbackMatch ? "Cash back from year one is matched." : "";
  if (!b) return [match || `Bonus: ${CHECK}.`];
  const what = currency === "cash back" ? usd((b.points * pointCents) / 100) : `${b.points.toLocaleString("en-US")} ${currency}`;
  return [`Sign-up bonus: ${what} when you spend ${usd(b.minSpend)} in the first ${b.months} months.`, match, f.bonusReachable === false ? "Your usual spending may not reach this in time." : ""].filter(Boolean);
}

// Card art in public/cards, downloaded once from the issuer's own page on 2026-10-23. from = the image's URL there.
// Discover's art is cropped out of its shadow; Discover's secured page shows the same it card. No flat Bilt Blue
// art on bilt.com (only tilted photos), so Bilt falls back to the issuer logo.
export const CARD_ART: Record<string, { src: string; from: string }> = {
  "chase-sapphire-preferred": { src: "/cards/chase-sapphire-preferred.png", from: "https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/sapphire-preferredcard2026.png" },
  "chase-freedom-unlimited": { src: "/cards/chase-freedom-unlimited.png", from: "https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/freedom_unlimited_card_alt.png" },
  "chase-freedom-flex": { src: "/cards/chase-freedom-flex.png", from: "https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/freedom_flex_card.png" },
  "amex-gold": { src: "/cards/amex-gold.png", from: "https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/gold-card.png" },
  "amex-blue-cash-preferred": { src: "/cards/amex-blue-cash-preferred.png", from: "https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/blue-cash-preferred.png" },
  "amex-blue-cash-everyday": { src: "/cards/amex-blue-cash-everyday.png", from: "https://icm.aexp-static.com/Internet/Acquisition/US_en/AppContent/OneSite/category/cardarts/blue-cash-everyday.png" },
  "capital-one-venture": { src: "/cards/capital-one-venture.png", from: "https://ecm.capitalone.com/WCM/card/products/venture-card-art.png" },
  "capital-one-savor": { src: "/cards/capital-one-savor.png", from: "https://ecm.capitalone.com/WCM/card/products/new-savor-card-art.png" },
  "capital-one-quicksilver": { src: "/cards/capital-one-quicksilver.png", from: "https://ecm.capitalone.com/WCM/card/products/qs_cardart_prim_323x203.png" },
  "citi-double-cash": { src: "/cards/citi-double-cash.webp", from: "https://aemapi.citi.com/content/dam/cfs/uspb/usmkt/cards/en/static/images/citi-double-cash-credit-card/citi-double-cash-credit-card_306x192.webp" },
  "wells-fargo-active-cash": { src: "/cards/wells-fargo-active-cash.webp", from: "https://creditcards.wellsfargo.com/rv/next/images/cards/active-cash.webp" },
  "wells-fargo-autograph": { src: "/cards/wells-fargo-autograph.webp", from: "https://creditcards.wellsfargo.com/rv/next/images/cards/autograph.webp" },
  "discover-it": { src: "/cards/discover-it.png", from: "https://ecm.capitalone.com/WCM/dfs-card/products/cardart-cashit-with-shadow.png" },
  "discover-it-secured": { src: "/cards/discover-it-secured.png", from: "https://ecm.capitalone.com/WCM/dfs-card/products/cardart-cashit-with-shadow.png" },
};

/**
 * One recurring bill and the cards it could go on: what it earns where it's paid now (nothing from a bank account),
 * the best card the user already has for it, and the best card from the catalogue they don't have.
 * Earnings are a year's rewards in dollars, at each card's rate for the bill's category (point value as listed).
 */
export function billOnCards(bill: { yearly: number; cat: Cat; payingCard: Card | null }, owned: Card[], others: Card[]) {
  const best = (cards: Card[]) => cards.map((c) => ({ card: c, earn: earnIn(c, bill.cat, bill.yearly) })).sort((a, b) => b.earn - a.earn)[0] ?? null;
  const now = bill.payingCard ? earnIn(bill.payingCard, bill.cat, bill.yearly) : 0;
  return { now, mine: best(owned), other: best(others) };
}

/** For each kind of spending, which of the user's own cards earns most per dollar, and how much (cents per $1). */
/** tie: another card earns the same, so it doesn't matter which. */
export function whichCard(owned: Card[]): { cat: Cat; card: Card; rate: number; cents: number; tie: boolean }[] {
  if (!owned.length) return [];
  return (Object.keys(CAT_LABEL) as Cat[]).map((cat) => {
    const all = owned.map((card) => ({ card, rate: rateFor(card, cat).rate, cents: rateFor(card, cat).rate * card.pointCents / 100 }))
      .sort((a, b) => b.cents - a.cents || a.card.name.localeCompare(b.card.name));
    return { cat, ...all[0], tie: all.length > 1 && Math.abs(all[1].cents - all[0].cents) < 1e-9 };
  });
}
