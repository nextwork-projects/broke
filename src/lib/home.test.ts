// Run: node src/lib/home.test.ts
import assert from "node:assert/strict";
import { addDays, cashSeries, daysBetween, flows, forecast, relDay, weekVsUsual } from "./home.ts";

const today = "2026-11-10";
assert.equal(addDays(today, -10), "2026-10-31");
assert.equal(daysBetween("2026-10-31", today), 10);

// Walks back: $55 out today (a row dated after today counts as today) means yesterday ended $55 higher;
// $1000 in on the 8th means the 7th ended $1000 lower.
const s = cashSeries(500, [{ date: today, amount: 50 }, { date: "2026-11-08", amount: -1000 }, { date: "2026-11-12", amount: 5 }], today, 4);
assert.deepEqual(s.map((p) => p.value), [-445, 555, 555, 500]);
assert.equal(s[3].date, today);
assert.equal(s.length, 4);

// Forecast: bills before payday, then the pay.
const f = forecast(1000, today, [{ date: "2026-11-12", amount: 85 }, { date: "2026-11-20", amount: 70 }], { date: "2026-11-13", amount: 1850 })!;
assert.deepEqual(f, [{ date: today, value: 1000 }, { date: "2026-11-12", value: 915 }, { date: "2026-11-13", value: 2765 }]);
// No pay known: two weeks of bills, ending on the horizon.
const g = forecast(1000, today, [{ date: "2026-11-12", amount: 85 }], null)!;
assert.equal(g.at(-1)!.date, "2026-11-24");
assert.equal(g.at(-1)!.value, 915);
assert.equal(forecast(1000, today, [], null), null);

assert.deepEqual(flows([{ date: today, amount: 20 }, { date: "2026-11-04", amount: -100 }, { date: "2026-11-03", amount: 999 }], today, 7), { into: 100, out: 20 });

// Usual week: needs 4 weeks of history.
const spend = Array.from({ length: 63 },(_, i) => ({ date: addDays(today, -i), amount: 10 }));
const w = weekVsUsual(spend, today, "2026-01-01")!;
assert.equal(w.thisWeek, 70);
assert.equal(Math.round(w.usual), 70);
assert.equal(weekVsUsual(spend, today, "2026-10-20"), null);

assert.equal(relDay(today, today), "Today");
assert.equal(relDay("2026-11-09", today), "Yesterday");
assert.equal(relDay("2026-11-12", today), "in 2 days");
assert.equal(relDay("2026-11-01", today), null);
console.log("home ok");
