// Run: node src/lib/plan.test.ts
import assert from "node:assert/strict";
import { allowLinks, carryStatus, deterministicMoves, DOUBT_NOTE, KEEP_MIN, parsePlan, sanity, sectionOf, whyLine, type Facts } from "./plan.ts";
import { bracketFor, IRS, marginalRate } from "./tax.ts";

const rates = (other: number, more: Partial<Record<string, number>> = {}) => ({ dining: other, groceries: other, travel: other, transport: other, entertainment: other, other, ...more });
const facts: Facts = {
  today: "2026-10-22", country: "US", currency: "USD", state: "CA", monthlySpend: 3000,
  bills: [
    { name: "Netflix", yearly: 215.88, frequency: "MONTHLY", cat: "entertainment", negotiable: null, cancelUrl: "https://www.netflix.com/cancelplan", nextDate: null },
    { name: "Hulu", yearly: 119.88, frequency: "MONTHLY", cat: "entertainment", negotiable: null, cancelUrl: "https://secure.hulu.com/account", nextDate: null },
    { name: "Comcast", yearly: 960, frequency: "MONTHLY", cat: "other", negotiable: "internet", cancelUrl: null, nextDate: null },
    { name: "Geico", yearly: 1500, frequency: "ANNUALLY", cat: "other", negotiable: "insurance", cancelUrl: null, nextDate: "2027-01-05" },
  ],
  priceHikes: [{ merchant: "Netflix", from: 15.49, to: 17.99, date: "2026-09-03", yearly: 30 }],
  duplicates: [{ group: "video", merchants: ["Netflix", "Hulu"], monthly: 27.98, cheapestYearly: 119.88 }],
  idle: { cash: 20000, excess: 11000, gain: 385 },
  match: { cap: [4, 6], pct: 3, guessed: true, gapLow: 3000, gapHigh: 4500 },
  room: [{ label: "HSA", kind: "hsa", left: 4400, deadline: "April 15, 2027", due: "2027-04-15" }, { label: "IRA", kind: "ira", left: 7500, deadline: "April 15, 2027", due: "2027-04-15" }],
  cards: {
    owned: ["Citi Double Cash"], currentEarn: 0, currentRates: rates(1),
    best: { id: "capital-one-savor", name: "Savor", issuer: "Capital One", url: "https://www.capitalone.com/credit-cards/savor/", referral: false, fee: 0, ongoing: 600, yearOne: 800, bonus: 200, bonusReachable: true, rates: rates(1, { entertainment: 3, dining: 3, groceries: 3 }) },
    bonusPick: null,
  },
  rent: { name: "Avalon Apartments", yearly: 24000 }, interest90: 90, fees90: 0,
  topCategories: [], topMerchants: [], bigCharges: [],
  // Single, $50k-$100k: $50,000 less the $16,100 standard deduction = $33,900 taxable, the 12% bracket.
  tax: {
    filing: "single", band: [50000, 100000], rate: 0.12, rateNote: "", guessed: false, work: "Both", age: "30-39", dependents: "1", covered: true,
    refunds365: 2400, payments365: 1500, side90: 3000, sideFrom: ["Stripe"], losses: [{ name: "ARKK", loss: 4200 }, { name: "COIN", loss: 300 }],
    charity365: 1500, studentLoan365: 1248, childcare365: 9000,
  },
  allowedUrls: ["https://www.netflix.com/cancelplan", "https://secure.hulu.com/account", "https://www.capitalone.com/credit-cards/savor/"],
};

