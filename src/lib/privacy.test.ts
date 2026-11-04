// Run: node src/lib/privacy.test.ts
import assert from "node:assert/strict";
import {
  accountsSummary, bankEvent, checkinSummary, levelFor, mask, modeOf, newNames, profileForModel, ph, recurringSummary, roundMoney, scrubJson, scrubText, searchSummary, spendSummary, unmask, unmaskStream, withAi, type Row,
} from "./privacy.ts";

// Fixture: real-looking names, a mask, exact amounts and day dates that must not survive.
const SECRET_NAMES = ["Netflix", "Blue Bottle Coffee", "Whole Foods", "Comcast", "Chase Total Checking", "Acme Payroll"];
const SECRET_BITS = ["4321", "15.49", "1234.56", "87.13", "79.99", "2026-10-14", "2026-09-03", "2026-10-31"];
const rows: Row[] = [
  { date: "2026-10-14", amount: 15.49, merchant: "Netflix", category: "Entertainment", spend: true, income: false },
  { date: "2026-10-14", amount: 87.13, merchant: "Whole Foods", category: "Groceries", spend: true, income: false },
  { date: "2026-09-03", amount: 6.25, merchant: "Blue Bottle Coffee", category: "Coffee", spend: true, income: false },
  { date: "2026-09-03", amount: 1234.56, merchant: "Comcast", category: "Bills", spend: true, income: false },
  { date: "2026-09-03", amount: -3100.42, merchant: "Acme Payroll", category: "Income", spend: false, income: true },
];
const names = newNames();
const out = JSON.stringify([
  spendSummary(rows, names),
  searchSummary(rows.filter((r) => r.spend), names),
  recurringSummary([{ merchant_name: "Netflix", frequency: "MONTHLY", average_amount: 15.49, next_date: "2026-10-31", is_income: false }, { merchant_name: "Comcast", frequency: "MONTHLY", average_amount: 79.99, next_date: "2026-10-31", is_income: false }], names),
  accountsSummary([{ name: "Chase Total Checking", type: "depository", subtype: "checking", current_balance: 1234.56, available_balance: 1200.01, credit_limit: null, included: true }], names),
  scrubJson({ bills: [{ merchant_name: "Netflix", amount: 15.49, date: "2026-10-14", cancel_url: "https://www.netflix.com/cancelplan" }], account: { name: "Chase Total Checking", mask: "4321" }, cancel_instructions: "Cancel Netflix. I pay $15.49 a month." }, names),
  checkinSummary({ unusual: [{ date: "2026-10-14", merchant: "Whole Foods", amount: 87.13, usual: 40 }], newSubs: [], priceUps: [{ merchant: "Comcast", usual: 79.99, last: 87.13 }], upcoming: [{ merchant: "Netflix", date: "2026-10-31", amount: 15.49 }], upcomingTotal: 15.49, cash: 1234.56 }, names),
]);
for (const s of [...SECRET_NAMES, ...SECRET_BITS]) assert.ok(!out.toLowerCase().includes(s.toLowerCase()), `summary leaked ${s}`);
assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(out), "no day-level dates");
assert.ok(!/netflix\.com/.test(out), "no cancel links");
assert.match(out, /a streaming service, about \$15 a month/);
assert.match(out, /⟨M\d+⟩/);

// Rounding rule.
assert.equal(roundMoney(15.49), 15);
assert.equal(roundMoney(2.1), 5); // a real charge never shows as zero
assert.equal(roundMoney(87.13), 85);
assert.equal(roundMoney(1234.56), 1200);
assert.equal(roundMoney(-3100.42), -3100);
assert.equal(roundMoney(456.7), 460);

// Placeholders: stable tokens, and they round-trip.
const n2 = newNames();
const a = ph(n2, "Merchant", "Blue Bottle Coffee");
assert.equal(a, "⟨M1⟩");
assert.equal(ph(n2, "Subscription", "Netflix"), "⟨S1⟩");
assert.equal(ph(n2, "Merchant", "blue bottle coffee"), a, "same name, same placeholder");
assert.equal(ph(n2, "Merchant", "Netflix"), "⟨S1⟩", "a name keeps its first placeholder");
for (let i = 0; i < 30; i++) ph(n2, "Merchant", `Shop ${i}`);
assert.equal(n2.fwd.get("shop 29"), "⟨M31⟩");
const text = "You spent more at Blue Bottle Coffee than on Netflix. Shop 29 too.";
const masked = mask(text, n2);
assert.equal(masked, "You spent more at ⟨M1⟩ than on ⟨S1⟩. ⟨M31⟩ too.");
assert.equal(unmask(masked, n2), text);
assert.equal(unmask("⟨M99⟩ is unknown", n2), "a merchant is unknown", "an unknown token never reaches the screen");
assert.equal(unmask("Spend < $500 and keep <B1> as is", n2), "Spend < $500 and keep <B1> as is");

