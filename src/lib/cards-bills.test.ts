// Run: node src/lib/cards-bills.test.ts
import assert from "node:assert/strict";
import { billOnCards, CARDS } from "./cards.ts";

const flat = CARDS.find((c) => c.id === "wells-fargo-active-cash")!; // 2% on everything
const sapphire = CARDS.find((c) => c.id === "chase-sapphire-preferred")!;
// $600 a year from checking, the user holds Active Cash: moving it earns 2%.
let r = billOnCards({ yearly: 600, cat: "other", payingCard: null }, [flat], [sapphire]);
assert.equal(r.now, 0, "a bank account earns nothing");
assert.equal(r.mine!.card.id, flat.id);
assert.ok(Math.abs(r.mine!.earn - 600 * flat.earn.other.rate * flat.pointCents / 100) < 0.01);
// Already on the best card: no gain.
r = billOnCards({ yearly: 600, cat: "other", payingCard: flat }, [flat], []);
assert.equal(r.now, r.mine!.earn);
assert.equal(r.other, null);
assert.equal(billOnCards({ yearly: 600, cat: "other", payingCard: null }, [], []).mine, null);
console.log("cards-bills ok");

// whichCard: Autograph for dining, travel and transport (3x); the 1x cards tie elsewhere.
{
  const { whichCard } = await import("./cards.ts");
  const autograph = CARDS.find((c) => c.id === "wells-fargo-autograph")!, discover = CARDS.find((c) => c.id === "discover-it")!;
  const w = Object.fromEntries(whichCard([discover, autograph]).map((x) => [x.cat, x]));
  assert.equal(w.dining.card.id, autograph.id);
  assert.equal(w.travel.rate, 3);
  assert.equal(w.transport.card.id, autograph.id);
  assert.equal(w.groceries.cents, 0.01, "1% either way");
  assert.equal(w.groceries.tie, true);
  assert.equal(w.dining.tie, false);
  assert.deepEqual(whichCard([]), []);
  console.log("whichCard ok");
}