const moves = deterministicMoves(facts);
const refs = moves.map((m) => m.ref);
for (const r of ["duplicate:video", "hike:Netflix", "negotiate:Comcast", "insurance:Geico", "hysa", "match", "room:hsa", "rent"]) assert.ok(refs.includes(r), r);
assert.ok(!refs.includes("card:capital-one-savor"), "no new card while paying card interest");
const noInterest = deterministicMoves({ ...facts, interest90: 0 });
assert.equal(moves.find((m) => m.ref === "interest")!.yearly_impact, 183);
assert.ok(!refs.includes("fees"));
assert.equal(deterministicMoves({ ...facts, match: { cap: [4, 6], pct: 4.1, guessed: false, gapLow: 0, gapHigh: 1070 } }).find((m) => m.ref === "match")!.yearly_impact, 535);
assert.ok(!refs.includes("room:ira"), "IRA can be Roth: no tax figure");
assert.ok(moves.every((m, i) => i === 0 || moves[i - 1].step < m.step || (moves[i - 1].step === m.step && moves[i - 1].yearly_impact >= m.yearly_impact)), "ladder order, then value");
assert.equal(moves.find((m) => m.ref === "negotiate:Comcast")!.yearly_impact, 144);
assert.equal(moves.find((m) => m.ref === "insurance:Geico")!.yearly_impact, 150);
const card = noInterest.find((m) => m.ref.startsWith("card:"))!;
assert.equal(card.yearly_impact, 600);
assert.match(card.why, /Moving Netflix and Hulu alone adds \$7/); // (215.88 + 119.88) * 2%
assert.ok(moves.every((m) => m.steps.length >= 3 && m.steps.length <= 6));
assert.ok(moves.every((m) => !/—/.test(m.title + m.why + m.steps.join(""))), "no em dashes");
assert.deepEqual(moves.find((m) => m.ref === "duplicate:video")!.links.map((l) => l.url), ["https://www.netflix.com/cancelplan", "https://secure.hulu.com/account"]);
// No card catalogue (outside the US) and no data: nothing made up.
assert.deepEqual(deterministicMoves({ ...facts, bills: [], priceHikes: [], duplicates: [], idle: null, match: null, room: [], cards: null, rent: null, interest90: 0, tax: null }), []);

// Brackets: Rev. Proc. 2025-32 lower bounds.
assert.equal(bracketFor("single", 50399), 0.12);
assert.equal(bracketFor("single", 50400), 0.22);
assert.equal(bracketFor("mfj", 100800), 0.22);
assert.equal(bracketFor("hoh", 640600), 0.37);
assert.equal(bracketFor("mfs", 384350), 0.37);
assert.equal(bracketFor("mfs", 384349), 0.35);
assert.equal(marginalRate({ filing: "Single", income: "$100k-$200k" }).rate, 0.22); // 100,000 - 16,100 = 83,900
assert.equal(marginalRate({ filing: "Married filing jointly", income: "$100k-$200k" }).rate, 0.12); // 100,000 - 32,200 = 67,800
assert.equal(marginalRate({ filing: "Head of household", income: "Over $400k" }).rate, 0.35); // 375,850
assert.equal(marginalRate({ filing: "Single", income: "Under $50k" }).rate, 0.1);
const unknown = marginalRate({ income: "$100k-$200k" });
assert.ok(unknown.guessed && unknown.rate === 0.1 && /add your income in your profile/i.test(unknown.note));

