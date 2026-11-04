"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type T = { id: number; text: string; undo?: () => void; action?: { label: string; run: () => void } };
let push: (t: Omit<T, "id">) => void = () => {};

// Confirms an edit and offers Undo (and one more action) for 5 s. Call from anywhere on the client.
export const toast = (text: string, undo?: () => void, action?: T["action"]) => push({ text, undo, action });

// An open modal dialog makes the rest of the page inert, so toasts render inside the top one.
let hosts: HTMLElement[] = [];
let setHost: (h: HTMLElement | null) => void = () => {};
export function toastHost(el: HTMLElement) {
  hosts = [...hosts, el];
  setHost(el);
  return () => {
    hosts = hosts.filter((h) => h !== el);
    setHost(hosts.at(-1) ?? null);
  };
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  const [host, setH] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let n = 0;
    const drop = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
    // Stays while hovered or focused, so keyboard users and slow readers can reach Undo.
    const expire = (id: number): unknown => setTimeout(() => (document.querySelector(`[data-toast="${id}"]:is(:hover, :focus-within)`) ? expire(id) : drop(id)), 5000);
    push = (t) => {
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      expire(id);
    };
    setHost = setH;
    setH(hosts.at(-1) ?? null);
    return () => {
      push = () => {};
      setHost = () => {};
    };
  }, []);
  const done = (t: T, run: () => void) => {
    run();
    setItems((xs) => xs.filter((x) => x.id !== t.id));
  };
  const region = (
    <div role="status" aria-live="polite" className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 w-max max-w-[calc(100vw-32px)] flex flex-col items-center gap-2 pointer-events-none">
      {items.map((t) => (
        <div key={t.id} data-toast={t.id} className="pointer-events-auto flex items-center gap-4 bg-[#141414] text-white ring-1 ring-white/10 text-sm rounded-full pl-5 pr-2 py-2 shadow-[0_12px_30px_-10px_#00000066] animate-[fade_.15s_ease-out]">
          {t.text}
          {t.action && (
            <button type="button" onClick={() => done(t, t.action!.run)} className="rounded-full px-3 py-1 font-medium text-[#b9c6f8] hover:bg-white/10">
              {t.action.label}
            </button>
          )}
          {t.undo ? (
            <button type="button" onClick={() => done(t, t.undo!)} className="rounded-full px-3 py-1 font-medium text-[#b9c6f8] hover:bg-white/10">
              Undo
            </button>
          ) : (
            <span className="w-2" />
          )}
        </div>
      ))}
    </div>
  );
  return host ? createPortal(region, host) : region;
}
