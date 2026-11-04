"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { firstVisit, reduced } from "@/components/motion";
import { useMoney } from "@/components/Money";
import { at, DEFAULT_RETURN, flows, HORIZONS, project, RETURNS, SAVINGS_RATE, type Later, type PMove, type Point } from "@/lib/projection";

// The breakdown's three kinds, in a fixed order (validated: adjacent pairs pass CVD and normal-vision checks in light and dark).
// Saving green and the tax blue are the plan's own section hues; kept is the cards hue.
const KINDS = [
  { key: "invested", label: "Invested and growth", color: "#3f8a52", of: (p: Point) => p.put + p.growth },
  { key: "tax", label: "Tax saved", color: "#6f8cf2", of: (p: Point) => p.tax },
  { key: "kept", label: "Kept", color: "#a24f7c", of: (p: Point) => p.kept },
] as const;
const YEARS_LABEL = (y: number) => (y === 1 ? "1 year" : `${y} years`);
const pctLabel = (r: number) => `${Math.round(r * 100)}%`;

// Clean axis steps: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(max: number, n = 4) {
  const raw = Math.max(1, max / n), p = Math.pow(10, Math.floor(Math.log10(raw)));
  return ([1, 2, 2.5, 5, 10].find((s) => s * p >= raw) ?? 10) * p;
}
const sum = (p: Point, q: Point): Point => ({ kept: p.kept + q.kept, tax: p.tax + q.tax, put: p.put + q.put, growth: p.growth + q.growth, total: p.total + q.total });

