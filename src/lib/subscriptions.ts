// Price hikes, overlapping services, cancel links and bill negotiation for recurring charges.
// Pure: no "@/" imports, so subscriptions.test.ts runs with plain node.

export type Stream = { id?: string; merchant_name: string; frequency?: string; average_amount: number; is_income?: boolean; active?: boolean };
export type Charge = { merchant_name: string | null; name: string; amount: number; date: string; plaid_category?: string | null };
export type Alert =
  | { kind: "price_hike"; merchant: string; from: number; to: number; date: string }
  | { kind: "duplicate"; group: string; same: boolean; merchants: string[]; monthly: number };

// One table: which group a service belongs to and where to cancel it. Only links checked to resolve.
// cancel: null means no known direct page; never fill one in by guessing.
const SERVICES: { name: string; match: RegExp; group?: string; cancel: string | null }[] = [
  { name: "Spotify", match: /spotify/, group: "music", cancel: "https://www.spotify.com/account/overview/" },
  { name: "Apple Music", match: /apple music/, group: "music", cancel: "https://apps.apple.com/account/subscriptions" },
  { name: "YouTube Music", match: /youtube music/, group: "music", cancel: "https://www.youtube.com/paid_memberships" },
  { name: "Tidal", match: /tidal/, group: "music", cancel: null },
  { name: "Amazon Music", match: /amazon music/, group: "music", cancel: null },
  { name: "Netflix", match: /netflix/, group: "video", cancel: "https://www.netflix.com/cancelplan" },
  { name: "Hulu", match: /hulu/, group: "video", cancel: "https://secure.hulu.com/account" },
  { name: "Disney+", match: /disney/, group: "video", cancel: "https://www.disneyplus.com/account" },
  { name: "Max", match: /hbo|^max\b/, group: "video", cancel: "https://www.hbomax.com/account" },
  { name: "Peacock", match: /peacock/, group: "video", cancel: "https://www.peacocktv.com/account" },
  { name: "Paramount+", match: /paramount/, group: "video", cancel: "https://www.paramountplus.com/account/" },
  { name: "Prime Video", match: /prime video|amazon prime/, group: "video", cancel: "https://www.amazon.com/mc" },
  { name: "iCloud", match: /icloud/, group: "cloud storage", cancel: "https://apps.apple.com/account/subscriptions" },
  { name: "Google One", match: /google one|google storage/, group: "cloud storage", cancel: "https://play.google.com/store/account/subscriptions" },
  { name: "Dropbox", match: /dropbox/, group: "cloud storage", cancel: "https://www.dropbox.com/account/plan" },
  { name: "YouTube Premium", match: /youtube premium/, cancel: "https://www.youtube.com/paid_memberships" },
  { name: "Adobe", match: /adobe/, cancel: "https://account.adobe.com/plans" },
  { name: "Audible", match: /audible/, cancel: "https://www.audible.com/account/overview" },
];

const PER_MONTH: Record<string, number> = { WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, SEMI_MONTHLY: 2, MONTHLY: 1, ANNUALLY: 1 / 12 };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const service = (merchant: string) => SERVICES.find((s) => s.match.test(norm(merchant)));
export const cancelUrl = (merchant: string) => service(merchant)?.cancel ?? null;

// Charges from this stream's merchant, oldest first.
const chargesFor = (s: Stream, txns: Charge[]) => {
  const m = norm(s.merchant_name);
  return txns
    .filter((t) => t.amount > 0 && (norm(t.merchant_name ?? "") === m || norm(t.name).includes(m)))
    .sort((a, b) => a.date.localeCompare(b.date));
};

// A hike: at least 2 earlier charges at a steady price (within 2%), then a last charge 2% and $0.50 higher.
export function priceHike(s: Stream, txns: Charge[]) {
  const c = chargesFor(s, txns);
  if (c.length < 3) return null;
  const last = c[c.length - 1], prev = c.slice(-4, -1).map((t) => t.amount);
  const before = prev[prev.length - 1];
  if (prev.some((a) => Math.abs(a - before) > before * 0.02)) return null;
  return last.amount > before * 1.02 && last.amount - before >= 0.5 ? { from: before, to: last.amount, date: last.date } : null;
}

