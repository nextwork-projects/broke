// Run: node src/lib/providers/feeds.test.ts
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { basiqAccount, basiqStart, basiqTxn, belvoAccount, belvoStart, belvoTxn, ebAccount, ebJwt, ebStart, ebTxn, feedData, pemFrom, validCpf } from "./feeds.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

// A key pasted into a one-line box still signs, and the JWT has the documented shape.
const env = { ENABLE_BANKING_APP_ID: "app-1", ENABLE_BANKING_PRIVATE_KEY: pem.replace(/\n/g, " ") };
assert.equal(pemFrom(pem.replace(/\n/g, "\\n")), pem);
const jwt = ebJwt(env, 1_000_000);
const [h, c, sig] = jwt.split(".");
assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { typ: "JWT", alg: "RS256", kid: "app-1" });
const claims = JSON.parse(Buffer.from(c, "base64url").toString());
assert.equal(claims.iss, "enablebanking.com");
assert.equal(claims.aud, "api.enablebanking.com");
assert.ok(claims.exp - claims.iat <= 86400);
assert.ok(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url")));

// Enable Banking: direction from the indicator, settled only, card balance owed as positive.
const out = ebTxn({ transaction_id: "t1", booking_date: "2026-10-02", transaction_amount: { amount: "45.10" }, credit_debit_indicator: "DBIT", status: "BOOK", remittance_information: ["TESCO", "LONDON"], creditor: { name: "Tesco" } }, "u1")!;
assert.deepEqual([out.amount, out.name, out.merchant_name, out.account_ref, out.date], [45.1, "TESCO LONDON", "Tesco", "enablebanking:u1", "2026-10-02"]);
assert.equal(ebTxn({ transaction_id: "t2", booking_date: "2026-10-03", transaction_amount: { amount: "2000" }, credit_debit_indicator: "CRDT", status: "BOOK", debtor: { name: "Acme" } }, "u1")!.amount, -2000);
assert.equal(ebTxn({ transaction_id: "t3", booking_date: "2026-10-03", transaction_amount: { amount: "5" }, credit_debit_indicator: "DBIT", status: "PDNG" }, "u1"), null);
assert.equal(ebTxn({ transaction_id: "t4", booking_date: "2026-10-03", transaction_amount: { amount: "5" }, status: "BOOK" }, "u1"), null); // no direction: never guessed
// No id from the bank: stable across syncs.
const noId = { booking_date: "2026-10-03", transaction_amount: { amount: "5" }, credit_debit_indicator: "DBIT", status: "BOOK", note: "x" };
assert.equal(ebTxn(noId, "u1")!.plaid_transaction_id, ebTxn(noId, "u1")!.plaid_transaction_id);
const card = ebAccount({ uid: "u2", product: "Visa", cash_account_type: "CARD", currency: "EUR", account_id: { iban: "DE89370400440532013000" } }, [{ balance_type: "OTHR", balance_amount: { amount: "1", currency: "EUR" } }, { balance_type: "CLBD", balance_amount: { amount: "-250.5", currency: "EUR" } }], "ING");
assert.deepEqual([card.type, card.current_balance, card.mask, card.name, card.currency], ["credit", 250.5, "3000", "Visa", "EUR"]);
assert.equal(ebAccount({ uid: "u3", cash_account_type: "SVGS" }, [], "ING").subtype, "savings");

// Consent never asks for longer than the bank allows.
{
  const calls: { url: string; body?: { access: { valid_until: string }; redirect_url: string } }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(String(url).includes("/aspsps") ? { aspsps: [{ name: "ING", country: "DE", maximum_consent_validity: 864000 }] } : { url: "https://bank/consent" }));
  }) as typeof fetch;
  assert.equal(await ebStart(env, { bank: "ING", country: "DE", state: "s", redirect: "https://me/cb" }, f, 0), "https://bank/consent");
  assert.equal(calls[1].body!.access.valid_until, new Date(864000 * 1000).toISOString());
}

