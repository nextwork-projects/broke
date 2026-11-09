// A made-up bank for trying broke without a Plaid account: three accounts and about three months of everyday money,
// with pay, rent, bills, subscriptions, one unusual month and card payments. The same every time (seeded), dated back
// from today. Pure, no "@/" imports: `node src/lib/demo.test.ts` runs it. Amounts use broke's sign: positive = money out.

export type DemoAccount = { key: string; name: string; type: string; subtype: string; mask: string; balance: number };
export type DemoTxn = { key: string; account: string; date: string; amount: number; name: string; category: string };
export type DemoStream = { merchant: string; account: string; frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; amount: number; category: string; income: boolean; last: string; next: string };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: "checking", name: "Everyday Checking", type: "depository", subtype: "checking", mask: "4021", balance: 2340 },
  { key: "savings", name: "Savings", type: "depository", subtype: "savings", mask: "7730", balance: 3200 },
  { key: "card", name: "Rewards Card", type: "credit", subtype: "credit card", mask: "1188", balance: 612 },
];

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => day(new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5));

export function demoBank(today: string) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const start = addDays(today, -95);
  const txns: DemoTxn[] = [];
  const add = (account: string, date: string, amount: number, name: string, category: string) => {
    if (date >= start && date <= today) txns.push({ key: `${txns.length}`, account, date, amount, name, category });
  };
  const days = Array.from({ length: 96 }, (_, i) => addDays(start, i));
  const monthsIn = [...new Set(days.map((d) => d.slice(0, 7)))];

  // Pay every other Friday.
  const firstFriday = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5)!;
  for (let d = firstFriday; d <= today; d = addDays(d, 14)) add("checking", d, -1850, "Acme Corp Payroll", "INCOME");
  for (const m of monthsIn) {
    add("checking", `${m}-01`, 1450, "Parkside Apartments Rent", "RENT_AND_UTILITIES");
    add("checking", `${m}-02`, 200, "Transfer to Savings", "TRANSFER_OUT");
    add("savings", `${m}-02`, -200, "Transfer from Checking", "TRANSFER_IN");
    add("checking", `${m}-12`, between(72, 96), "PG&E", "RENT_AND_UTILITIES");
    add("card", `${m}-05`, 15.49, "Netflix", "ENTERTAINMENT");
    add("card", `${m}-09`, 11.99, "Spotify", "ENTERTAINMENT");
    add("card", `${m}-15`, 24.99, "Planet Fitness", "PERSONAL_CARE");
    add("card", `${m}-18`, 70, "Verizon", "RENT_AND_UTILITIES");
    add("card", `${m}-${String(3 + Math.floor(rand() * 20)).padStart(2, "0")}`, between(40, 120), "Target", "GENERAL_MERCHANDISE");
  }
  for (const d of days) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 3) add("card", d, between(38, 110), rand() < 0.6 ? "Trader Joe's" : "Safeway", "GROCERIES");
    if (dow === 1 || dow === 4 || dow === 6) add("card", d, between(6, 38), ["Chipotle", "Starbucks", "Sweetgreen"][Math.floor(rand() * 3)], "FOOD_AND_DRINK");
    if (dow === 2 || dow === 5) add("card", d, between(12, 30), "Uber", "TRANSPORTATION");
    if (dow === 6) add("card", d, between(38, 55), "Shell", "TRANSPORTATION");
    if (d.endsWith("-07") || d.endsWith("-21")) add("card", d, between(18, 90), "Amazon", "GENERAL_MERCHANDISE");
  }
  // One unusual month: a flight, so a budget built from the usual month isn't set by it.
  if (monthsIn.length >= 2) add("card", `${monthsIn[1]}-14`, 420, "Delta Air Lines", "TRAVEL");
  // Each month the card is paid off from checking: money out of checking, money in on the card.
  for (const m of monthsIn.slice(1)) {
    const prev = monthsIn[monthsIn.indexOf(m) - 1];
    const owed = Math.round(txns.filter((t) => t.account === "card" && t.date.startsWith(prev)).reduce((s, t) => s + t.amount, 0) * 100) / 100;
    add("checking", `${m}-25`, owed, "Rewards Card Payment", "CREDIT_CARD_PAYMENT");
    add("card", `${m}-25`, -owed, "Payment Thank You", "CREDIT_CARD_PAYMENT");
  }
  txns.sort((a, b) => a.date.localeCompare(b.date));

  const last = (name: string) => txns.filter((t) => t.name === name).at(-1)?.date ?? today;
  const nextMonthly = (d: string) => day(new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)))));
  const streams: DemoStream[] = [
    { merchant: "Acme Corp Payroll", account: "checking", frequency: "BIWEEKLY", amount: 1850, category: "INCOME", income: true, last: last("Acme Corp Payroll"), next: addDays(last("Acme Corp Payroll"), 14) },
    ...([["Parkside Apartments Rent", "checking", 1450, "RENT_AND_UTILITIES"], ["PG&E", "checking", 85, "RENT_AND_UTILITIES"], ["Netflix", "card", 15.49, "ENTERTAINMENT"], ["Spotify", "card", 11.99, "ENTERTAINMENT"], ["Planet Fitness", "card", 24.99, "PERSONAL_CARE"], ["Verizon", "card", 70, "RENT_AND_UTILITIES"]] as const)
      .map(([merchant, account, amount, category]) => ({ merchant, account, frequency: "MONTHLY" as const, amount, category, income: false, last: last(merchant), next: nextMonthly(last(merchant)) })),
  ];
  return { accounts: DEMO_ACCOUNTS, txns, streams };
}