// Tax moves, built in code.
const tm = (ref: string, f: Facts = facts) => deterministicMoves(f).find((m) => m.ref === ref);
assert.equal(tm("room:hsa")!.yearly_impact, 528, "4,400 at 12%");
assert.equal(tm("room:hsa")!.deadline, "2026-12-31", "payroll HSA contributions stop Dec 31");
assert.match(tm("room:hsa")!.why, /through payroll by Dec 31, or directly by April 15, 2027/);
assert.equal(tm("room:hsa", { ...facts, tax: { ...facts.tax!, work: "Self-employed" } })!.deadline, "2027-04-15", "no payroll: direct by April 15");
const refund = tm("tax:withholding-refund")!;
assert.equal(refund.yearly_impact, 0, "a refund is not savings");
assert.match(refund.title, /\$200 a month back in your pay/);
assert.ok(!tm("tax:withholding-owed"), "side earner: payments are estimates");
assert.ok(tm("tax:withholding-owed", { ...facts, tax: { ...facts.tax!, work: "W-2 employee", side90: 0 } }), "employee who paid at filing");
assert.ok(!tm("tax:withholding-refund", { ...facts, tax: { ...facts.tax!, refunds365: 600 } }), "small refund: no move");
const est = tm("tax:estimated")!;
assert.equal(est.deadline, "2027-01-15", "next 2026 estimate after Oct 22");
assert.equal(est.yearly_impact, 0);
assert.match(est.title, /27\.3%/, "15.3% + 12%");
assert.match(est.why, /\$273 a month/, "3,000 / 3 * 27.3%");
const tlh = tm("tax:harvest")!;
assert.equal(tlh.yearly_impact, 360, "4,500 loss capped at 3,000, at 12%");
assert.equal(tlh.deadline, "2026-12-31");
assert.ok(tlh.steps.some((x) => /wash-sale/.test(x)));
assert.equal(tm("tax:harvest", { ...facts, tax: { ...facts.tax!, filing: "mfs" } })!.yearly_impact, 180, "MFS cap 1,500");
const ira = tm("tax:ira")!;
assert.equal(ira.yearly_impact, 0, "covered by a 401(k) at up to $100k single: no traditional deduction");
assert.match(ira.why, /Roth IRA is open to you/);
assert.equal(ira.deadline, "2027-04-15");
assert.equal(tm("tax:ira", { ...facts, tax: { ...facts.tax!, covered: false } })!.yearly_impact, 900, "7,500 deductible at 12%");
assert.ok(!tm("tax:ira", { ...facts, tax: { ...facts.tax!, band: [200000, 400000], rate: 0.32 } }), "no Roth, no deduction: no move");
assert.match(tm("tax:ira", { ...facts, room: [] })!.why, /2026 IRA limit is \$7,500/);
assert.equal(tm("tax:charity")!.yearly_impact, 120, "1,000 non-itemizer cap at 12%");
assert.equal(tm("tax:charity", { ...facts, tax: { ...facts.tax!, filing: "mfj" } })!.yearly_impact, 180, "joint cap 2,000, gave 1,500");
assert.ok(tm("tax:charity")!.steps.some((x) => /standard deduction/.test(x)));
assert.equal(tm("tax:student-loan")!.yearly_impact, 0, "interest share unknown");
assert.ok(!tm("tax:student-loan", { ...facts, tax: { ...facts.tax!, band: [100000, 200000] } }), "single at $100k+ is past the phase-out");
assert.equal(tm("tax:dependent-care")!.yearly_impact, 900, "7,500 cap at 12%");
assert.ok(!tm("tax:dependent-care", { ...facts, tax: { ...facts.tax!, dependents: "0" } }));
assert.ok(!tm("tax:dependent-care", { ...facts, tax: { ...facts.tax!, filing: "mfs" } }), "MFS cap not verified");
const all = deterministicMoves(facts);
assert.ok(all.filter((m) => m.ref.startsWith("tax:")).every((m) => m.kind === "tax" && m.section === "tax"));
assert.ok(all.every((m) => m.why.length <= 320 && m.steps.every((x) => x.length <= 240) && m.title.length <= 120), "fits the schema the AI echoes back");
assert.ok(all.every((m) => m.links.every((l) => allowLinks([l], facts.allowedUrls).length === 1)), "every code link passes the allow-list");
assert.ok(all.every((m) => !/—/.test(m.title + m.why + m.steps.join(""))), "no em dashes in tax moves");
// Not US: no tax moves at all, local room with no tax figure.
const nz = deterministicMoves({ ...facts, country: "NZ", tax: null, room: [{ label: "KiwiSaver", kind: "kiwisaver", left: 600, deadline: "30 June 2027", due: "2027-06-30" }] });
assert.ok(!nz.some((m) => m.kind === "tax"));
assert.equal(nz.find((m) => m.ref === "room:kiwisaver")!.yearly_impact, 0);

