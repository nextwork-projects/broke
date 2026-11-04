"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { useRef, useState } from "react";
import { firstVisit, reduced, withoutCssTransition } from "@/components/motion";
import { useMoney } from "@/components/Money";

// Heights from the last render, so a month switch (which remounts the page) tweens old -> new.
const lastHeights = new Map<string, number>();

type Bar = { key: string; label: string; v: number; income: number; href: string; active: boolean };

// Six months of what came in beside what went out. Bars grow in; hovering one lifts it and dims the rest; clicking opens that month.
export function MonthBars({ bars }: { bars: Bar[] }) {
  const { money, money0 } = useMoney();
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.v, b.income)));

  useGSAP(
    () => {
      const els = gsap.utils.toArray<HTMLElement>("[data-bar]");
      const target = bars.map((b) => (b.v / max) * 100);
      if (!reduced()) {
        if (firstVisit("month-bars")) {
          gsap.set(els, { transition: "none" });
          gsap.from(els, { scaleY: 0, transformOrigin: "bottom", duration: 0.6, ease: "power3.out", stagger: 0.05, onComplete: () => void gsap.set(els, { clearProps: "transform,transition" }) });
          gsap.from("[data-in]", { scaleY: 0, transformOrigin: "bottom", duration: 0.6, ease: "power3.out", stagger: 0.05, clearProps: "transform" });
          gsap.from("[data-val]", { opacity: 0, y: 6, duration: 0.3, delay: 0.35, stagger: 0.05 });
        } else {
          els.forEach((el, i) => {
            const from = lastHeights.get(bars[i].key);
            if (from !== undefined && from !== target[i]) gsap.fromTo(el, { height: `${from}%` }, { height: `${target[i]}%`, duration: 0.3, ease: "power2.out", ...withoutCssTransition(el) });
          });
        }
      }
      bars.forEach((b, i) => lastHeights.set(b.key, target[i]));
    },
    { scope: root, dependencies: [bars.map((b) => `${b.v}/${b.income}`).join()] },
  );

  return (
    <div ref={root} className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="card-title">Income vs expenses</div>
      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--good)" }} />Income</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--chart)" }} />Expenses</span>
      </div>
    </div>
    <div className={`flex items-end h-44 ${bars.length > 8 ? "gap-1 @lg:gap-2" : "gap-3 @lg:gap-6"}`} onPointerLeave={() => setHover(null)}>
      {bars.map((b) => {
        const lit = hover ? hover === b.key : b.active;
        const dim = hover && hover !== b.key;
        return (
          <Link
            key={b.key}
            href={b.href}
            scroll={false}
            onPointerEnter={() => setHover(b.key)}
            onFocus={() => setHover(b.key)}
            aria-label={`${b.label}: ${money(b.income)} in, ${money(b.v)} out`}
            className="group relative flex-1 flex flex-col items-center gap-2 h-full justify-end rounded-xl"
          >
            <span data-val className={`text-[10px] @lg:text-[11px] tabular whitespace-nowrap transition-colors duration-150 ${b.income - b.v < 0 ? "text-bad" : lit ? "text-ink font-medium" : "text-muted"}`}>{b.v || b.income ? `${b.income - b.v < 0 ? "-" : "+"}${money0(Math.abs(b.income - b.v))}` : ""}</span>
            <div className="w-full max-w-16 flex-1 flex items-end gap-0.5">
              <div
                data-in
                className="flex-1 rounded-t-lg transition-opacity duration-150"
                style={{ height: `${(b.income / max) * 100}%`, minHeight: b.income ? 2 : 0, background: "var(--good)", opacity: dim ? 0.3 : lit ? 1 : 0.55 }}
              />
              <div
                data-bar
                className="flex-1 rounded-t-lg transition-[background-color,opacity,transform] duration-150 ease-[cubic-bezier(.33,1,.68,1)] group-hover:-translate-y-0.5"
                style={{
                  height: `${(b.v / max) * 100}%`,
                  minHeight: 2,
                  background: lit ? "var(--chart)" : "var(--chart-mute)",
                  opacity: dim ? 0.55 : 1,
                }}
              />
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-md transition-colors duration-150 ${b.active ? "bg-ink text-on-ink" : lit ? "bg-canvas text-ink" : "text-muted"}`}>{b.label}</span>
            {hover === b.key && (b.v > 0 || b.income > 0) && (
              <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-on-ink text-[11px] rounded-lg px-2.5 py-1 shadow-lg pointer-events-none z-10">
                {money0(b.income)} in · {money0(b.v)} out
              </span>
            )}
          </Link>
        );
      })}
    </div>
    </div>
  );
}
