// Country-aware advice: which profile questions apply where, and the short playbooks broke AI follows per topic.
// Everything branches on the country's tax module (countries.ts). US-only things (HSA, 401(k), 529, filing status)
// never reach anyone else, who get their own country's accounts or, with no module, general guidance.
// Pure, no "@/" imports: `node src/lib/advice.test.ts` runs it.
import { countryOf, type TaxModule } from "./countries.ts";

export type ProfileKey = "filing" | "income" | "age" | "work" | "match" | "health" | "hsaCover" | "dependents" | "risk";
export type Option = { value: string; label: string };
export type Field = { key: ProfileKey; label: string; options: Option[] };

const opts = (values: string[], label: (v: string) => string = (v) => v): Option[] => values.map((value) => ({ value, label: label(value) }));

// Stored values never change by country (tax.ts and plan-facts.ts read them); only what the user sees does.
const INCOME = ["Under $50k", "$50k-$100k", "$100k-$200k", "$200k-$400k", "Over $400k"];
const MATCH = ["No 401(k)", "401(k), no match", "Match up to 3%", "Match up to 4-6%", "Match over 6%", "Not sure"];
export const RISK = ["I'd hold or buy more", "I'd feel uneasy but hold", "I'd sell"];
const HEALTH = ["High-deductible (HSA eligible)", "Regular plan", "Marketplace plan", "Medicare / Medicaid", "None", "Not sure"];

// The workplace retirement plan an employer pays into, by tax module. None: there's no match question there
// (AU super and NZ KiwiSaver employer shares and India's EPF are compulsory, so asking about a "match" misleads).
const PLAN_NAME: Partial<Record<TaxModule, string>> = { us: "401(k)", uk: "workplace pension", ie: "workplace pension", ca: "RRSP or pension" };

const symbol = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;

/** The profile questions for a country, in order. */
export function profileFields(code?: string | null): Field[] {
  const c = countryOf(code);
  const us = c.tax === "us";
  const sym = symbol(c.currency);
  const plan = PLAN_NAME[c.tax];
  const fields: (Field | false)[] = [
    us && { key: "filing", label: "Tax filing status", options: opts(["Single", "Married filing jointly", "Married filing separately", "Head of household"]) },
    { key: "income", label: "Household income (yearly)", options: opts(INCOME, (v) => v.replaceAll("$", sym)) },
    { key: "age", label: "Age", options: opts(["Under 30", "30-39", "40-49", "50-59", "60+"]) },
    { key: "work", label: "How you earn", options: opts(["W-2 employee", "Self-employed", "Both", "Not working"], (v) => (!us && v === "W-2 employee" ? "Employee" : v)) },
    !!plan && {
      key: "match", label: `Employer ${plan} match`,
      options: opts(MATCH, (v) => (v === "No 401(k)" ? `No ${plan}` : v === "401(k), no match" ? `${plan[0].toUpperCase()}${plan.slice(1)}, no match` : v)),
    },
    us && { key: "health", label: "Health plan", options: opts(HEALTH) },
    // The HSA limit is set by who the plan covers, not by how many kids there are.
    us && { key: "hsaCover", label: "Health plan covers", options: opts(["Just me", "Me and family", "Not sure"]) },
    { key: "dependents", label: "Kids or dependents", options: opts(["0", "1", "2", "3+"]) },
    { key: "risk", label: "If your investments fell 20% in a year", options: opts(RISK) },
  ];
  return fields.filter((f): f is Field => !!f);
}

export const GOALS = ["Build an emergency fund", "Pay off debt", "Spend less", "Plan a big purchase", "Lower my taxes", "Retire early", "Buy a home", "Save for kids' college", "Invest more"];

// Goals with a target: an amount, the month to reach it, and what's saved toward it so far.
export const TARGET_GOALS = ["Buy a home", "Plan a big purchase", "Save for kids' college"];
export type GoalPlan = { goal: string; amount: number; by: string; saved?: number }; // by: "YYYY-MM"
/** Takes a target: the listed target goals and any goal the user typed themselves. */
export const hasTarget = (goal: string) => TARGET_GOALS.includes(goal) || !GOALS.includes(goal);

