"use client";

import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/Amount";
import { useMoney } from "@/components/Money";
import type { Point } from "@/lib/home";

type Flows = { into: number; out: number };
const RANGES = [{ days: 7, label: "1W", words: "Last 7 days" }, { days: 31, label: "1M", words: "Last 30 days" }] as const;

// Home's cash card: today's balance, money in and out for the range, and the balance as a daily step line with a
// dotted forecast to payday. Hover reads the date and balance off the line.
export function CashChart({ balance, series, forecast, payday, flows }: { balance: number; series: Point[]; forecast: Point[] | null; payday: string | null; flows: Record<7 | 31, Flows> }) {
  const { money, money0, dateLabel } = useMoney();
  const [days, setDays] = useState<7 | 31>(31);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = series.slice(-days);
  const pts = [...data.map((p) => ({ ...p, f: false })), ...(forecast ?? []).slice(1).map((p) => ({ ...p, f: true }))];
  const H = 170, pad = { t: 12, b: 22, r: 46 };
  const t = (iso: string) => Date.parse(iso + "T00:00:00Z");
  const t0 = t(pts[0].date), t1 = t(pts[pts.length - 1].date);
  const vs = pts.map((p) => p.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || Math.max(1, Math.abs(hi));
  const y0 = lo - span * 0.15, y1 = hi + span * 0.15;
  const X = (iso: string) => ((t(iso) - t0) / (t1 - t0 || 1)) * (w - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const step = (list: Point[]) => list.map((p, i) => (i ? `H${X(p.date).toFixed(1)}V${Y(p.value).toFixed(1)}` : `M${X(p.date).toFixed(1)} ${Y(p.value).toFixed(1)}`)).join("");
  const line = step(data), last = data[data.length - 1];
  const ticks = [0, 0.5].map((f) => data[Math.round(f * (data.length - 1))].date).concat(pts[pts.length - 1].date);
  const grid = [y0 + (y1 - y0) * 0.25, y0 + (y1 - y0) * 0.75];
  const short = (iso: string) => dateLabel(iso, { month: "short", day: "numeric" });
  const k = (v: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v); // axis: "4.1K"
  const f = flows[days];
  const hp = hover == null ? null : pts[hover];

  function move(e: React.PointerEvent<SVGRectElement>) {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const tt = t0 + (x / (w - pad.r)) * (t1 - t0);
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(t(p.date) - tt) < Math.abs(t(pts[best].date) - tt)) best = i; });
    setHover(best);
  }

  return (
    <section className="card p-5 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Cash</span>
        <div className="seg" role="group" aria-label="Range">
          {RANGES.map((r) => <button key={r.days} aria-pressed={days === r.days} onClick={() => setDays(r.days)}>{r.label}</button>)}
        </div>
      </div>
      <CountUp value={balance} className="figure" />
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted">
        <span>{RANGES.find((r) => r.days === days)!.words}</span>
        {f.into > 0 && <span className="text-good">↗ <span className="money">{money0(f.into)}</span></span>}
        {f.out > 0 && <span className="text-bad">↘ <span className="money">{money0(f.out)}</span></span>}
      </div>
      <div ref={box} className="relative mt-3 flex-1 min-h-[170px] overflow-x-clip">
        {w > 120 && (
          <svg width={w} height={H} className="block overflow-visible" role="img" aria-label={`Cash balance, ${short(data[0].date)} to ${short(last.date)}`}>
            <defs><linearGradient id="cashfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart)" stopOpacity=".18" /><stop offset="1" stopColor="var(--chart)" stopOpacity="0" /></linearGradient></defs>
            {grid.map((v) => (
              <g key={v}>
                <line x1={0} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeDasharray="2 4" />
                <text x={w} y={Y(v) + 4} fontSize={11} fill="var(--muted)" textAnchor="end" className="money">{k(v)}</text>
              </g>
            ))}
            <path d={`${line}V${H - pad.b}H${X(data[0].date)}Z`} fill="url(#cashfill)" />
            <path d={line} fill="none" stroke="var(--chart)" strokeWidth={1.6} strokeLinejoin="round" />
            {forecast && <path d={step(forecast)} fill="none" stroke="var(--chart)" strokeWidth={1.6} strokeDasharray="3 4" opacity={0.7} />}
            {forecast && <circle cx={X(forecast[forecast.length - 1].date)} cy={Y(forecast[forecast.length - 1].value)} r={3} fill="var(--surface)" stroke="var(--chart)" strokeWidth={1.5} />}
            <circle cx={X(last.date)} cy={Y(last.value)} r={7} fill="var(--chart)" opacity={0.18} />
            <circle cx={X(last.date)} cy={Y(last.value)} r={3.5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={1.5} />
            {ticks.map((d, i) => <text key={d + i} x={X(d)} y={H - 4} fontSize={11} fill="var(--muted)" textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{short(d)}</text>)}
            {hp && (
              <g pointerEvents="none">
                <line x1={X(hp.date)} x2={X(hp.date)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" />
                <circle cx={X(hp.date)} cy={Y(hp.value)} r={4} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
            <rect x={0} y={0} width={w - pad.r} height={H} fill="transparent" onPointerMove={move} onPointerLeave={() => setHover(null)} />
          </svg>
        )}
        {hp && (
          <div className="absolute top-0 pointer-events-none card px-2.5 py-1.5 text-xs whitespace-nowrap -translate-x-1/2"
            style={{ left: Math.max(70, Math.min(w - 70, X(hp.date))), boxShadow: "var(--shadow-pop)" }}>
            <span className={hp.f ? "text-brand" : "text-muted"}>{hp.f ? "Forecast · " : ""}{dateLabel(hp.date, { weekday: "short", month: "short", day: "numeric" })}</span>
            <span className="block text-[13px] font-medium money">{money(hp.value)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-1">
        <span className="flex items-center gap-1.5"><i className="w-3.5 border-t-[1.6px] border-chart" />Balance</span>
        {forecast && <span className="flex items-center gap-1.5"><i className="w-3.5 border-t-[1.6px] border-dashed border-chart" />Forecast to {payday ? `payday, ${short(payday)}` : short(forecast[forecast.length - 1].date)}</span>}
      </div>
    </section>
  );
}