// The leaks users saw (2026-10-22, old "Subscription 1" scheme), and what the same replies give with tokens.
const n3 = newNames();
for (const s of ["Netflix", "OpenAI", "Spotify"]) ph(n3, "Subscription", s);
ph(n3, "Merchant", "Interest");
ph(n3, "Account", "Checking");
const SEEN: [string, string, string][] = [
  // [what the user saw, what the model writes now, what the user sees now]
  ["Move Netflix, 2 and 3 to the new card.", "Move ⟨S1⟩, ⟨S2⟩ and ⟨S3⟩ to the new card.", "Move Netflix, OpenAI and Spotify to the new card."],
  ["Cancel Subscriptions 1 and 3", "Cancel ⟨S1⟩ and ⟨S3⟩", "Cancel Netflix and Spotify"],
  ["Cancel Subscriptions 1 and 3", "Cancel ⟨S1 and 3⟩", "Cancel Netflix and Spotify"],
  ["Cancel Subscriptions 1 and 3", "Cancel ⟨S1, S3⟩", "Cancel Netflix, Spotify"],
  ["Netflix and 3", "⟨S1⟩ and ⟨S3⟩", "Netflix and Spotify"],
  ["Netflix and 3", "<S1> and <S3>", "Netflix and Spotify"],
  ["Interest (Interest)", "⟨M1⟩ (Interest) costs more", "Interest costs more"],
  ["Interest (Interest)", "Interest (⟨M1⟩) costs more", "Interest costs more"],
  ["Your checking (Checking)", "Your checking (⟨A1⟩) shows $0.", "Your checking shows $0."],
  ["Your checking (Checking)", "Your checking (Checking) shows $0.", "Your checking shows $0."],
];
const LEFT = /⟨[^⟩]*⟩|\b(?:Merchant [A-Z]{1,2}|(?:Subscriptions?|Income|Account|Holding) \d+)\b|link:\d/;
for (const [saw, model, want] of SEEN) {
  assert.equal(unmask(model, n3), want, `${saw}: ${model}`);
  assert.ok(!LEFT.test(unmask(model, n3)), `no placeholder left: ${model}`);
}
assert.equal(unmask("Keep the card (a Visa) open", n3), "Keep the card (a Visa) open", "a real bracket stays");

// "Call Interest charged today": bank events show as what they are, never as a merchant.
assert.equal(bankEvent("Interest charged", "Fees"), "card or loan interest");
assert.equal(bankEvent("Internal Revenue Service", "Taxes & giving"), "tax payment");
assert.equal(bankEvent("CASH APP TRANSFER", "Transfers out"), "transfer between accounts");
assert.equal(bankEvent("Monthly payment", "Loan payments"), "card or loan payment");
assert.equal(bankEvent("Overdraft item fee", null), "bank fee");
assert.equal(bankEvent("Late charge", "Fees"), "bank fee");
assert.equal(bankEvent("Pinterest", "Shopping"), null);
assert.equal(bankEvent("Netflix", "Entertainment"), null);
const n4 = newNames();
const ev = spendSummary([
  { date: "2026-10-02", amount: 31.2, merchant: "Interest charged", category: "Fees", spend: true, income: false },
  { date: "2026-10-03", amount: 12.7, merchant: "Interest", category: "Fees", spend: true, income: false },
  { date: "2026-10-04", amount: 740, merchant: "Internal Revenue Service", category: "Taxes & giving", spend: true, income: false },
  { date: "2026-10-05", amount: 20, merchant: "Netflix", category: "Entertainment", spend: true, income: false },
], n4);
assert.deepEqual(ev.top_merchants, [
  { bank_event: "tax payment", total: 740, count: 1 },
  { bank_event: "card or loan interest", total: 45, count: 2 },
  { merchant: "⟨M1⟩", total: 20, count: 1 },
]);
assert.ok(!JSON.stringify(ev).includes("Interest charged") && !JSON.stringify(ev).includes("Revenue"));
assert.equal(n4.fwd.size, 1, "no placeholder made for a bank event");