/** A goal target as typed or proposed, or null if it isn't one. */
export function validGoalPlan(g: unknown): GoalPlan | null {
  const x = g as Partial<GoalPlan> | null;
  if (!x || typeof x.goal !== "string" || !x.goal.trim() || x.goal.length > 60 || !hasTarget(x.goal)) return null;
  const amount = Number(x.amount), saved = x.saved == null ? undefined : Number(x.saved);
  if (!(amount > 0 && amount < 1e8) || typeof x.by !== "string" || !/^20\d\d-(0[1-9]|1[0-2])$/.test(x.by)) return null;
  if (saved != null && !(saved >= 0 && saved < 1e8)) return null;
  return { goal: x.goal!, amount: Math.round(amount), by: x.by, ...(saved != null ? { saved: Math.round(saved) } : {}) };
}

/** Where the money for a goal usually goes in this country: the account, and one line on why. */
export function goalAccount(code: string | null | undefined, goal: string): { label: string; why: string } {
  const tax = countryOf(code).tax;
  const cash = { label: "a high-interest savings account", why: "Money needed within about 5 years is safer in savings than in shares." };
  if (goal === "Buy a home")
    return ({
      us: cash,
      ca: { label: "an FHSA", why: "Contributions are deductible and a first-home withdrawal is tax-free." },
      uk: { label: "a Lifetime ISA", why: "The government adds a 25% bonus for a first home if you open it before 40." },
      nz: { label: "KiwiSaver", why: "After three years in KiwiSaver, most of it can go toward a first home." },
      au: { label: "the First Home Super Saver scheme", why: "Voluntary super contributions can be taken out for a first home deposit, taxed lightly." },
    } as Partial<Record<TaxModule, { label: string; why: string }>>)[tax] ?? cash;
  if (goal === "Save for kids' college")
    return ({
      us: { label: "a 529 plan", why: "Growth is tax-free for education costs, and many states give a tax deduction." },
      ca: { label: "an RESP", why: "The government adds a grant on contributions." },
      uk: { label: "a Junior ISA", why: "Growth is tax-free and it becomes theirs at 18." },
      in: { label: "Sukanya Samriddhi (for a daughter) or PPF", why: "Government schemes with tax-free returns." },
    } as Partial<Record<TaxModule, { label: string; why: string }>>)[tax] ?? { label: "a long-term savings or investment account", why: "Money needed in more than 5 years can be invested for growth." };
  return cash;
}

/** The order of accounts to invest in after the basics, in this country. */
export function investOrder(code?: string | null): string[] {
  return ({
    us: ["401(k) up to the match", "HSA if your plan is eligible", "Roth or traditional IRA", "More 401(k)", "A taxable brokerage account"],
    ca: ["RRSP or pension up to any match", "TFSA", "RRSP", "A non-registered account"],
    uk: ["Workplace pension up to the employer contribution", "Stocks and Shares ISA", "More pension (SIPP)", "A general investment account"],
    ie: ["Workplace pension up to any match", "More pension or a PRSA", "Investments outside a pension (mind deemed disposal)"],
    nz: ["KiwiSaver up to the employer and government contribution", "A managed fund or PIE fund", "Shares directly"],
    au: ["Super (salary sacrifice up to the concessional cap)", "Investments outside super"],
    in: ["EPF (through work)", "PPF and NPS", "Equity mutual funds"],
  } as Partial<Record<TaxModule, string[]>>)[countryOf(code).tax] ?? ["Any employer retirement plan up to its match", "Your country's tax-advantaged retirement account", "Low-cost diversified investments"];
}

/**
 * A profile change the AI proposed, checked against this country's questions. Returns only valid fields; anything
 * else (an unknown key, a value not in the list, a US-only field outside the US) is dropped, never saved.
 */
export function validSave(code: string | null | undefined, proposed: Record<string, unknown>): { fields: Partial<Record<ProfileKey, string>>; goals: string[]; goalPlans: GoalPlan[] } {
  const fields: Partial<Record<ProfileKey, string>> = {};
  for (const f of profileFields(code)) {
    const v = proposed[f.key];
    if (typeof v === "string" && f.options.some((o) => o.value === v)) fields[f.key] = v;
  }
  const goals = Array.isArray(proposed.goals) ? proposed.goals.filter((g): g is string => typeof g === "string" && GOALS.includes(g)) : [];
  const goalPlans = Array.isArray(proposed.goalPlans) ? proposed.goalPlans.map(validGoalPlan).filter((g): g is GoalPlan => !!g) : [];
  return { fields, goals, goalPlans };
}

