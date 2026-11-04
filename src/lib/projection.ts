// What following the money plan could be worth over time: kept money, money invested and its growth, and tax saved.
// Pure: no "@/" imports, so `node src/lib/projection.test.ts` runs it directly.
import { HYSA_APY } from "./insights.ts";
import { deterministicMoves, ladder, type Facts } from "./plan.ts";

// Assumptions, not quotes. Each one is named next to the chart.
export const RETURNS = [0, 0.04, 0.06, 0.08] as const; // a year, before inflation
export const DEFAULT_RETURN = 0.06;
export const SAVINGS_RATE = HYSA_APY; // emergency fund and high-yield savings: a typical high-yield rate
export const UNKNOWN_DELAY = 12; // months until gated moves start when there is no spare money to time it with
export const MAX_DELAY = 60;
export const HORIZONS = [1, 5, 10, 30] as const; // years

export type Bucket = "kept" | "tax" | "invested" | "savings";
export type PMove = {
  ref: string | null; kind: string; section: string | null; once: boolean | null; gate: string | null;
  yearly_impact: number; status: string; done_at: string | null;
};
// One stream of money: a lump at `start`, then `monthly` from `start` until `end` (exclusive). Months from today; negative is the past.
export type Flow = { layer: "counted" | "later"; bucket: Bucket; start: number; monthly: number; lump: number; end: number; done: boolean };
// Possible later, from the facts at render time: what gated moves are worth once the steps above them are done.
export type Later = {
  delay: number; why: "none" | "spare" | "unknown"; // when gated moves start, and how that was timed
  first: ("card" | "fund")[]; // what has to be done before them: card debt, the starter fund
  extra: { ref: string; yearly: number }[]; // full value minus what is counted today, by move
  fund: number; fundMonths: number; // emergency fund still to build, spread over fundMonths from today
};
export type Point = { kept: number; tax: number; put: number; growth: number; total: number };

const head = (ref: string | null) => (ref ?? "").split(":")[0];
// A tax saving that comes from putting money in (HSA, 401(k), IRA): the contribution itself is impact / rate.
const isContribution = (m: Pick<PMove, "ref">) => head(m.ref) === "room" || m.ref === "tax:ira";
export function bucketOf(m: Pick<PMove, "ref" | "kind" | "section">): Bucket {
  if (m.ref === "match") return "invested"; // employer money
  if (m.ref === "hysa") return "savings"; // extra interest on cash
  if (isContribution(m) || m.section === "tax" || m.kind === "tax") return "tax";
  return "kept";
}

export function monthsFrom(today: string, date: string) {
  return Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 864e5 / 30.44);
}

// One move -> its flows. `rate` turns a contribution's tax saving into the contribution (null outside the US: none).
function moveFlows(m: PMove, yearly: number, start: number, layer: Flow["layer"], rate: number | null, done = false): Flow[] {
  if (!(yearly > 0)) return [];
  const base = { layer, start, end: Infinity, done };
  const f = (bucket: Bucket, y: number): Flow => (m.once ? { ...base, bucket, lump: y, monthly: 0 } : { ...base, bucket, lump: 0, monthly: y / 12 });
  const out = [f(bucketOf(m), yearly)];
  if (isContribution(m) && rate && rate > 0) out.push(f("invested", yearly / rate));
  return out;
}

export function flows(moves: PMove[], today: string, rate: number | null, later: Later | null = null): Flow[] {
  const out: Flow[] = [];
  for (const m of moves) {
    const done = m.status === "done";
    if (!done && m.status !== "todo" && m.status !== "doing") continue;
    // Done moves count from the day they were done; a done move with no date counts from today.
    const start = done && m.done_at ? Math.min(0, monthsFrom(today, m.done_at)) : 0;
    out.push(...moveFlows(m, Number(m.yearly_impact), start, "counted", rate, done));
    const x = !done && m.gate && later ? later.extra.find((e) => e.ref === m.ref) : null;
    // A contribution counts once, at this year's room left: whether there is money for it every year isn't known.
    if (x) out.push(...moveFlows(isContribution(m) ? { ...m, once: true } : m, x.yearly, later!.delay, "later", rate));
  }
  if (later && later.fund > 0) out.push({ layer: "later", bucket: "savings", start: 0, end: later.fundMonths, monthly: later.fund / later.fundMonths, lump: 0, done: false });
  return out;
}

