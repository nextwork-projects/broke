// Run: node src/lib/transfers.test.ts
import assert from "node:assert/strict";
import { pairTransfers } from "./transfers.ts";

const chk = { id: "chk", name: "Everyday Checking", mask: "1234" }, card = { id: "card", name: "Capital One", mask: "9876" };
const t = (id: string, date: string, amount: number, account: typeof chk, kind: string | null = "transfer") => ({ id, date, amount, account, category: { kind } });

let p = pairTransfers([t("out", "2026-10-01", 500, chk), t("in", "2026-10-03", -500, card)]);
assert.deepEqual([...p.hidden], ["in"]);
assert.equal(p.to.get("out"), "Capital One ··9876");

p = pairTransfers([t("out", "2026-10-01", 500, chk), t("in", "2026-10-03", -500, card, null)]);
assert.equal(p.hidden.size, 1, "one side marked transfer is enough");
assert.equal(pairTransfers([t("out", "2026-10-01", 500, chk, "spend"), t("in", "2026-10-03", -500, card, "income")]).hidden.size, 0, "a refund that happens to match isn't a transfer");
assert.equal(pairTransfers([t("out", "2026-10-01", 500, chk), t("in", "2026-10-09", -500, card)]).hidden.size, 0, "too far apart");
assert.equal(pairTransfers([t("out", "2026-10-01", 500, chk), t("in", "2026-10-02", -499, card)]).hidden.size, 0, "different amount");
assert.equal(pairTransfers([t("out", "2026-10-01", 500, chk), t("in", "2026-10-02", -500, chk)]).hidden.size, 0, "same account");
p = pairTransfers([t("o1", "2026-10-01", 500, chk), t("o2", "2026-10-15", 500, chk), t("i1", "2026-10-02", -500, card), t("i2", "2026-10-16", -500, card)]);
assert.deepEqual([...p.hidden].sort(), ["i1", "i2"], "each money-in pairs once");
assert.equal(pairTransfers([t("in", "2026-10-03", -500, card)]).hidden.size, 0, "partner not in the list: shown");
console.log("transfers ok");