export function subscriptionAlerts(streams: Stream[], txns: Charge[]): Alert[] {
  const live = streams.filter((s) => s.active !== false && !s.is_income);
  const alerts: Alert[] = [];
  for (const s of live) {
    const h = priceHike(s, txns);
    if (h) alerts.push({ kind: "price_hike", merchant: s.merchant_name, ...h });
  }
  // Same group (two music apps) or same merchant twice (two Netflix plans).
  const groups = new Map<string, Stream[]>();
  for (const s of live) {
    const key = service(s.merchant_name)?.group ?? `same:${norm(s.merchant_name)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const same = new Set(list.map((s) => norm(s.merchant_name))).size === 1;
    alerts.push({
      kind: "duplicate",
      group: same ? list[0].merchant_name : key,
      same,
      merchants: list.map((s) => s.merchant_name),
      monthly: Math.round(list.reduce((t, s) => t + s.average_amount * (PER_MONTH[s.frequency ?? ""] ?? 1), 0) * 100) / 100,
    });
  }
  return alerts;
}

// Bills worth a retention call: internet/cable, phone, insurance. By name first, then Plaid's detailed category.
const NEGOTIABLE: [RegExp, Negotiable][] = [
  [/comcast|xfinity|spectrum|charter comm|\bcox\b|optimum|altice|frontier comm|centurylink|windstream|mediacom|astound|\brcn\b|google fiber|dish network|directv|\bsling\b|internet|broadband|\bcable\b/, "internet"],
  [/at&t|\batt\b|verizon|t-mobile|tmobile|sprint|us cellular|cricket wireless|metro by|boost mobile|mint mobile|wireless|cellular|\bmobile\b|telecom/, "phone"],
  [/geico|progressive|state farm|allstate|liberty mutual|farmers ins|nationwide|usaa|travelers ins|esurance|lemonade ins|insurance/, "insurance"],
];
const NEGOTIABLE_CATEGORY: Record<string, Negotiable> = {
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "internet",
  RENT_AND_UTILITIES_TELEPHONE: "phone",
  GENERAL_SERVICES_INSURANCE: "insurance",
};
export type Negotiable = "internet" | "phone" | "insurance";
export function negotiable(merchant: string, plaidCategory?: string | null): Negotiable | null {
  const m = norm(merchant);
  return NEGOTIABLE.find(([re]) => re.test(m))?.[1] ?? (plaidCategory ? NEGOTIABLE_CATEGORY[plaidCategory] ?? null : null);
}
export const categoryOf = (s: Stream, txns: Charge[]) => chargesFor(s, txns).at(-1)?.plaid_category ?? null;

const FREQ: Record<string, string> = { WEEKLY: "a week", BIWEEKLY: "every 2 weeks", SEMI_MONTHLY: "twice a month", MONTHLY: "a month", ANNUALLY: "a year" };
const usd = (n: number) => `$${n.toFixed(2)}`;
const per = (s: Stream) => `${usd(s.average_amount)} ${FREQ[s.frequency ?? ""] ?? "per charge"}`;

export function cancelPrompt(s: Stream) {
  const url = cancelUrl(s.merchant_name);
  return [
    `Write my cancellation message for ${s.merchant_name}. I pay ${per(s)}.`,
    "Give me two versions: a short email, and a script to paste into their support chat.",
    "Use placeholders for my details: [Your name], [Account email], [Phone], [Last 4 digits of card].",
    "Ask them to cancel now, stop all future charges, not renew, and confirm the cancellation in writing.",
    url ? `Their account page for cancelling is ${url}. Mention it as the fastest way.` : "Do not give a cancel link, support address or phone number unless you are sure it is real.",
    "No intro. Just the two messages.",
  ].join(" ");
}

const ASK: Record<Negotiable, string> = {
  internet: "a lower promo rate, a retention discount, dropping unused add-ons or equipment rental, or a cheaper speed tier",
  phone: "a loyalty discount, a cheaper plan that fits my usage, removing unused lines or insurance add-ons, and autopay or paperless credits",
  insurance: "a re-quote with every discount I qualify for (bundling, safe driver, paperless, autopay, paid in full) and what a higher deductible would save",
};
export function negotiatePrompt(s: Stream, kind: Negotiable, state?: string) {
  return [
    `Help me lower my ${s.merchant_name} ${kind} bill. I pay ${per(s)}.`,
    state ? `I live in ${state}.` : "My state is not set in my money profile.",
    `Write the exact script I read to their ${kind === "insurance" ? "agent or customer service line" : "retention (cancellation) line"}: the opening line, then ask for ${ASK[kind]}.`,
    "Add what to say if they say no, and a clear walk-away point: the price at which I accept, and when I actually cancel and switch.",
    "Do not invent competitor prices, offers or phone numbers. Tell me what to look up before I call.",
    "Keep it short.",
  ].join(" ");
}
