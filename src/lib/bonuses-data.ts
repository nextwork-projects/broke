import "server-only";
import { cardMatches } from "@/lib/cards-data";
import { couldGet, matchOffer, rankMatches, type Match, type Who } from "@/lib/bonuses";
import { OFFERS } from "@/lib/bonus-offers";
import { creditOf } from "@/lib/credit";
import { countryOf } from "@/lib/countries";
import { getUser } from "@/lib/data";
import { fmtFor, fmtWith } from "@/lib/format";
import { myPlanFacts } from "@/lib/plan-facts";
import { ladder } from "@/lib/plan";

// The signed-in user's bonus picture: account offers matched to their data, and card sign-up bonuses (US cards page).
export async function myBonuses() {
  const { supabase, user } = await getUser();
  const profile = (user?.user_metadata?.profile ?? {}) as Record<string, unknown>;
  const country = countryOf(profile.country as string | undefined);
  const fmt = fmtWith(fmtFor(profile));
  const credit = creditOf(profile);
  const [facts, { data: items }, cards] = await Promise.all([
    myPlanFacts(),
    supabase.from("plaid_items").select("institution_name").eq("user_id", user!.id),
    country.cards ? cardMatches(supabase, user!.id, credit && credit.band !== "unsure" ? credit.band : null) : Promise.resolve(null),
  ]);
  const L = ladder(facts);
  const who: Who = {
    country: country.code, today: facts.today,
    payMonthly: facts.budget && !facts.budget.incomeTold && facts.budget.income >= 100 ? facts.budget.income : null, // under $100: no paycheck found
    cash: facts.budget?.cash ?? null, spare: L.spare,
    institutions: (items ?? []).map((i) => i.institution_name).filter(Boolean) as string[],
    carrying: L.carrying, cushion: L.cushion,
    taxRate: facts.tax && !facts.tax.guessed ? facts.tax.rate : null,
  };
  // ponytail: institutions come from Plaid links only; banks linked through GoCardless, Akahu or CSV aren't checked yet.
  const accounts = rankMatches(OFFERS.filter((o) => o.country === country.code).map((o) => matchOffer(o, who, fmt.money0)));
  // Card bonuses: not a card they hold, inside their credit range, and only with no card interest and a starter fund.
  const cardRows = (cards?.fits ?? [])
    .filter((f) => f.bonus && f.card.bonus && f.fitsCredit !== false)
    .map((f) => {
      const why: string[] = [];
      let verdict: Match["verdict"] = "yes";
      const down = (v: "maybe" | "no", reason: string) => {
        why.push(reason);
        if (v === "no" || verdict === "yes") verdict = v;
      };
      if (f.bonusReachable === false) down("no", "Your usual spending doesn't reach the minimum in time.");
      else if (f.bonusReachable == null) down("maybe", "Link a card with some spending to check the minimum.");
      else why.push(`Your usual spending reaches the ${fmt.money0(f.card.bonus!.minSpend)} minimum in ${f.card.bonus!.months} months.`);
      if (L.carrying) down("maybe", "Pay off card interest first: a new card makes that harder.");
      else if (!L.cushion) down("maybe", "Build your starter emergency fund first.");
      if (f.fitsCredit == null) why.push("Add your credit range to check this card fits it.");
      const fee = f.card.feeYear1 ?? f.card.fee ?? 0;
      const notes = fee ? [`It has a ${fmt.money0(fee)} fee in the first year, taken off what you keep.`] : [];
      return { fit: f, verdict, why, notes, net: Math.max(0, f.bonus! - fee) };
    })
    .sort((a, b) => ({ yes: 0, maybe: 1, no: 2 })[a.verdict] - ({ yes: 0, maybe: 1, no: 2 })[b.verdict] || b.net - a.net);
  // later: what they'd get once the plan's first steps are done (the "maybe"s held back only by card interest or the fund).
  const held = <T extends { verdict: Match["verdict"]; why: string[] }>(ms: T[]) => ms.map((m) => ({ ...m, verdict: m.verdict === "maybe" && m.why.every((w) => !/^(Needs|Opening|Link|Add)/.test(w)) ? ("yes" as const) : m.verdict }));
  return {
    country, who, accounts, cards: cards ? cardRows : null, money: fmt.money0,
    total: couldGet(accounts) + couldGet(cardRows),
    later: couldGet(held(accounts)) + couldGet(held(cardRows)),
  };
}
