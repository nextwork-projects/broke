"use client";

import { useEffect, useRef, useState } from "react";
import { useMoney } from "@/components/Money";

// A money string with its cents set smaller and lighter ("$2,340.00" -> "$2,340" + ".00"). class "money" lets Hide
// balances blur it. Works on any locale's string: "1.234,56 €" splits at ",56". No cents (JPY) shows as is.
export function Amount({ text, className = "" }: { text: string; className?: string }) {
  const m = text.match(/^(.*?\d)([.,]\d{2})(\D*)$/);
  return <span className={`money ${className}`}>{m ? <>{m[1]}<span className="cents">{m[2]}</span>{m[3]}</> : text}</span>;
}

// A headline figure that rolls up to its value once, on first paint. Reduced motion shows the value at once.
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const { money } = useMoney();
  const [n, setN] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    done.current = true;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 450);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <Amount text={money(n)} className={className} />;
}

// Hide balances: blurs every .money on the page. Saved in this browser; the root layout applies it before paint. H toggles it.
export function HideMoney() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(document.documentElement.classList.contains("hide-money"));
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "h" || e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      flip();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function flip() {
    const next = !document.documentElement.classList.contains("hide-money");
    document.documentElement.classList.toggle("hide-money", next);
    setOn(next);
    try { if (next) localStorage.setItem("hideMoney", "1"); else localStorage.removeItem("hideMoney"); } catch {}
  }
  return (
    <button onClick={flip} aria-pressed={on} title={on ? "Show balances (H)" : "Hide balances (H)"} aria-label={on ? "Show balances" : "Hide balances"}
      className={`size-8 grid place-items-center rounded-lg ${on ? "bg-brand-soft text-brand" : "text-muted hover:text-ink hover:bg-[var(--hover)]"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{on && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}