// Paging stops when there's no continuation key, and old balances still map.
{
  const seen: string[] = [];
  const f = (async (url: string) => {
    seen.push(String(url));
    if (String(url).includes("/balances")) return new Response(JSON.stringify({ balances: [{ balance_type: "CLBD", balance_amount: { amount: "10", currency: "GBP" } }] }));
    const second = String(url).includes("continuation_key=k");
    return new Response(JSON.stringify({ transactions: [{ transaction_id: second ? "b" : "a", booking_date: "2026-10-02", transaction_amount: { amount: "1" }, credit_debit_indicator: "DBIT", status: "BOOK" }], continuation_key: second ? null : "k" }));
  }) as typeof fetch;
  const r = await feedData("enablebanking", env, JSON.stringify({ accounts: [{ uid: "u", cash_account_type: "CACC" }] }), "2026-01-01T00:00:00Z", f);
  assert.equal(r.txns.length, 2);
  assert.equal(r.accounts[0].current_balance, 10);
}

// Basiq: outgoing is negative there, positive here; only posted rows.
assert.equal(basiqTxn({ id: "1", account: "a", postDate: "2026-10-02T00:00:00Z", amount: "-45.10", status: "posted", description: "WOOLWORTHS" })!.amount, 45.1);
assert.equal(basiqTxn({ id: "2", account: "a", postDate: "2026-10-02", amount: "100.00", status: "posted" })!.amount, -100);
assert.equal(basiqTxn({ id: "3", account: "a", postDate: null, amount: "-1", status: "pending" }), null);
assert.deepEqual([basiqAccount({ id: "x", class: { type: "credit-card" }, balance: "-90.00" }).type, basiqAccount({ id: "x", class: { type: "credit-card" }, balance: "-90.00" }).current_balance], ["credit", 90]);
assert.equal(basiqAccount({ id: "y", class: { type: "transaction" }, balance: "5" }).subtype, "checking");
{
  const f = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/token")) { assert.equal((init!.headers as Record<string, string>).Authorization, "Basic key"); return new Response(JSON.stringify({ access_token: String(init!.body).includes("CLIENT") ? "client" : "server" })); }
    return new Response(JSON.stringify({ id: "user1" }));
  }) as typeof fetch;
  const s = await basiqStart({ BASIQ_API_KEY: "key" }, { email: "a@b.co", state: "st" }, f);
  assert.equal(s.userId, "user1");
  assert.equal(s.url, "https://consent.basiq.io/home?token=client&state=st");
}

// Belvo: always positive, type gives direction; no type is skipped, never guessed.
assert.equal(belvoTxn({ id: "1", account: { id: "a" }, value_date: "2026-10-02", amount: 45.1, type: "OUTFLOW", status: "PROCESSED" })!.amount, 45.1);
assert.equal(belvoTxn({ id: "2", account: { id: "a" }, value_date: "2026-10-02", amount: 45.1, type: "INFLOW", status: "PROCESSED" })!.amount, -45.1);
assert.equal(belvoTxn({ id: "3", account: { id: "a" }, value_date: "2026-10-02", amount: 45.1, type: null }), null);
assert.equal(belvoTxn({ id: "4", account: { id: "a" }, value_date: "2026-10-02", amount: 1, type: "OUTFLOW", status: "PENDING" }), null);
assert.deepEqual([belvoAccount({ id: "c", category: "CREDIT_CARD", balance_type: "LIABILITY", balance: { current: -300 } }).type, belvoAccount({ id: "c", category: "CREDIT_CARD", balance_type: "LIABILITY", balance: { current: -300 } }).current_balance], ["credit", 300]);
assert.equal(validCpf("761.092.776-73"), true);
assert.equal(validCpf("123"), false);
{
  let sent: Record<string, unknown> = {};
  const f = (async (_: string, init?: RequestInit) => { sent = JSON.parse(String(init!.body)); return new Response(JSON.stringify({ access: "tok" })); }) as typeof fetch;
  const url = await belvoStart({ BELVO_SECRET_ID: "i", BELVO_SECRET_PASSWORD: "p", BELVO_TERMS_URL: "https://t" }, { cpf: "761.092.776-73", name: " Ana ", origin: "https://me", callback: "https://me/cb", state: "st", externalId: "u-1" }, f);
  const w = sent.widget as { openfinance_feature: string; consent: { identification_info: { number: string; name: string }[] }; callback_urls: { success: string } };
  assert.equal(w.openfinance_feature, "consent_link_creation");
  assert.deepEqual(w.consent.identification_info[0], { type: "CPF", number: "76109277673", name: "Ana" });
  assert.ok(w.callback_urls.success.includes("kind=success"));
  assert.equal(url, "https://widget.belvo.io/?access_token=tok&locale=pt&access_mode=recurrent&external_id=u-1");
}

console.log("feeds: ok");
