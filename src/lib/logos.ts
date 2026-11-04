// Local brand logos for merchants and banks Plaid sends no logo for. Pure: no "@/" imports, so node can test it.
// Files live in public/logos/<slug>.png (128px squares), downloaded once by hand from each brand's own site
// (Simple Icons in the brand's colour for Uber Eats, DoorDash, Lyft and Amazon; Wikimedia for the IRS seal and Affirm).
// Nothing is fetched at runtime: a logo service would see the user's merchant names.

// slug -> names it goes by, already normalised (see norm). Matched as whole words anywhere in the name.
const ALIASES: Record<string, string[]> = {
  "uber-eats": ["uber eats", "ubereats"],
  venmo: ["venmo"],
  "cash-app": ["cash app", "cashapp", "square cash", "sq cash"],
  irs: ["internal revenue service", "irs", "irs treas", "irs usataxpymt"],
  earnin: ["earnin", "activehours"],
  brigit: ["brigit"],
  grubhub: ["grubhub"],
  paypal: ["paypal"],
  zelle: ["zelle"],
  apple: ["apple", "apple com bill", "itunes"],
  google: ["google"],
  hulu: ["hulu"],
  "disney-plus": ["disney plus", "disneyplus"],
  youtube: ["youtube", "youtube premium", "youtube tv"],
  netflix: ["netflix"],
  spotify: ["spotify"],
  doordash: ["doordash", "dashpass"],
  lyft: ["lyft"],
  instacart: ["instacart"],
  amazon: ["amazon", "amzn", "prime video", "amazon prime"],
  max: ["hbo max", "max com", "hbomax"],
  peacock: ["peacock tv", "peacocktv", "peacock premium"],
  "paramount-plus": ["paramount plus", "paramountplus"],
  affirm: ["affirm"],
  klarna: ["klarna"],
  afterpay: ["afterpay"],
  chase: ["chase", "jpmorgan chase", "jpmorgan"],
  "american-express": ["american express", "amex"],
  "capital-one": ["capital one", "capitalone"],
  citi: ["citi", "citibank", "citicards"],
  "wells-fargo": ["wells fargo"],
  discover: ["discover", "discover bank"],
  bilt: ["bilt"],
  "bank-of-america": ["bank of america", "bofa"],
};

// "UBER EATS", "Uber Eats" and "uber-eats*" all become "uber eats"; "Disney+" becomes "disney plus".
export const norm = (s: string) =>
  s.toLowerCase().replace(/\+/g, " plus ").replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Longest alias first, so "uber eats" wins over a shorter name inside it.
const PAIRS = Object.entries(ALIASES).flatMap(([slug, as]) => as.map((a) => [a, slug] as const)).sort((a, b) => b[0].length - a[0].length);

export function logoSlug(name?: string | null): string | null {
  if (!name) return null;
  const n = ` ${norm(name)} `;
  return PAIRS.find(([a]) => n.includes(` ${a} `))?.[1] ?? null;
}

export const logoFor = (name?: string | null) => {
  const s = logoSlug(name);
  return s ? `/logos/${s}.png` : null;
};

// Rows that are money moving, not a merchant: interest, loan and card payments, transfers, deposits, fees.
const GENERIC = /\b(payments?|pymnt|pmt|interest|intrst|transfer|deposit|withdrawal|fees?|autopay|thank you|thank|refund|atm|balance)\b/;
const GENERIC_ICONS = new Set(["transfer", "credit_card", "loan", "fees"]);
export const isGeneric = (name: string, icon?: string | null) => GENERIC.test(norm(name)) || GENERIC_ICONS.has(icon ?? "");