const zero = (): Point => ({ kept: 0, tax: 0, put: 0, growth: 0, total: 0 });

// Month by month, 0 = today, up to `months`. Invested money grows at `growth` a year, savings at `savings`; kept and tax money don't grow.
export function project(fs: Flow[], { months, growth, savings = SAVINGS_RATE }: { months: number; growth: number; savings?: number }): Point[] {
  const lo = Math.min(0, ...fs.map((f) => f.start));
  const gi = Math.pow(1 + growth, 1 / 12) - 1, gs = Math.pow(1 + savings, 1 / 12) - 1;
  let kept = 0, tax = 0, inv = 0, invIn = 0, sav = 0, savIn = 0;
  const out: Point[] = [];
  const add = (b: Bucket, v: number) => {
    if (b === "kept") kept += v;
    else if (b === "tax") tax += v;
    else if (b === "invested") { inv += v; invIn += v; }
    else { sav += v; savIn += v; }
  };
  for (let i = lo; i <= months; i++) {
    for (const f of fs) if (f.start === i && f.lump) add(f.bucket, f.lump);
    if (i >= 0) {
      const put = invIn + savIn, growthNow = inv - invIn + (sav - savIn);
      out.push({ kept, tax, put, growth: growthNow, total: kept + tax + put + growthNow });
    }
    if (i === months) break;
    for (const f of fs) if (f.monthly && i >= f.start && i < f.end) add(f.bucket, f.monthly);
    inv *= 1 + gi;
    sav *= 1 + gs;
  }
  return out.length ? out : [zero()];
}

// Possible later, from the facts: rebuild the moves with no affordability gate to get each one's full value,
// and time it after the steps above (card debt, then the starter fund) from the spare money a month.
export function laterOf(f: Facts, moves: PMove[]): Later {
  const L = ladder(f);
  const full = new Map(deterministicMoves({ ...f, budget: undefined }).map((m) => [m.ref, m.yearly_impact]));
  const extra = moves.flatMap((m) => {
    if (!m.gate || !m.ref || (m.status !== "todo" && m.status !== "doing")) return [];
    const y = (full.get(m.ref) ?? 0) - Number(m.yearly_impact);
    return y >= 1 ? [{ ref: m.ref, yearly: Math.round(y) }] : [];
  });
  const card = (f.debts ?? []).filter((d) => d.kind === "card").reduce((s, d) => s + d.balance, 0);
  const cash = L.b?.cash ?? 0;
  const need = (L.carrying ? card : 0) + (!L.cushion && L.starter != null ? Math.max(0, L.starter - cash) : 0);
  const spare = L.spare ?? 0;
  const why: Later["why"] = need <= 0 ? "none" : spare >= 1 ? "spare" : "unknown";
  const delay = why === "none" ? 0 : why === "spare" ? Math.min(MAX_DELAY, Math.max(1, Math.ceil(need / spare))) : UNKNOWN_DELAY;
  // The fund the plan asks for: the starter fund, or the full one once the starter is there.
  const live = moves.filter((m) => m.status === "todo" || m.status === "doing");
  const target = live.some((m) => m.ref === "fund:starter") ? L.starter : live.some((m) => m.ref === "fund:full") ? L.full : null;
  const fund = target != null ? Math.max(0, Math.round(target - cash)) : 0;
  const first = [...(L.carrying ? (["card"] as const) : []), ...(!L.cushion ? (["fund"] as const) : [])];
  return { delay, why, first, extra, fund, fundMonths: delay || UNKNOWN_DELAY };
}

// The value at a horizon, counted and possible later, from the same flows.
export function at(series: Point[], month: number): Point {
  return series[Math.min(series.length - 1, Math.max(0, month))] ?? zero();
}
