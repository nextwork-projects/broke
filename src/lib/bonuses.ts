// Sign-up bonuses for bank and investing accounts: does this user qualify, and what's it worth after fees and tax.
// The offers live in bonus-offers.ts (checked by hand on each institution's page). Cards come from cards.ts.
// Pure, no "@/" imports: `node src/lib/bonuses.test.ts` runs it.

export type OfferKind = "checking" | "savings" | "brokerage";
export type Offer = {
  id: string; country: string; kind: OfferKind; institution: string; product: string;
  bonus: number; // the main tier, in local currency
  tiers?: { bonus: number; requirement: string; need: number }[]; // need: the direct deposit or new money for this tier
  requirement: string; // the offer's own words, shortened
  directDeposit: number | null; // total direct deposit needed
  depositWithinDays: number | null;
  newMoney: number | null; // money to put in or transfer
  holdDays: number | null; // how long it must stay
  switch?: boolean; // UK: a full switch through the Current Account Switch Service
  debitTxns?: number | null;
  monthlyFee: number | null; feeWaiver?: string | null; // null: not stated on the offer page
  cash?: false; // paid as something other than cash (a trading-fee credit): shown, never counted in the total
  earlyCloseFee?: number | null;
  expires: string | null; // YYYY-MM-DD
  excludes?: string | null;
  creditPull?: "hard" | "soft" | "none" | null;
  url: string; checked: string; // YYYY-MM-DD
  verified: "institution" | "tracker"; // confirmed on the institution's own page, or only on a tracker site
  notes?: string | null;
};

/** What broke knows about the user, all from their own data. Null: unknown. */
export type Who = {
  country: string;
  today: string;
  payMonthly: number | null; // income landing in their accounts a month (paychecks), the direct deposit they could move
  cash: number | null; // available cash now
  spare: number | null; // spare a month
  institutions: string[]; // banks and brokers they already have linked
  carrying: boolean; // paying card interest
  cushion: boolean; // has the starter emergency fund
  taxRate: number | null; // US marginal rate, for the tax on a bonus
};

