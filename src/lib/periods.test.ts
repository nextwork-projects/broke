// node src/lib/periods.test.ts
import assert from "node:assert/strict";
import { asPeriod, comparable, cumulative, periodWindow } from "./periods.ts";

const day = (s: string) => new Date(s + "T00:00:00Z");
const thu = day("2026-10-22");

const w = periodWindow("week", thu);
assert.equal(w.start.toISOString().slice(0, 10), "2026-10-19", "week starts Monday");
assert.equal(w.prevStart.toISOString().slice(0, 10), "2026-10-12");
assert.equal(w.elapsed, 4);
const sun = periodWindow("week", day("2026-10-25"));
assert.equal(sun.start.toISOString().slice(0, 10), "2026-10-19", "Sunday belongs to the week that began Monday");

const m = periodWindow("month", thu);
assert.equal(m.start.toISOString().slice(0, 10), "2026-10-01");
assert.equal(m.prevStart.toISOString().slice(0, 10), "2026-09-01");
assert.equal(m.elapsed, 22);
assert.equal(periodWindow("month", day("2026-01-15")).prevStart.toISOString().slice(0, 10), "2025-12-01", "January looks back to December");

const q = periodWindow("3m", thu);
assert.equal(q.n, 90);
assert.equal(cumulative([{ day: "2026-10-23", spend: 4 }, { day: "2026-10-22", spend: 1 }], q.start, q.end, q.elapsed).at(-1), 5, "last 90 days takes tomorrow's row on today");
assert.equal(q.start.toISOString().slice(0, 10), "2026-07-25");
assert.equal(q.prevStart.toISOString().slice(0, 10), "2026-04-26");

const y = periodWindow("year", thu);
assert.equal(y.start.toISOString().slice(0, 10), "2026-01-01");
assert.equal(y.elapsed, 295);

assert.deepEqual(cumulative([{ day: "2026-10-01", spend: 5 }, { day: "2026-10-03", spend: 2 }, { day: "2026-09-30", spend: 99 }], day("2026-10-01"), 4), [5, 5, 7, 7]);
// A row dated tomorrow (Plaid in UTC) counts on today's point, not dropped. Rows past the window still are.
assert.deepEqual(cumulative([{ day: "2026-10-01", spend: 5 }, { day: "2026-10-03", spend: 2 }, { day: "2026-10-05", spend: 9 }], day("2026-10-01"), 4, 2), [5, 7]);

// The comparison needs a real previous period.
const oct = periodWindow("month", thu);
const daysOf = (from: string, n: number, spend = 20) => Array.from({ length: n }, (_, i) => ({ day: new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10), spend }));
assert.equal(comparable([...daysOf("2026-09-23", 1, 1800), ...daysOf("2026-10-01", 23)], oct, thu), false, "1 day of September vs 23 of October: hidden");
assert.equal(comparable([...daysOf("2026-09-01", 20), ...daysOf("2026-10-01", 22)], oct, thu), true);
assert.equal(comparable([...daysOf("2026-09-01", 20, 1), ...daysOf("2026-10-01", 22)], oct, thu), false, "under $50 last month: hidden");
assert.equal(asPeriod("nope"), "month");
console.log("periods ok");