// Sections.
assert.equal(sectionOf({ ref: "interest", kind: "card" }), "debt");
assert.equal(sectionOf({ ref: "card:x", kind: "card" }), "cards");
assert.equal(sectionOf({ ref: "duplicate:video", kind: "cancel" }), "bills");
assert.equal(sectionOf({ ref: "hysa", kind: "signup" }), "saving");
assert.equal(sectionOf({ ref: "room:hsa", kind: "earn" }), "tax");
assert.equal(sectionOf({ ref: "other:x", kind: "signup", section: "saving" }), "saving");

// A big move the model rewrote under ref "other" is not added a second time.
{
  const big = moves.find((c) => c.yearly_impact >= KEEP_MIN)!;
  const { ref: _r, section: _s, deadline: _d, ...rest } = big as typeof big & { section?: string; deadline?: string | null };
  const re = parsePlan(JSON.stringify({ summary: "x", moves: [{ ...rest, ref: "other", links: [] }] }), facts, moves);
  assert.ok(!("error" in re), "error" in re ? re.error : "");
  if (!("error" in re)) assert.equal(re.moves.filter((m) => m.section === big.section && m.kind === big.kind).length, 1, "no duplicate of a reworded move");
}

// A typical month over income adds the overspend move even when the recent months look fine.
{
  const typ = deterministicMoves({ ...facts, months: [], budget: { income: 3000, spend: 3600, cash: 0, essentials: 1500, essentialsAll: false } });
  assert.ok(typ.some((m) => m.ref === "overspend" && m.step === 1), "typical overspend is step 1");
  // No paycheck found: the income is what they told us in onboarding, and the why says so.
  const told = deterministicMoves({ ...facts, months: [], budget: { income: 3000, incomeTold: true, spend: 3600, cash: 0, essentials: 1500, essentialsAll: false } });
  assert.match(told.find((m) => m.ref === "overspend")!.why, /about \$3,000 comes in, from what you told us\./);
  assert.doesNotMatch(typ.find((m) => m.ref === "overspend")!.why, /told us/);
}

// Links: allow-list and broke's own pages only.
assert.deepEqual(allowLinks([{ label: "a", url: "https://www.netflix.com/cancelplan/" }, { label: "b", url: "https://evil.example/" }, { label: "c", url: "/cards" }, { label: "d", url: "//evil.example" }, { label: "e", url: IRS.w4 }, { label: "f", url: "https://www.irs.gov/made-up" }], facts.allowedUrls).map((l) => l.label), ["a", "c", "e"]);

// Parsing the AI's reply.
const good = { ref: "negotiate:Comcast", kind: "negotiate", title: "Call Comcast", why: "You pay $960 a year.", yearly_impact: 5000, effort: "30 min", steps: ["One", "Two", "Three", "Four", "Five", "Six", "Seven"], links: [{ label: "x", url: "https://made.up/" }], confidence: "high" };
const out = parsePlan("Sure! ```json\n" + JSON.stringify({ summary: "Four moves — big ones first.", moves: [good, { ...good, ref: "other", kind: "hustle" }, { ...good, ref: "other", title: "Ask Sam to settle up", kind: "message", yearly_impact: 40 }, { ...good }] }) + "\n```", facts, moves);
assert.ok(!("error" in out));
if (!("error" in out)) {
  // Every big code-built move is there: by its own ref, or as a model move in the same section and kind.
  for (const c of moves.filter((c) => c.yearly_impact >= KEEP_MIN))
    assert.ok(out.moves.some((m) => m.ref === c.ref || (m.section === c.section && m.kind === c.kind)), `kept ${c.ref}`);
  assert.ok(out.moves.length > 2, "big code-built moves the model left out come back");
  assert.equal(new Set(out.moves.map((m) => m.ref)).size, out.moves.length, "no ref twice");
  const comcast = out.moves.find((m) => m.ref === "negotiate:Comcast")!;
  const sam = out.moves.find((m) => m.ref === "other:ask-sam-to-settle-up")!;
  assert.equal(out.dropped, 2, "bad kind and duplicate ref dropped");
  assert.equal(comcast.yearly_impact, 144, "capped at the candidate's number");
  assert.equal(comcast.steps.length, 6);
  assert.deepEqual(comcast.links, [], "made-up link dropped");
  assert.equal(sam.confidence, "medium", "a move of its own can't be high confidence");
  assert.equal(out.summary, "Four moves, big ones first.");
  assert.equal(comcast.section, "bills", "candidate's section");
  assert.equal(sam.deadline, null, "the AI can't set a date");
}
assert.ok("error" in parsePlan("I can't help with that.", facts, moves));
assert.ok("error" in parsePlan('{"moves": "nope"}', facts, moves));
assert.ok("error" in parsePlan('{"moves": [{"kind": "cancel"}]}', facts, moves));