/** The questions and exact values a save block may use in this country, for the system prompt. */
export const profileQuestions = (code?: string | null) =>
  `Profile questions in ${countryOf(code).name} (save with these keys and exact values):\n${profileFields(code)
    .map((f) => `- ${f.key} (${f.label}): ${f.options.map((o) => JSON.stringify(o.value) + (o.label !== o.value ? ` (shown as "${o.label}")` : "")).join(", ")}`)
    .join("\n")}\n- goals (a list): ${GOALS.map((g) => JSON.stringify(g)).join(", ")}\n- goalPlans (a list, for ${TARGET_GOALS.map((g) => JSON.stringify(g)).join(", ")}): {"goal", "amount" (a number in their currency), "by" ("YYYY-MM"), "saved" (optional number)}`;

// ---- Playbooks: what to ask first and what to work out, per topic and country. ----

export type Topic = "health" | "retirement" | "tax" | "home" | "education" | "investing";
const TOPIC_WORDS: Record<Topic, RegExp> = {
  health: /\bhsa\b|health savings|high[- ]deductible|hdhp|medical (bills|costs)|health insurance|private health|medicare levy/i,
  retirement: /retire|401\(?k\)?|\bira\b|roth|pension|kiwisaver|\bsuper(annuation)?\b|\bsipp\b|rrsp|\bprsa\b|\bnps\b|\bepf\b|\bppf\b/i,
  tax: /\btax(es)?\b|deduct|refund|withholding|\bisa\b|tfsa|80c|tax regime|bracket/i,
  home: /\bhouse\b|\bhome\b|deposit|down ?payment|mortgage|first home|fhsa|lifetime isa|\blisa\b/i,
  education: /college|universit|tuition|\b529\b|resp|junior isa|kids?'? (education|school)|sukanya/i,
  investing: /invest|stocks?|shares|\betfs?\b|index fund|brokerage|portfolio|compound/i,
};

/** The topics a message is about, in a fixed order. */
export const topicsOf = (text: string): Topic[] => (Object.keys(TOPIC_WORDS) as Topic[]).filter((t) => TOPIC_WORDS[t].test(text));

type Book = { ask: string[]; know: string[] };
// Shared first questions per topic, before the country's own.
const ASK: Record<Topic, string[]> = {
  health: ["How you get health cover now"],
  retirement: ["Age range", "Whether an employer pays into a retirement account, and how much", "What retirement accounts they already have, linked or not"],
  tax: ["How they earn (employee, self-employed, both)", "Household income range"],
  home: ["Target price or deposit amount, and when they want to buy", "Whether they've owned a home before", "How much is saved toward it now"],
  education: ["How many kids and their ages", "How much they'd like to have saved, and by when"],
  investing: ["What the money is for and when they'll need it", "How they'd feel if it dropped 20% in a year (calm, uneasy, would sell)", "Whether high-interest debt and an emergency fund are dealt with first"],
};

