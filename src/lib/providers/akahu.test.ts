// node src/lib/providers/akahu.test.ts
// Sample JSON follows the example responses in Akahu's docs (2026-10-22); ids and amounts are made up.
import assert from "node:assert/strict";
import { akahuAccounts, akahuTransactions, toAccount, toTxn, type Tokens } from "./akahu.ts";

const ACCOUNTS = { success: true, items: [
  { _id: "acc_1", name: "Everyday", status: "ACTIVE", type: "CHECKING", formatted_account: "38-9000-0123456-00",
    connection: { _id: "conn_kb", name: "Kiwibank", logo: "https://example.test/kb.png" }, balance: { current: 1520.33, available: 1500, currency: "NZD" } },
  { _id: "acc_2", name: "Visa", status: "ACTIVE", type: "CREDITCARD", formatted_account: "4835-****-****-1234",
    connection: { name: "ASB" }, balance: { current: -412.5, available: 3587.5, limit: 4000, currency: "NZD" } },
] };
const PAGE1 = { success: true, items: [
  { _id: "trans_1", _account: "acc_1", date: "2026-10-01T00:00:00.000Z", description: "COUNTDOWN PONSONBY", amount: -84.2, type: "EFTPOS",
    merchant: { name: "Countdown" }, category: { name: "Supermarkets and grocery stores" }, meta: { logo: "https://example.test/cd.png" } },
], cursor: { next: "abc" } };
const PAGE2 = { success: true, items: [
  { _id: "trans_2", _account: "acc_1", date: "2026-10-02T00:00:00.000Z", description: "ACME LTD SALARY", amount: 3150, type: "CREDIT" },
], cursor: { next: null } };

const tok: Tokens = { app: "app_token_x", user: "user_token_y" };
const calls: { url: string; headers: Record<string, string> }[] = [];
const fake = (async (url: string, init: { headers: Record<string, string> }) => {
  calls.push({ url, headers: init.headers });
  const body = url.includes("/accounts") ? ACCOUNTS : url.includes("cursor=abc") ? PAGE2 : PAGE1;
  return new Response(JSON.stringify(body), { status: 200 });
}) as unknown as typeof fetch;

const accts = (await akahuAccounts(tok, fake)).map(toAccount);
assert.deepEqual(calls[0].headers, { Authorization: "Bearer user_token_y", "X-Akahu-Id": "app_token_x" });
assert.equal(accts[0].plaid_account_id, "akahu:acc_1");
assert.equal(accts[0].type, "depository");
assert.equal(accts[0].mask, "3456");
assert.equal(accts[1].type, "credit");
assert.equal(accts[1].mask, "1234");
assert.equal(accts[1].current_balance, 412.5, "card debt is positive, like Plaid");
assert.equal(accts[1].credit_limit, 4000);

const txns = (await akahuTransactions(tok, "2026-09-01T00:00:00.000Z", fake)).map(toTxn);
assert.equal(calls.length, 3, "follows cursor.next until null");
assert.match(calls[1].url, /start=2026-09-01/);
assert.deepEqual(txns.map((t) => [t.plaid_transaction_id, t.date, t.amount, t.merchant_name]), [
  ["akahu:trans_1", "2026-10-01", 84.2, "Countdown"],
  ["akahu:trans_2", "2026-10-02", -3150, null],
]);

const failing = (async () => new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 })) as unknown as typeof fetch;
await assert.rejects(akahuAccounts(tok, failing), (e: Error & { code?: string }) => e.code === "AKAHU_401");

console.log("akahu ok");