// Re-runs keep the user's progress.
const carried = carryStatus(moves, [{ ref: "hysa", status: "done" }, { ref: "rent", status: "dismissed" }, { ref: "match", status: "doing" }, { ref: null, status: "todo" }]);
assert.ok(!carried.some((m) => m.ref === "hysa" || m.ref === "rent"));
assert.equal(carried.find((m) => m.ref === "match")!.status, "doing");
assert.equal(carried.find((m) => m.ref === "negotiate:Comcast")!.status, "todo");

// The e2e test user: $0 available, about $13k a year of card interest, a $25k student loan, spending far above income,
// goals "emergency fund" and "pay off debt". The plan must be advice you'd give a friend.
{
  const offer = (id: string, name: string, issuer: string, more: object) => ({ id, name, issuer, url: `https://example.com/${id}`, referral: false, fee: 0, ongoing: 0, yearOne: 0, bonus: null, bonusReachable: null, rates: rates(1), ...more });
  const user: Facts = {
    ...facts, monthlySpend: 7186, priceHikes: [], duplicates: [], idle: null, rent: null, fees90: 0, interest90: 3323,
    bills: [
      { name: "Netflix", yearly: 215.88, frequency: "MONTHLY", cat: "entertainment", negotiable: null, cancelUrl: "https://www.netflix.com/cancelplan", nextDate: null, sub: true },
      { name: "Spotify", yearly: 143.88, frequency: "MONTHLY", cat: "entertainment", negotiable: null, cancelUrl: null, nextDate: null, sub: true },
      { name: "Gym", yearly: 267.24, frequency: "MONTHLY", cat: "other", negotiable: null, cancelUrl: null, nextDate: null, sub: true },
      { name: "Student loan", yearly: 6264, frequency: "MONTHLY", cat: "other", negotiable: null, cancelUrl: null, nextDate: null, sub: false },
    ],
    match: { cap: [4, 6], pct: 4.1, guessed: false, gapLow: 0, gapHigh: 1070 },
    room: [
      { label: "401(k)", kind: "k401", left: 22200, deadline: "Dec 31, 2026", due: "2026-12-31" },
      { label: "HSA", kind: "hsa", left: 2100, deadline: "April 15, 2027", due: "2027-04-15" },
      { label: "IRA", kind: "ira", left: 7500, deadline: "April 15, 2027", due: "2027-04-15" },
    ],
    cards: {
      owned: [], currentEarn: 550, currentRates: rates(1),
      best: offer("wells-fargo-active-cash", "Active Cash", "Wells Fargo", { ongoing: 1092, rates: rates(2) }),
      bonusPick: offer("capital-one-venture", "Venture", "Capital One", { fee: 95, bonus: 750, bonusReachable: true }),
    },
    tax: { ...facts.tax!, work: "W-2 employee", dependents: "0", refunds365: 0, payments365: 744, side90: 0, sideFrom: [], losses: [], charity365: 0, studentLoan365: 1248, childcare365: 0 },
    goals: ["Build an emergency fund", "Pay off debt"],
    budget: { income: 2836, spend: 5200, cash: 0, essentials: 3000, essentialsAll: false },
    months: [{ month: "2026-09", income: 2900, spend: 4100 }, { month: "2026-10", income: 2836, spend: 7186 }],
    spikes: [{ id: "6f1c2a52-0000-4000-8000-000000000001", label: "Food and drink", now: 1056, avg: 438, months: 3 }],
    debts: [{ kind: "card", balance: 12000 }, { kind: "student", balance: 25000 }],
    iraRoth: true, futureShare: 0.09,
  };
  const ms = deterministicMoves(user);
  const by = (ref: string) => ms.find((m) => m.ref === ref);
  assert.equal(ms[0].ref, "interest", "card interest is first");
  assert.ok(ms[0].yearly_impact > 6000);
  assert.ok(!ms.some((m) => m.ref.startsWith("card:") || m.ref.startsWith("bonus:")), "no new card or bonus while paying interest with no cushion");
  const k = by("room:k401")!;
  assert.equal(k.yearly_impact, 0, "401(k) max capped by the gate: nothing spare");
  assert.match(k.gate!, /Needs about \$[\d,]+ a month; you have about \$0 spare\. Pay off card interest first\./);
  assert.equal(k.step, 6);
  assert.equal(by("room:hsa")!.yearly_impact, 0);
  assert.equal(by("room:hsa")!.deadline, "2026-12-31", "payroll HSA: Dec 31");
  const ira = by("tax:ira")!;
  assert.match(ira.title, /your Roth IRA/, "linked Roth: add to it");
  assert.ok(!ira.steps.some((x) => /open one/i.test(x)), "never 'open' when one is linked");
  const match = by("match")!;
  assert.equal(match.yearly_impact, 0, "nothing spare for the extra contribution");
  assert.match(match.why, /about \$535 a year/, "match text is the value counted when funded");
  assert.ok(!/1,100|1,070/.test(match.why));
  assert.match(match.gate!, /Needs about \$45 a month/);
  assert.ok(by("fund:starter") && /\$3,000 starter/.test(by("fund:starter")!.title) && /emergency fund as a goal/.test(by("fund:starter")!.why), "starter fund, named rule, goal");
  assert.equal(by("fund:starter")!.step, 2);
  assert.match(by("goal:debt")!.why, /\$12,000 on cards and \$25,000 on student loans/);
  assert.match(by("subs")!.why, /\$627 a year/, "subscriptions to review");
  assert.equal(by("subs")!.step, 1, "spending cuts are step 1 while spending runs above income");
  assert.match(by("overspend")!.why, /October so far: you spent \$7,186 and \$2,836 came in/);
  const spike = by("spike:Food and drink")!;
  assert.ok(spike.links.some((l) => l.url === "/budgets?set=6f1c2a52-0000-4000-8000-000000000001&amount=438"));
  assert.ok(spike.links.every((l) => allowLinks([l], user.allowedUrls).length === 1), "budget and transaction links pass the allow-list");
  assert.ok(by("tax:withholding-owed"), "$744 paid to the IRS: check the W-4");
  assert.ok(ms.every((m, i) => i === 0 || ms[i - 1].step <= m.step), "ladder order");
  assert.equal(sanity(user), null);

  // The same user once the card is paid off and a cushion is there: cards come back, the bonus is one-time, the gate opens.
  const ok = deterministicMoves({ ...user, interest90: 0, budget: { income: 6000, spend: 4000, cash: 6000, essentials: 1500, essentialsAll: false } });
  // A card outside the credit range gets no move; the rest of the plan is unchanged.
  const okFacts = { ...user, interest90: 0, budget: { income: 6000, spend: 4000, cash: 6000, essentials: 1500, essentialsAll: false } };
  const noFit = deterministicMoves({ ...okFacts, cards: { ...okFacts.cards!, best: { ...okFacts.cards!.best!, fitsCredit: false }, bonusPick: { ...okFacts.cards!.bonusPick!, fitsCredit: false } } });
  assert.ok(!noFit.some((m) => m.ref.startsWith("card:") || m.ref.startsWith("bonus:")), "no card or bonus move outside the credit range");
  assert.deepEqual(noFit.map((m) => m.ref), ok.filter((m) => !m.ref.startsWith("card:") && !m.ref.startsWith("bonus:")).map((m) => m.ref));
  const fitOk = deterministicMoves({ ...okFacts, cards: { ...okFacts.cards!, best: { ...okFacts.cards!.best!, fitsCredit: true }, bonusPick: { ...okFacts.cards!.bonusPick!, fitsCredit: null } } });
  assert.deepEqual(fitOk.map((m) => m.ref), ok.map((m) => m.ref), "fits or no range: same moves as before");
  // Fits, but paying interest with no cushion: still gated by the ladder.
  assert.ok(!deterministicMoves({ ...user, cards: { ...user.cards!, best: { ...user.cards!.best!, fitsCredit: true } } }).some((m) => m.ref.startsWith("card:")));
  const bonus = ok.find((m) => m.ref.startsWith("bonus:"))!;
  assert.ok(bonus.once && bonus.yearly_impact === 750 && /\$95 yearly fee/.test(bonus.why), "bonus is once");
  assert.ok(ok.find((m) => m.ref.startsWith("card:"))!.once === false);
  assert.equal(ok.at(-1)!.step, 7);
  const k2 = ok.find((m) => m.ref === "room:k401")!;
  // Oct 22 to Dec 31 is 2.3 months: $2,000 spare a month; the $6,000 cash is the full fund (3 x half of $4,000 spending).
  assert.ok(k2.yearly_impact > 0 && k2.yearly_impact < 22200 * 0.12, "funded only as far as spare money goes");
  assert.equal(ok.find((m) => m.ref === "match")!.yearly_impact, 535);

  // Implausible data: a note, and no big move built on it. Interest stays first.
  const odd = { ...user, debts: [{ kind: "card" as const, balance: 410 }] };
  assert.equal(sanity(odd), DOUBT_NOTE);
  assert.equal(sanity({ ...user, futureShare: 0.6 }), DOUBT_NOTE);
  const oms = deterministicMoves(odd);
  assert.equal(oms[0].ref, "interest");
  assert.ok(oms[0].yearly_impact === 0 && oms[0].confidence === "low" && /looks off/.test(oms[0].gate!));

  // The model can't raise the gate, add new credit, bring new numbers or drop the goal and spending moves.
  const reply = { summary: "x", moves: [
    { ref: "room:k401", kind: "earn", title: "Max your 401(k)", why: "Put in $22,200 to save $2,664.", yearly_impact: 2664, effort: "5 min", steps: ["Log in", "Raise it", "Check"], confidence: "high" },
    { ref: "other", kind: "signup", title: "Open the Venture card for a $750 bonus", why: "Worth $750.", yearly_impact: 750, effort: "30 min", steps: ["Apply", "Spend", "Pay"], confidence: "medium" },
    { ref: "interest", kind: "card", title: "Stop paying card interest", why: "You paid $3,300 in 90 days, about $9,999 a year.", yearly_impact: 9999, effort: "1 hour+", steps: ["One", "Two", "Three"], confidence: "high" },
  ] };
  const pp = parsePlan(JSON.stringify(reply), user, ms);
  assert.ok(!("error" in pp));
  if (!("error" in pp)) {
    const pk = pp.moves.find((m) => m.ref === "room:k401")!;
    assert.equal(pk.yearly_impact, 0, "gate holds");
    assert.equal(pk.gate, k.gate);
    assert.equal(pk.why, k.why, "a new dollar figure reverts to the code text");
    assert.ok(!pp.moves.some((m) => /venture/i.test(m.title)), "new credit dropped");
    const pi = pp.moves.find((m) => m.ref === "interest")!;
    assert.equal(pi.why, ms[0].why, "$9,999 isn't a code figure");
    assert.equal(pi.yearly_impact, ms[0].yearly_impact);
    for (const ref of ["overspend", "fund:starter", "goal:debt", "subs", "spike:Food and drink", "match", "tax:withholding-owed"]) assert.ok(pp.moves.some((m) => m.ref === ref), `kept ${ref}`);
    assert.equal(pp.moves[0].ref, "interest");
  }
}