// Facts are account types and how they work, never this year's limits (those live in invest.ts and change yearly).
const BOOKS: Partial<Record<TaxModule, Partial<Record<Topic, Book>>>> = {
  us: {
    health: { ask: ["Is the health plan HSA-eligible (high-deductible)?", "Self-only or family coverage (the HSA limit differs)?", "Does the employer put money into the HSA? It counts toward the limit."], know: ["An HSA is tax-free in, tax-free growth and tax-free out for medical costs.", "Many HSAs let the balance be invested; paying small bills out of pocket and keeping receipts lets it grow.", "Only HSA-eligible plans allow contributions. Use the contribution_room tool for this year's limit."] },
    retirement: { ask: ["Do they get the full employer 401(k) match?"], know: ["Order of operations: full employer match, high-interest debt, emergency fund, HSA if eligible, IRA, then more 401(k).", "Roth vs traditional depends on today's tax rate vs the expected rate in retirement; lower earners usually lean Roth.", "Roth IRA eligibility phases out at higher incomes."] },
    tax: { ask: ["Filing status", "State"], know: ["Pre-tax 401(k) and HSA contributions lower taxable income.", "Self-employed: estimated quarterly tax, SEP IRA or solo 401(k).", "State income tax varies by state; some have none."] },
    home: { ask: ["First-time buyer?"], know: ["Under 20% down usually means paying PMI on a conventional loan.", "Many states and cities run first-time buyer assistance programs.", "Keep the deposit in cash or high-yield savings if buying within a few years, not stocks."] },
    education: { know: ["A 529 grows tax-free for qualified education costs; many states give a state tax deduction for contributions.", "Retirement savings come before college savings: loans exist for college, not for retirement."], ask: [] },
    investing: { ask: [], know: ["Tax-advantaged accounts (401(k), IRA, HSA) before a taxable brokerage account.", "Low-cost broad index funds keep fees down; use the fund_fees tool on their holdings.", "Never name specific funds or stocks."] },
  },
  ca: {
    health: { ask: [], know: ["HSAs are a US account. In Canada, provincial health cover is the base; some employers offer a Health Spending Account for extra costs.", "Medical expenses above a threshold can be claimed as a tax credit."] },
    retirement: { ask: ["Does the employer offer an RRSP or pension match?"], know: ["RRSP contributions are deductible; withdrawals are taxed. TFSA contributions aren't deductible, but growth and withdrawals are tax-free.", "Higher earners usually favour the RRSP; lower earners the TFSA.", "Contribution room is on their CRA notice of assessment."] },
    tax: { ask: ["Province"], know: ["RRSP deductions lower taxable income; TFSA growth is never taxed.", "Self-employed: CPP both halves, and instalments may apply."] },
    home: { ask: ["First-time buyer?"], know: ["The FHSA gives a deduction going in and tax-free withdrawal for a first home.", "The RRSP Home Buyers' Plan lets first-time buyers borrow from their RRSP.", "Under 20% down needs mortgage default insurance."] },
    education: { ask: [], know: ["An RESP gets the Canada Education Savings Grant on contributions; low-income families may get the Canada Learning Bond."] },
    investing: { ask: [], know: ["Use TFSA and RRSP room before a non-registered account.", "Low-cost broad index ETFs keep fees down. Never name specific funds or stocks."] },
  },
  uk: {
    health: { ask: [], know: ["HSAs are a US account. In the UK the NHS is the base; private medical insurance through work is a taxable benefit."] },
    retirement: { ask: ["Do they pay into the workplace pension enough to get the full employer contribution?", "Is salary sacrifice offered?"], know: ["Pension contributions get tax relief at their marginal rate; salary sacrifice also saves National Insurance.", "A SIPP is a personal pension with the same tax relief.", "Some of the pension can usually be taken tax-free at retirement."] },
    tax: { ask: [], know: ["ISAs: interest, dividends and gains inside are tax-free, up to a yearly allowance.", "Pension contributions reduce income tax; near the higher-rate threshold or a tapered allowance they're worth more.", "Self-employed: Self Assessment and payments on account."] },
    home: { ask: ["First-time buyer, and under 40?"], know: ["A Lifetime ISA adds a government bonus for a first home (or retirement); a penalty applies to other withdrawals.", "First-time buyers may pay less Stamp Duty in England and Northern Ireland."] },
    education: { ask: [], know: ["A Junior ISA grows tax-free and becomes the child's at 18."] },
    investing: { ask: [], know: ["Stocks and Shares ISA and pension before a general account.", "Low-cost global index funds keep fees down. Never name specific funds or stocks."] },
  },
  ie: {
    health: { ask: [], know: ["HSAs are a US account. In Ireland, private health insurance premiums and many medical expenses get tax relief."] },
    retirement: { ask: ["Does the employer pay into a pension, and do they match?"], know: ["Pension contributions get tax relief at the marginal rate, with an age-based cap as a share of earnings.", "A PRSA is a personal pension; employer contributions to one can be very tax-efficient."] },
    tax: { ask: [], know: ["Pension contributions are the main way to lower income tax.", "EU ETFs have deemed disposal: tax every eight years even if not sold. Factor that into investing outside a pension."] },
    home: { ask: ["First-time buyer, and buying a new build?"], know: ["First-time buyers buying a new build may qualify for Help to Buy; check Revenue for the current rules."] },
    education: { ask: [], know: ["No dedicated tax-free education account; tuition fees can get tax relief."] },
    investing: { ask: [], know: ["A pension is usually the most tax-efficient place to invest.", "Never name specific funds or stocks."] },
  },
  nz: {
    health: { ask: [], know: ["HSAs are a US account. In New Zealand, public health is the base; private insurance has no tax relief."] },
    retirement: { ask: ["Are they in KiwiSaver, and at what contribution rate?", "Which fund type (conservative, balanced, growth)?"], know: ["Employees who contribute get an employer contribution; members who contribute enough may get a government contribution each year.", "A growth fund suits money not needed for decades; conservative suits money needed soon.", "Use the right PIR so KiwiSaver isn't over-taxed."] },
    tax: { ask: [], know: ["NZ has no capital gains tax on most shares, but foreign shares over a threshold fall under FIF rules.", "PIE funds are taxed at the investor's PIR, capped below the top rate."] },
    home: { ask: ["First home?", "How long in KiwiSaver?"], know: ["KiwiSaver savings can usually be withdrawn for a first home after three years of membership."] },
    education: { ask: [], know: ["No dedicated tax-free education account."] },
    investing: { ask: [], know: ["KiwiSaver first, at least to the contribution that gets the full employer and government contributions.", "Never name specific funds or stocks."] },
  },
  au: {
    health: { ask: ["Do they have private hospital cover?"], know: ["HSAs are a US account. In Australia, higher earners without private hospital cover pay the Medicare levy surcharge."] },
    retirement: { ask: ["Do they salary sacrifice into super?"], know: ["Employers must pay super on top of salary.", "Concessional (before-tax) contributions are taxed at a low rate inside super, up to a yearly cap; unused cap can sometimes carry forward.", "Low-income earners may get government co-contributions."] },
    tax: { ask: [], know: ["Salary sacrificing into super lowers taxable income.", "Self-employed: PAYG instalments may apply."] },
    home: { ask: ["First home?"], know: ["The First Home Super Saver scheme lets voluntary super contributions be withdrawn for a first home deposit.", "State first-home buyer grants and stamp duty concessions vary by state."] },
    education: { ask: [], know: ["No dedicated tax-free education account; HECS-HELP covers university fees."] },
    investing: { ask: [], know: ["Super is the most tax-effective place for long-term money; outside super, capital gains held over a year get a discount.", "Never name specific funds or stocks."] },
  },
  in: {
    health: { ask: [], know: ["HSAs are a US account. In India, health insurance premiums can be deducted under 80D in the old tax regime."] },
    retirement: { ask: ["Are they in EPF through work?"], know: ["EPF, PPF and NPS are the main retirement accounts.", "NPS has an extra deduction in the old regime."] },
    tax: { ask: ["Old or new tax regime?"], know: ["The new regime has lower rates but few deductions; the old regime keeps 80C, 80D and HRA. Which wins depends on how many deductions they use.", "80C covers EPF, PPF, ELSS and more, up to a cap."] },
    home: { ask: [], know: ["Home loan interest and principal can be deducted in the old regime."] },
    education: { ask: [], know: ["Sukanya Samriddhi is a government savings scheme for daughters.", "Children's tuition fees count under 80C in the old regime."] },
    investing: { ask: [], know: ["PPF and EPF are safe and tax-free; equity mutual funds suit long horizons.", "Never name specific funds or stocks."] },
  },
};

const GENERAL: Book = {
  ask: [],
  know: ["broke has no detailed rules for this country. Give general guidance only: high-interest debt first, an emergency fund, employer retirement contributions, low-cost diversified investing.", "Say which kind of account to look for (a tax-advantaged retirement or savings account) and point to the country's tax authority for the rules."],
};

/** The playbook text for these topics in this country, ready to append to the system prompt. Empty when no topics. */
export function playbook(code: string | null | undefined, topics: Topic[]): string {
  if (!topics.length) return "";
  const c = countryOf(code);
  const parts = topics.map((t) => {
    const book = BOOKS[c.tax]?.[t] ?? GENERAL;
    return `## ${t}\nAsk first (only what the profile doesn't answer):\n${[...ASK[t], ...book.ask].map((a) => `- ${a}`).join("\n")}\nWhat applies in ${c.name}:\n${book.know.map((k) => `- ${k}`).join("\n")}`;
  });
  return `# Playbook for ${c.name}\nFollow this. Advice for any other country does not apply.\n\n${parts.join("\n\n")}`;
}
