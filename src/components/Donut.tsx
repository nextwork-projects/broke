"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { CategoryIcon } from "@/components/Icons";
import { EASE, firstVisit, reduced } from "@/components/motion";
import { useMoney } from "@/components/Money";

type Slice = { id: string; label: string; color: string; icon: string; v: number; prev: number };

// Donut + category list sharing one hover: hovering a slice or a row lifts that slice,
// dims the others, and swaps the centre to that category's total.
export function Breakdown({ slices, total, change, prevLabel, monthParam }: { slices: Slice[]; total: number; change: number | null; prevLabel: string; monthParam: string }) {
  const { money, money0 } = useMoney();
  const [hover, setHover] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const sum = slices.reduce((s, x) => s + x.v, 0) || 1;
  const R = 100, r = 64, C = 120;

  let a0 = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const a1 = a0 + (s.v / sum) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    // Rounded: Math.cos/sin can differ in the last digit between Node and the browser, which breaks hydration.
    const p = (a: number, rad: number) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = slices.length === 1
      ? `M${C},${C - R} A${R},${R} 0 1 1 ${C - 0.01},${C - R} L${C - 0.01},${C - r} A${r},${r} 0 1 0 ${C},${C - r} Z`
      : `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
    const round = (n: number) => Math.round(n * 100) / 100;
    const out = { dx: round(Math.cos(mid) * 6), dy: round(Math.sin(mid) * 6) };
    const icon = { x: round(C + ((R + r) / 2) * Math.cos(mid)), y: round(C + ((R + r) / 2) * Math.sin(mid)) };
    a0 = a1;
    return { s, d, out, icon, big: s.v / sum > 0.06 };
  });

  useGSAP(
    () => {
      if (reduced() || !firstVisit("breakdown")) return;
      const slices = gsap.utils.toArray<SVGElement>("[data-slice]");
      gsap.set(slices, { transition: "none" });
      gsap.from(slices, {
        scale: 0.6, opacity: 0, transformOrigin: "120px 120px", duration: 0.6, ease: "back.out(1.4)", stagger: 0.04,
        // Hand transform/opacity back to the hover styles once the intro is done.
        onComplete: () => void gsap.set(slices, { clearProps: "transform,opacity,transition" }),
      });
      gsap.from("[data-row]", { x: -8, opacity: 0, duration: 0.3, ease: EASE, stagger: 0.03, delay: 0.2, clearProps: "transform,opacity" });
    },
    { scope: root },
  );

  const h = slices.find((s) => s.id === hover);
  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div ref={root} className="space-y-6">
      <div className="relative w-full max-w-72 mx-auto aspect-square" onPointerLeave={() => setHover(null)}>
        <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible">
          {arcs.map(({ s, d, out }) => (
            <path
              key={s.id}
              data-slice
              d={d}
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth="2"
              onPointerEnter={() => setHover(s.id)}
              className="cursor-pointer transition-[transform,opacity] duration-300 ease-[cubic-bezier(.33,1,.68,1)]"
              style={{ transform: hover === s.id ? `translate(${out.dx}px, ${out.dy}px)` : undefined, opacity: hover && hover !== s.id ? 0.35 : 1 }}
            />
          ))}
        </svg>
        {arcs.filter((a) => a.big).map(({ s, icon }) => (
          <span key={s.id} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface/90 pointer-events-none transition-opacity duration-300" style={{ left: `${(icon.x / 240) * 100}%`, top: `${(icon.y / 240) * 100}%`, opacity: hover && hover !== s.id ? 0.3 : 1 }}>
            <CategoryIcon icon={s.icon} color={s.color} size={26} />
          </span>
        ))}
        <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
          {h ? (
            <div key={h.id}>
              <div className="text-xs" style={{ color: h.color }}>{h.label}</div>
              <div className="text-2xl font-semibold tabular">{money(h.v)}</div>
              <div className="text-xs text-muted mt-1">{pct(h.v)}% of spend</div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-muted">Total spend</div>
              <div className="text-2xl font-semibold tabular">{money(total)}</div>
              {change !== null && (
                <div className="text-xs text-muted flex items-center justify-center gap-1 mt-1">
                  {change > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(change)}% from {prevLabel}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ul onPointerLeave={() => setHover(null)}>
        {slices.map((c) => {
          const delta = c.v - c.prev;
          return (
            <li key={c.id} data-row>
              <Link
                href={`/transactions?category=${c.id}${monthParam}`}
                onPointerEnter={() => setHover(c.id)}
                onFocus={() => setHover(c.id)}
                className={`row-hover flex items-center gap-4 py-3 px-3 -mx-3 border-t border-line ${hover === c.id ? "bg-[var(--hover)]" : ""}`}
              >
                <CategoryIcon icon={c.icon} color={c.color} size={36} />
                <div className="flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted">{pct(c.v)}% of spend</div>
                </div>
                <span className={`hidden @md:inline text-xs tabular ${delta > 0 ? "text-bad" : "text-good"}`}>{delta > 0 ? "↑" : "↓"} {money0(Math.abs(delta))}</span>
                <span className="w-24 text-right tabular font-medium">{money(c.v)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