// The dashboard's one sentence of why: a dollar figure the title doesn't have.
assert.equal(whyLine("Stop paying card interest", "You paid $82 in card interest in 90 days, about $333 a year. Counted at half, since paying down takes time."), "You paid $82 in card interest in 90 days, about $333 a year.");
assert.equal(whyLine("Build a $492 starter emergency fund", "The rule used here: one month of spending. That is about $492. You have $120 available now."), "You have $120 available now.");
assert.equal(whyLine("Ask your landlord", "Asking early helps. You can compare."), "Asking early helps.");

// Goal targets and investing. Spare $2,000 a month, no card interest, $9,000 cash = past the $6,000 full fund.
{
  const ready: Facts = { ...facts, interest90: 0, fees90: 0, budget: { income: 6000, spend: 4000, cash: 9000, essentials: 1500, essentialsAll: false } };
  const home = { goal: "Buy a home", amount: 60000, by: "2028-10", saved: 12000 };
  const ms = deterministicMoves({ ...ready, goals: ["Buy a home"], goalPlans: [home] });
  const g = ms.find((m) => m.ref === "goal:buy-a-home")!;
  assert.equal(g.step, 5, "within 5 years: next to the emergency fund");
  assert.match(g.title, /\$2,000 a month/, "$48,000 over 24 months");
  assert.match(g.why, /which covers it/);
  assert.match(g.steps[0], /high-interest savings/, "US home deposit: savings, not shares");
  assert.ok(!deterministicMoves({ ...ready, goals: [], goalPlans: [home] }).some((m) => m.ref.startsWith("goal:buy")), "target ignored once the goal is unticked");
  const tight = deterministicMoves({ ...ready, goals: ["Buy a home"], goalPlans: [{ ...home, by: "2027-04" }] }).find((m) => m.ref === "goal:buy-a-home")!;
  assert.match(tight.why, /takes about 24 months/, "short of spare money: says how long it really takes");
  assert.match(deterministicMoves({ ...ready, country: "GB", goals: ["Buy a home"], goalPlans: [home] }).find((m) => m.ref === "goal:buy-a-home")!.steps[0], /Lifetime ISA/);
  assert.match(deterministicMoves({ ...ready, country: "CA", goals: ["Save for kids' college"], goalPlans: [{ goal: "Save for kids' college", amount: 50000, by: "2040-09" }] }).find((m) => m.ref.startsWith("goal:save"))!.steps[0], /RESP/);
  assert.equal(deterministicMoves({ ...ready, goals: ["Save for kids' college"], goalPlans: [{ goal: "Save for kids' college", amount: 50000, by: "2040-09" }] }).find((m) => m.ref.startsWith("goal:save"))!.step, 6, "far off: invested, step 6");
  assert.ok(deterministicMoves({ ...ready, interest90: 300, goals: ["Buy a home"], goalPlans: [home] }).find((m) => m.ref === "goal:buy-a-home")!.gate, "card interest gates the goal");

  const inv = deterministicMoves({ ...ready, goals: ["Invest more"], risk: "I'd sell" }).find((m) => m.ref === "invest")!;
  assert.equal(inv.step, 6);
  assert.match(inv.why, /bonds and cash/);
  assert.match(inv.steps[0], /401\(k\) up to the match/);
  assert.match(deterministicMoves({ ...ready, country: "NZ", goals: ["Invest more"] }).find((m) => m.ref === "invest")!.steps[0], /KiwiSaver/);
  assert.doesNotMatch(deterministicMoves({ ...ready, country: "GB", goals: ["Invest more"] }).find((m) => m.ref === "invest")!.steps.join(" "), /401\(k\)|IRA|HSA/);
  assert.ok(!deterministicMoves({ ...ready, interest90: 300, goals: ["Invest more"] }).some((m) => m.ref === "invest"), "no investing while paying card interest");
  assert.ok(!deterministicMoves({ ...ready, budget: { ...ready.budget!, cash: 3000 }, goals: ["Invest more"] }).some((m) => m.ref === "invest"), "no investing before the full fund");
}

console.log("plan ok");