export function PayoffChart({ moves, today, rate, later, note }: { moves: PMove[]; today: string; rate: number | null; later: Later | null; note: string | null }) {
  const { money0, dateLabel, locale, currency } = useMoney();
  const [years, setYears] = useState<number>(5);
  const [growth, setGrowth] = useState<number>(DEFAULT_RETURN);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // The viewBox follows the real width, so text stays 12px and the plot only stretches sideways.
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width) - 8)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fs = useMemo(() => flows(moves, today, rate, later), [moves, today, rate, later]);
  const months = years * 12;
  const { counted, possible, progress } = useMemo(() => {
    const opts = { months: 360, growth };
    return {
      counted: project(fs.filter((f) => f.layer === "counted"), opts),
      possible: project(fs.filter((f) => f.layer === "later"), opts),
      progress: at(project(fs.filter((f) => f.layer === "counted" && f.done), { months: 0, growth }), 0),
    };
  }, [fs, growth]);
  const end = at(counted, months), endLater = at(possible, months);
  const hasLater = possible.some((p) => p.total >= 1);
  const hasInvested = fs.some((f) => f.bucket === "invested" || f.bucket === "savings");
  const doneMoves = moves.filter((m) => m.status === "done" && Number(m.yearly_impact) > 0);
  const since = doneMoves.map((m) => m.done_at).filter(Boolean).sort()[0] ?? null;

  // Chart geometry, the same frame as SpendChart: values on the right, months along the bottom.
  const H = 170, R = 56;
  const top = Math.max(1, ...counted.slice(0, months + 1).map((p, i) => p.total + possible[i].total));
  const step = niceStep(top), max = Math.ceil(top / step) * step;
  const x = (i: number) => (i / months) * (W - R);
  const y = (v: number) => H - (v / max) * H;
  const pts = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const cTop = counted.slice(0, months + 1).map((p) => p.total);
  const lTop = cTop.map((v, i) => v + possible[i].total);
  const band = `${pts(lTop)} L${[...cTop].reverse().map((v, k) => `${x(months - k).toFixed(1)},${y(v).toFixed(1)}`).join(" L")} Z`;
  const grid = Array.from({ length: Math.round(max / step) }, (_, k) => (k + 1) * step);
  const tickYears = years === 1 ? [0, 3, 6, 9, 12] : years === 5 ? [0, 12, 24, 36, 48, 60] : years === 10 ? [0, 24, 48, 72, 96, 120] : [0, 60, 120, 180, 240, 300, 360];
  const tickLabel = (m: number) => (m === 0 ? (W < 420 ? "Now" : "Today") : years === 1 ? (m === 12 ? "1 yr" : `${m} mo`) : `${m / 12} yr${m === 12 ? "" : "s"}`);
  const compact = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
  const monthOf = (m: number) => dateLabel(new Date(Date.parse(today) + m * 30.44 * 864e5), { month: "short", year: "numeric" });

  useGSAP(
    () => {
      if (reduced() || !firstVisit(`payoff-${years}`)) return;
      const path = svg.current!.querySelector<SVGPathElement>("[data-line]");
      if (!path) return;
      const len = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" });
      gsap.from("[data-band]", { opacity: 0, duration: 0.6, delay: 0.5, ease: "power2.out" });
    },
    { scope: svg, dependencies: [years] },
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * (W + 8) - 4;
    setHover(Math.max(0, Math.min(months, Math.round((px / (W - R)) * months))));
  }
  function onKey(e: React.KeyboardEvent) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(months, (h ?? (d > 0 ? -1 : months + 1)) + d * (years === 1 ? 1 : 12))));
  }
  const h = hover;
  // The tooltip sits beside the crosshair when it fits, else is clamped inside the chart: it never leaves the card.
  const tip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (h === null || !tip.current) return;
    const tw = tip.current.offsetWidth, cx = x(h) + 4, room = W + 8;
    const left = cx + 12 + tw <= room ? cx + 12 : cx - 12 - tw >= 0 ? cx - 12 - tw : Math.max(0, Math.min(room - tw, cx - tw / 2));
    tip.current.style.left = `${left}px`;
  });
  const whole = sum(end, endLater);
  const chip = (active: boolean) => `pill-tab !py-1 !px-3 ${active ? "pill-tab-active" : ""}`;

  return (
    <section className="card p-6 md:p-7 space-y-5" aria-labelledby="payoff-title">
      <div className="space-y-4">
        <div id="payoff-title" className="card-title">What following your plan could be worth</div>
        <div role="group" aria-label="How far ahead" className="pill-tabs">
          {HORIZONS.map((yr) => (
            <button key={yr} type="button" onClick={() => { setYears(yr); setHover(null); }} aria-pressed={yr === years} className={chip(yr === years)}>{YEARS_LABEL(yr)}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex-1 min-w-56 space-y-1">
          <div className="figure">{money0(end.total)}<span className="text-base font-normal tracking-normal text-muted"> in {YEARS_LABEL(years)}</span></div>
          <div className="text-sm text-muted tabular-nums">
            {growth > 0 && end.growth >= 1 ? <>Of which {money0(end.growth)} is growth. </> : null}
            {hasLater && endLater.total >= 1 && <>Up to {money0(endLater.total)} more is possible later.</>}
            {end.total < 1 && !hasLater && <>Nothing in your plan adds money yet.</>}
          </div>
        </div>
        {progress.total >= 1 && since && (
          <div className="space-y-0.5 min-w-44">
            <div className="section-label">Your progress so far</div>
            <div className="text-xl font-semibold tracking-[-0.02em]">{money0(progress.total)}</div>
            <div className="text-xs text-muted">Kept and invested from {doneMoves.length} done move{doneMoves.length === 1 ? "" : "s"} since {dateLabel(since, { month: "short", day: "numeric" })}</div>
          </div>
        )}
      </div>

      <div ref={box} className="relative">
        <svg
          ref={svg}
          viewBox={`-4 -8 ${W + 8} ${H + 38}`}
          className="w-full touch-none outline-none"
          role="img"
          tabIndex={0}
          aria-label={`Following your plan reaches ${money0(end.total)} in ${YEARS_LABEL(years)}${hasLater ? `, and up to ${money0(endLater.total)} more is possible later` : ""}. If nothing changes it stays at ${money0(0)}. Use the left and right arrow keys to read each point.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {grid.map((t) => (
            <g key={t}>
              <line x1={0} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={W - R + 8} y={y(t) + 4} fontSize="12" fill="var(--muted)" className="tabular">{compact(t)}</text>
            </g>
          ))}
          {hasLater && <path data-band d={band} fill="var(--chart-soft)" />}
          {hasLater && <path data-band d={pts(lTop)} fill="none" stroke="var(--chart-mute)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          <line x1={0} x2={W - R} y1={H} y2={H} stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
          <path data-line d={pts(cTop)} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(months)} cy={y(cTop[months])} r="5" fill="var(--chart)" stroke="var(--surface)" strokeWidth="2" />
          {h !== null && (
            <g pointerEvents="none">
              <line x1={x(h)} x2={x(h)} y1={0} y2={H} stroke="var(--ink)" strokeOpacity="0.25" />
              {hasLater && <circle cx={x(h)} cy={y(lTop[h])} r="4" fill="var(--chart-mute)" stroke="var(--surface)" strokeWidth="2" />}
              <circle cx={x(h)} cy={y(cTop[h])} r="4" fill="var(--chart)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
          {tickYears.map((m, k) => (
            <text key={m} x={x(m)} y={H + 22} fontSize="12" fill="var(--muted)" textAnchor={k === 0 ? "start" : k === tickYears.length - 1 ? "end" : "middle"}>{tickLabel(m)}</text>
          ))}
        </svg>

        {h !== null && (
          <div
            ref={tip}
            className="absolute -top-2 pointer-events-none bg-ink text-on-ink text-xs rounded-xl px-3 py-2 shadow-lg whitespace-nowrap"
          >
            <div className="text-on-ink/60 mb-0.5">{h === 0 ? "Today" : monthOf(h)}</div>
            <div className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-chart" />Following your plan</span><span className="tabular font-medium">{money0(cTop[h])}</span></div>
            {hasLater && <div className="flex justify-between gap-4 text-on-ink/80"><span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full" style={{ background: "var(--chart-mute)" }} />Possible later</span><span className="tabular">+{money0(possible[h].total)}</span></div>}
            <div className="flex justify-between gap-4 text-on-ink/70"><span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full" style={{ background: "var(--muted)" }} />If nothing changes</span><span className="tabular">{money0(0)}</span></div>
            {growth > 0 && counted[h].growth >= 1 && <div className="text-on-ink/60 mt-0.5">Of which {money0(counted[h].growth)} is growth</div>}
          </div>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted mt-1">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-chart" />Following your plan</span>
          {hasLater && <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ background: "var(--chart-soft)", boxShadow: "inset 0 2px 0 var(--chart-mute)" }} />Possible later</span>}
          <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full" style={{ background: "var(--muted)" }} />If nothing changes</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="section-label">In {YEARS_LABEL(years)}, by what it is</div>
          {hasLater && <div className="text-xs text-muted">Including possible later</div>}
        </div>
        <Breakdown p={hasLater ? whole : end} />
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        {hasInvested && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">Growth on invested money</span>
            <div role="group" aria-label="Return a year" className="pill-tabs">
              {RETURNS.map((r) => (
                <button key={r} type="button" onClick={() => setGrowth(r)} aria-pressed={r === growth} className={chip(r === growth)}>{r ? pctLabel(r) : "None"}</button>
              ))}
            </div>
          </div>
        )}
        <ul className="text-xs text-muted space-y-1">
          {hasInvested && <li>{growth > 0 ? `Assumes ${pctLabel(growth)} a year before inflation. Markets go up and down; this is not a promise.` : "No growth: invested money is counted as what goes in."}</li>}
          {fs.some((f) => f.bucket === "savings") && <li>Savings and your emergency fund earn {pctLabel(SAVINGS_RATE)} a year, a typical high-yield savings rate.</li>}
          <li>Kept money and tax saved are counted as cash, with no growth. Invested counts the money you put in and any employer match.</li>
          {hasLater && later && <li>{laterText(later, money0)}</li>}
          <li>Each value comes from a move in your plan. Moves with no dollar figure are left out.</li>
        </ul>
        {note && (
          <p className="flex gap-2 items-start rounded-2xl bg-canvas px-4 py-3 text-sm" role="note">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" />
            <span>{note} Moves built on those numbers are not counted here.</span>
          </p>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">See the numbers</summary>
        <table className="mt-3 w-full text-left tabular">
          <thead className="text-xs text-muted">
            <tr><th className="font-normal py-1">When</th><th className="font-normal py-1 text-right">Following your plan</th>{hasLater && <th className="font-normal py-1 text-right">Possible later</th>}<th className="font-normal py-1 text-right">Of which growth</th></tr>
          </thead>
          <tbody>
            {tickYears.map((m) => (
              <tr key={m} className="border-t border-line">
                <td className="py-1.5">{tickLabel(m)}</td>
                <td className="py-1.5 text-right">{money0(counted[m].total)}</td>
                {hasLater && <td className="py-1.5 text-right">+{money0(possible[m].total)}</td>}
                <td className="py-1.5 text-right">{money0(counted[m].growth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function laterText(l: Later, money0: (n: number) => string) {
  const what = l.first.map((x) => (x === "card" ? "card debt is paid off" : "the starter fund is built")).join(" and ");
  const start = l.delay === 0 ? "Possible later starts now: nothing in the steps above is in the way." : l.why === "spare"
    ? `Possible later starts in ${l.delay} month${l.delay === 1 ? "" : "s"}, once ${what}, timed from your spare money a month.`
    : `Possible later starts in ${l.delay} months, once ${what}. You have no spare money a month yet, so ${l.delay} months is assumed.`;
  const fund = l.fund > 0 ? ` It includes your ${money0(l.fund)} emergency fund, built over ${l.fundMonths} months.` : "";
  return `${start}${fund} HSA, 401(k) and IRA moves count once, at this year's room left. Other gated moves count every year at their full value.`;
}

function Breakdown({ p }: { p: Point }) {
  const { money0 } = useMoney();
  const parts = KINDS.map((k) => ({ ...k, v: Math.max(0, k.of(p)) }));
  const total = parts.reduce((s, x) => s + x.v, 0);
  const shown = parts.filter((x) => x.v >= 1);
  return (
    <div className="space-y-3">
      {total >= 1 && (
        <div className="flex h-2.5 gap-0.5" aria-hidden>
          {shown.map((x, i) => (
            <span key={x.key} className={`h-full ${i === 0 ? "rounded-l" : ""} ${i === shown.length - 1 ? "rounded-r" : ""}`} style={{ width: `${(x.v / total) * 100}%`, minWidth: 4, background: x.color }} />
          ))}
        </div>
      )}
      <ul className="flex flex-col @md:flex-row @md:flex-wrap gap-x-8 gap-y-2 text-sm">
        {parts.map((x) => (
          <li key={x.key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm shrink-0" style={{ background: x.color }} />
            <span className="flex-1 @md:flex-none text-muted">{x.label}</span>
            <span className="tabular font-medium">{money0(x.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
