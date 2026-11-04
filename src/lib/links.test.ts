// Run: node src/lib/links.test.ts
import assert from "node:assert/strict";
import { duplicateItems, sameAccounts } from "./links.ts";

const wf = [{ mask: "8640", type: "depository" }, { mask: "4381", type: "credit" }];
assert.equal(sameAccounts(wf, wf), true);
assert.equal(sameAccounts([{ mask: "8640" }], wf), true, "linking one account you already have");
assert.equal(sameAccounts([{ mask: "1111" }], wf), false, "a new account at the same bank");
assert.equal(sameAccounts([{ mask: null }], wf), false, "no masks: can't tell, so allowed");
assert.equal(sameAccounts(wf, []), false);

const items = [
  { id: "wf1", institution_id: "ins_127991", created_at: "2026-10-29T15:20", accounts: wf },
  { id: "co1", institution_id: "ins_128026", created_at: "2026-10-29T15:30", accounts: [{ mask: "0954", type: "credit" }] },
  { id: "wf2", institution_id: "ins_127991", created_at: "2026-10-29T15:31", accounts: wf },
  { id: "co2", institution_id: "ins_128026", created_at: "2026-10-29T15:32", accounts: [{ mask: "0954", type: "credit" }] },
  { id: "co3", institution_id: "ins_128026", created_at: "2026-10-29T15:40", accounts: [{ mask: "7777", type: "credit" }] },
];
assert.deepEqual([...duplicateItems(items)], [["wf2", "wf1"], ["co2", "co1"]]);
console.log("links ok");