export type Verdict = "yes" | "maybe" | "no";
/** why: whether they qualify. notes: fees, tax and fine print. */
export type Match = { offer: Offer; verdict: Verdict; why: string[]; notes: string[]; bonus: number; net: number; tax: number; fees: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Already a customer? Matched on the institution's name, both ways ("Chase" and "JPMorgan Chase"). */
export const hasInstitution = (who: Pick<Who, "institutions">, institution: string) =>
  who.institutions.some((i) => norm(i).includes(norm(institution)) || norm(institution).includes(norm(i)));

export function matchOffer(o: Offer, who: Who, money: (n: number) => string = (n) => `$${Math.round(n).toLocaleString("en-US")}`): Match {
  const why: string[] = [], notes: string[] = [];
  let verdict: Verdict = "yes";
  const down = (v: Verdict, reason: string) => {
    why.push(reason);
    if (v === "no" || (v === "maybe" && verdict === "yes")) verdict = v;
  };
  if (o.country !== who.country) down("no", "Not offered where you live.");
  if (o.expires && o.expires < who.today) down("no", "This offer has ended.");
  if (hasInstitution(who, o.institution)) down("no", `You already bank with ${o.institution}, and bonuses are usually for new customers.`);

  // What they could put in: pay over the deposit window, or cash on hand. A tiered offer pays the best tier that fits.
  const window = Math.max(1, (o.depositWithinDays ?? 90) / 30.4);
  const can = o.directDeposit ? (who.payMonthly == null ? null : who.payMonthly * window) : o.newMoney ? who.cash : null;
  const tier = o.tiers?.length && can != null ? [...o.tiers].sort((a, b) => b.need - a.need).find((t) => can >= t.need) ?? null : null;
  const bonus = tier?.bonus ?? o.bonus;
  const need = (top: number) => tier?.need ?? (o.tiers?.length ? Math.min(...o.tiers.map((t) => t.need)) : top);
  if (tier && tier.bonus < o.bonus) notes.push(`You'd reach the ${money(bonus)} tier, not the top ${money(o.bonus)} one.`);

  const dd = o.country === "US" ? "direct deposits" : "pay coming in";
  if (o.directDeposit) {
    const need_ = need(o.directDeposit);
    if (who.payMonthly == null) down("maybe", `Needs ${money(need_)} of ${dd}; broke hasn't found your pay yet.`);
    else if (who.payMonthly * window >= need_) why.push(`Your pay of about ${money(who.payMonthly)} a month covers the ${money(need_)} of ${dd}.`);
    else down("no", `Needs ${money(need_)} of ${dd}${o.depositWithinDays ? ` within ${o.depositWithinDays} days` : ""}; your pay is about ${money(who.payMonthly)} a month.`);
  }
  if (o.newMoney && !o.directDeposit) {
    const need_ = need(o.newMoney);
    // Investing offers also take money moved from investments held elsewhere, which broke can't count here.
    const short = o.kind === "brokerage" ? "maybe" : "no";
    if (who.cash == null) down("maybe", `Needs ${money(need_)} moved in.`);
    else if (who.cash >= need_) why.push(`Your ${money(who.cash)} of cash covers the ${money(need_)} deposit${o.holdDays ? ` for ${o.holdDays} days` : ""}.`);
    else down(short, `Needs ${money(need_)} moved in${o.kind === "brokerage" ? ", from cash or investments you hold elsewhere" : ""}; you have about ${money(who.cash)} in cash.`);
  }
  if (o.switch) down("maybe", "Needs a full switch of your main account through the Current Account Switch Service.");
  if (o.creditPull === "hard") down("maybe", "Opening it runs a hard credit check.");
  if (who.carrying) down("maybe", "Pay off card interest first: that's worth more than any bonus.");
  else if (!who.cushion) down("maybe", "Build your starter emergency fund first.");

  // Fees for the months it must stay open, unless the requirement itself waives them (a direct deposit usually does).
  const months = Math.ceil((o.holdDays ?? 90) / 30.4);
  if (o.monthlyFee == null) notes.push("Check the monthly fee on their page: the offer doesn't say.");
  const fees = o.monthlyFee && !(o.directDeposit && /direct deposit/i.test(o.feeWaiver ?? "")) && !(o.newMoney && /balance/i.test(o.feeWaiver ?? "")) ? o.monthlyFee * months : 0;
  if (fees) notes.push(`About ${money(fees)} in fees while it stays open.`);
  // US bank and brokerage bonuses are taxable income (reported on a 1099). Outside the US no tax is taken off: not checked.
  const tax = who.country === "US" && who.taxRate && o.cash !== false ? bonus * who.taxRate : 0;
  if (tax) notes.push(`About ${money(tax)} of it goes to federal tax.`);
  if (o.cash === false) notes.push("Paid as credit toward fees, not cash, so it isn't in your total.");
  if (o.excludes) notes.push(o.excludes);
  if (o.verified === "tracker") notes.push("broke could only confirm this on a deal-tracking site, not the bank's own page.");
  return { offer: o, verdict, why, notes, bonus, net: Math.max(0, bonus - fees - tax), tax, fees };
}

/** Best first: ones they qualify for, then maybe, then no; by what they'd keep. */
export const rankMatches = (ms: Match[]) => {
  const order: Record<Verdict, number> = { yes: 0, maybe: 1, no: 2 };
  return [...ms].sort((a, b) => order[a.verdict] - order[b.verdict] || b.net - a.net);
};

/** "You could get": the bonuses they qualify for now, after fees and tax. */
// One bonus per institution and kind (two Chase checking offers are one account), cash only.
export const couldGet = (ms: (Pick<Match, "verdict" | "net"> & { offer?: Pick<Offer, "institution" | "kind" | "cash"> })[]) => {
  const best = new Map<string, number>();
  ms.forEach((m, i) => {
    if (m.verdict !== "yes" || m.offer?.cash === false) return;
    const k = m.offer ? `${m.offer.institution}:${m.offer.kind}` : `#${i}`;
    best.set(k, Math.max(best.get(k) ?? 0, m.net));
  });
  return [...best.values()].reduce((s, n) => s + n, 0);
};

export const KIND_LABEL: Record<OfferKind, string> = { checking: "Bank accounts", savings: "Savings accounts", brokerage: "Investing accounts" };
