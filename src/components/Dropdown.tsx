"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reduced } from "@/components/motion";

export type Option = { value: string; label: string; icon?: React.ReactNode; hint?: string; disabled?: boolean };

// One select for the whole app: animated menu, check on the current value, optional search, keyboard
// (arrows, Enter, Esc, a letter jumps to the first match), disabled rows. The menu renders in a portal at a
// fixed position, so cards that clip their overflow (the transactions table) can't cut it off. Inside a modal
// <dialog> it portals into the dialog, since everything outside it is inert.
// A select-only combobox: focus stays on the trigger (or the search box), aria-activedescendant names the row.
// variant: "pill" (filters), "field" (forms, needs a placeholder), "inline" (a table cell: icon + label only).
export function Dropdown({
  label, value, options, onChange, searchable = false, placeholder, variant = placeholder !== undefined ? "field" : "pill", dark = false, footer,
}: {
  label: string; value: string; options: Option[]; onChange: (v: string) => void; searchable?: boolean; placeholder?: string;
  variant?: "pill" | "field" | "inline"; dark?: boolean; footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width?: number; maxH: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? (variant === "pill" ? options[0] : undefined);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const optId = (i: number) => `${id}-${i}`;
  const activeId = open && pos && shown[active] ? optId(active) : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // Below the button, or above when there isn't room. Closes on scroll/resize instead of chasing the button.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const below = innerHeight - r.bottom - 16, above = r.top - 16;
    const up = below < 260 && above > below;
    const width = variant === "field" ? r.width : undefined;
    const left = Math.max(8, Math.min(r.left, innerWidth - Math.max(width ?? 240, 240) - 8));
    setPos(up ? { bottom: innerHeight - r.top + 8, left, width, maxH: Math.min(360, above) } : { top: r.bottom + 8, left, width, maxH: Math.min(360, below) });
    const close = (e: Event) => !(e.target instanceof Node && menu.current?.contains(e.target)) && setOpen(false); // a window resize has no Node target
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    return () => {
      removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !button.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useGSAP(
    () => {
      if (open && pos && menu.current && !reduced()) gsap.fromTo(menu.current, { opacity: 0, y: pos.top ? -6 : 6, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: "power2.out" });
    },
    { dependencies: [open, !!pos] },
  );

  function show(next: boolean) {
    if (next) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    else setPos(null);
    setOpen(next);
    setQ("");
  }

  function pick(o: Option) {
    if (o.disabled) return;
    onChange(o.value);
    show(false);
    button.current?.focus();
  }

  // Next enabled row in a direction, or stay put.
  function step(from: number, dir: 1 | -1) {
    for (let i = from + dir; i >= 0 && i < shown.length; i += dir) if (!shown[i].disabled) return i;
    return from;
  }

  // Typeahead: the next enabled row (after the active one, wrapping) whose label starts with the letter.
  function jump(key: string, from: number) {
    const k = key.toLowerCase();
    for (let n = 1; n <= options.length; n++) {
      const i = (from + n) % options.length;
      if (!options[i].disabled && options[i].label.toLowerCase().startsWith(k)) return setActive(i);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    // Keys on the footer action are its own (Enter clicks it), except leaving the menu.
    if (foot.current?.contains(e.target as Node) && e.key !== "Escape" && e.key !== "Tab") return;
    const letter = !searchable && e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (!open && (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) || letter)) {
      e.preventDefault();
      show(true);
      if (letter) jump(e.key, options.findIndex((o) => o.value === value));
      return;
    }
    if (!open) return;
    // preventDefault on Escape also stops a surrounding <dialog> from closing.
    if (e.key === "Escape") { e.preventDefault(); show(false); button.current?.focus(); }
    // Focus the trigger first so Tab moves on from it, not from the menu at the end of the page.
    else if (e.key === "Tab") {
      // Tab from the search box goes on into the footer action; anywhere else it closes the menu.
      const intoFooter = footer && !e.shiftKey && menu.current?.contains(e.target as Node) && !foot.current?.contains(e.target as Node);
      if (!intoFooter) { show(false); button.current?.focus(); }
    }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => step(a, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => step(a, -1)); }
    else if ((e.key === "Enter" || (e.key === " " && !searchable)) && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (letter) { e.preventDefault(); jump(e.key, active); }
  }

  const changed = value !== options[0]?.value;
  const trigger = {
    pill: `flex items-center gap-2 text-sm pl-3.5 pr-3 py-1.5 rounded-full whitespace-nowrap ${open ? "bg-[var(--hover-strong)]" : changed ? "bg-ink text-on-ink hover:bg-ink/85" : "hover:bg-[var(--hover)]"}`,
    field: `w-full flex items-center gap-2.5 text-sm text-left bg-surface border rounded-xl px-3.5 py-2.5 transition-colors ${open ? "border-ink" : "border-line hover:border-muted/50"}`,
    inline: `group inline-flex items-center gap-2.5 rounded-full pr-2.5 text-left ${dark ? `hover:text-white ${open ? "text-white" : "text-white/50"}` : open ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]"}`,
  }[variant];
  const skin = dark
    ? { menu: "bg-[#1a1a1d] text-[#e6e6e6] border-white/10 font-mono text-[13px]", row: "bg-white/10", line: "border-white/10", muted: "text-white/40", check: "text-[#8b9cff]" }
    : { menu: "bg-surface border-line text-sm", row: "bg-[var(--hover)]", line: "border-line", muted: "text-muted", check: "text-brand" };

  return (
    <div className={variant === "field" ? "relative" : "relative inline-flex min-w-0 max-w-full"} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={searchable ? undefined : activeId}
        aria-label={`${label}: ${current?.label ?? placeholder ?? "none"}`}
        onClick={() => show(!open)}
        className={`${trigger} max-w-full`}
      >
        {current?.icon}
        <span className={`truncate ${variant === "field" ? `flex-1 ${current ? "" : "text-muted"}` : ""}`}>{current?.label ?? placeholder}</span>
        <ChevronDown
          size={variant === "inline" ? 14 : 15}
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""} ${variant === "field" ? "text-muted" : ""} ${variant === "inline" && !dark && !open ? "text-muted opacity-0 group-hover:opacity-100" : ""}`}
        />
      </button>

      {open && pos && createPortal(
        <div
          ref={menu}
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className={`fixed z-[60] ${pos.width ? "" : "min-w-60 max-w-80"} rounded-2xl border shadow-[var(--shadow-pop)] p-1.5 ${skin.menu}`}
        >
          {searchable && (
            <label className={`flex items-center gap-2 px-2.5 py-2 mb-1 border-b ${skin.line}`}>
              <Search size={14} className={skin.muted} />
              <input
                autoFocus
                role="combobox"
                aria-label={`Search ${label.toLowerCase()}`}
                aria-expanded
                aria-controls={id}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                placeholder={`Search ${label.toLowerCase()}`}
                className="flex-1 outline-none focus-visible:outline-none bg-transparent"
              />
            </label>
          )}
          <ul id={id} role="listbox" aria-label={label} tabIndex={-1} className="overflow-y-auto" style={{ maxHeight: pos.maxH - (searchable ? 48 : 0) - (footer ? 48 : 0) }}>
            {shown.map((o, i) => (
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onClick={() => pick(o)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl ${o.disabled ? `${skin.muted} cursor-not-allowed` : "cursor-pointer"} ${i === active && !o.disabled ? skin.row : ""}`}
              >
                {o.icon}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className={`block text-xs truncate ${skin.muted}`}>{o.hint}</span>}
                </span>
                {o.value === value && <Check size={15} className={`shrink-0 ${skin.check}`} />}
              </li>
            ))}
            {!shown.length && <li className={`px-2.5 py-3 ${skin.muted}`}>No matches</li>}
          </ul>
          {footer && <div ref={foot} className={`border-t mt-1 pt-1 ${skin.line}`} onClick={() => { show(false); button.current?.focus(); }}>{footer}</div>}
        </div>,
        button.current?.closest("dialog") ?? document.body,
      )}
    </div>
  );
}