// A name inside a link stays part of the real link; the sentence's full stop is not part of it.
const n5 = newNames();
ph(n5, "Subscription", "Netflix");
const steps = scrubText("Cancel Netflix at https://www.netflix.com/cancelplan. It costs $15.49.", n5);
assert.equal(steps, "Cancel ⟨S1⟩ at ⟨L1⟩. It costs about $15.");
assert.equal(unmask("[Cancel ⟨S1⟩](⟨L1⟩).", n5), "[Cancel Netflix](https://www.netflix.com/cancelplan).");

// Streaming: any chunking gives the same text as unmasking it whole.
for (const [reply, nm] of [
  ["**⟨M1⟩** cost the most, then ⟨S1⟩, then ⟨M31⟩.\n\u001elist_recurring\n⟨M", n2],
  ["Move ⟨S1⟩, ⟨S2⟩ and ⟨S3⟩. Your checking (⟨A1⟩) shows $0. ⟨M1⟩ (Interest) and ⟨S1 and 3⟩ (a note) <S2>", n3],
] as const) {
  for (const size of [1, 2, 3, 5, 7, 11, 64]) {
    let got = "";
    const s = unmaskStream(nm, (t) => (got += t));
    for (let i = 0; i < reply.length; i += size) s.push(reply.slice(i, i + size));
    s.flush();
    assert.equal(got, unmask(reply, nm), `chunk size ${size}`);
  }
}

// Modes: the default is summary; full detail only for the local model in "On this Mac only".
assert.equal(modeOf(undefined), "summary");
assert.equal(modeOf({ ai_mode: "nonsense" }), "summary");
assert.equal(modeOf({ ai_mode: "off" }), "off");
for (const p of ["claude", "codex", "gemini", "opencode", "local"]) {
  assert.equal(levelFor("off", p), "off");
  assert.equal(levelFor("summary", p), "summary");
  assert.equal(levelFor("local", p), p === "local" ? "full" : "summary");
}

// Off makes zero calls.
let calls = 0;
const spy = async () => (calls++, "reply");
assert.equal(await withAi(levelFor("off", "claude"), spy), null);
assert.equal(await withAi(levelFor("off", "local"), spy), null);
assert.equal(calls, 0);
assert.equal(await withAi(levelFor("summary", "claude"), spy), "reply");
assert.equal(calls, 1);

// The credit band goes to the model; a score number and notes never do.
assert.deepEqual(profileForModel({ country: "US", credit: "good", creditAsOf: "2026-09", creditScore: 712, notes: "secret" }), { country: "US", credit: "good", creditAsOf: "2026-09" });
{
  const nm = newNames();
  ph(nm, "Merchant", "Netflix");
  assert.equal((profileForModel({ notes: "I just cancelled Netflix and moved to Texas" }, nm) as { notes?: string }).notes?.includes("Netflix"), false, "names in notes are masked");
  assert.match((profileForModel({ notes: "I just cancelled Netflix and moved to Texas" }, nm) as { notes: string }).notes, /moved to Texas/);
}

// A goal the user typed never reaches a cloud model; the listed goals do.
{
  const nm = newNames();
  const out = JSON.stringify(profileForModel({ goals: ["Buy a home", "Mum's surgery"], goalPlans: [{ goal: "Mum's surgery", amount: 4321, by: "2027-06" }] }, nm));
  assert.equal(out.includes("surgery"), false, "typed goal masked");
  assert.ok(out.includes("Buy a home"), "listed goal stays");
  assert.ok(out.includes("4300"), "target rounded");
  assert.equal(unmask("Save for ⟨G1⟩", nm), "Save for Mum's surgery");
  assert.equal(JSON.stringify(profileForModel({ goals: ["Mum's surgery"], goalPlans: [{ goal: "Mum's surgery", amount: 1, by: "2027-06" }] })).includes("surgery"), false, "no names map: left out");
}

console.log("privacy: ok");
