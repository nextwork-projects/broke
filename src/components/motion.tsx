"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { useMoney } from "@/components/Money";

gsap.registerPlugin(useGSAP);

// Motion tokens: 0.15 / 0.3 / 0.6 s, ease-out cubic-bezier(.33,1,.68,1) ~ power2.out.
export const EASE = "power2.out";
// Entrance animations play once per page, not again when only the query string changes
// (switching month, toggling bills). Module state survives client navigations.
const introduced = new Set<string>();
// Marked a tick later: React's dev Strict Mode runs each effect twice in a row (run, undo, run), and marking
// on the first run made the surviving second run skip, so charts snapped to their end state instead of animating.
export function firstVisit(key: string) {
  if (introduced.has(key)) return false;
  setTimeout(() => introduced.add(key));
  return true;
}
let lastPath = "";
export function pathChanged() {
  const p = typeof window === "undefined" ? "" : window.location.pathname;
  // Not on the first page load: the animation would change elements React is still hydrating, which it flags as an error.
  const changed = !!lastPath && p !== lastPath;
  setTimeout(() => (lastPath = p)); // same Strict Mode reason as firstVisit
  return changed;
}

// GSAP intros on elements that also carry CSS hover transitions: the CSS transition re-eases every frame GSAP
// writes, which stutters. Turn transitions off for the tween, then hand the element back to CSS.
export const withoutCssTransition = (targets: gsap.TweenTarget) => ({
  onStart: () => void gsap.set(targets, { transition: "none" }),
  onComplete: () => void gsap.set(targets, { clearProps: "transition" }),
});

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cards fade in whenever a page mounts. Kept short: the content is already there, the fade only delays reading it.
export function Reveal({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!pathChanged() || reduced()) return;
      gsap.from(root.current!.querySelectorAll(".card, .section-label, .pill-tabs"), {
        y: 4,
        opacity: 0,
        duration: 0.18,
        ease: EASE,
        stagger: { amount: 0.06 }, // the whole stagger, however many cards
        clearProps: "transform,opacity",
      });
    },
    { scope: root },
  );
  return <div ref={root}>{children}</div>;
}

// Tweens a money figure up from 0 the first time its page shows; later visits show the value at once.
export function CountUp({ value, format }: { value: number; format: "money" | "money0" }) {
  const el = useRef<HTMLSpanElement>(null);
  const fmt = useMoney()[format];
  useGSAP(
    () => {
      if (reduced() || !firstVisit(`count:${location.pathname}`)) return;
      const o = { n: 0 };
      gsap.to(o, { n: value, duration: 0.5, ease: "power3.out", onUpdate: () => void (el.current!.textContent = fmt(o.n)) });
    },
    { dependencies: [value] },
  );
  return <span ref={el} className="tabular">{fmt(value)}</span>;
}
