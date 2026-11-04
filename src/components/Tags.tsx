"use client";

import { Tag as TagIcon, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mergeTags } from "@/lib/rules";

// Each tag keeps one colour, picked from its name.
const DOTS = ["#4f6bed", "#0f9d76", "#d9822b", "#c2417e", "#7c5cd6", "#2b9bd9", "#b5523b", "#5b8a2b"];
const dot = (t: string) => DOTS[[...t.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % DOTS.length];

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface pl-2 pr-2 py-0.5 text-xs text-ink whitespace-nowrap">
      <span className="size-1.5 rounded-full" style={{ background: dot(tag) }} />
      {tag}
      {onRemove && (
        <button type="button" aria-label={`Remove tag ${tag}`} onClick={onRemove} className="-mr-1 p-0.5 rounded-full text-muted hover:text-ink hover:bg-[var(--hover)]">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/** Chips plus an input: Enter or comma adds what's typed, suggestions add with one tap. */
export function TagEditor({ value, onChange, all, autoFocus }: { value: string[]; onChange: (tags: string[]) => void; all: string[]; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const add = (t: string) => {
    onChange(mergeTags(value, [t]));
    setText("");
  };
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const suggestions = all.filter((t) => !has(t) && t.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 8);
  const typedIsNew = !!text.trim() && !has(text) && !all.some((t) => t.toLowerCase() === text.trim().toLowerCase());

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5 bg-surface border border-line rounded-xl px-2.5 py-2 focus-within:border-ink">
        {value.map((t) => <TagChip key={t} tag={t} onRemove={() => onChange(value.filter((v) => v !== t))} />)}
        <input
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value.replace(",", ""))}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          placeholder={value.length ? "" : "Add a tag"}
          aria-label="Add a tag"
          className="flex-1 min-w-24 bg-transparent text-sm outline-none focus-visible:outline-none py-0.5"
        />
      </div>
      {(!!suggestions.length || typedIsNew) && (
        <div className="flex flex-wrap gap-1.5">
          {typedIsNew && (
            <button type="button" onClick={() => add(text)} className="text-xs rounded-full px-2.5 py-1 bg-ink text-white hover:opacity-85">Create &quot;{text.trim()}&quot;</button>
          )}
          {suggestions.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="rounded-full hover:opacity-70"><TagChip tag={t} /></button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A tag button that opens the editor in a popover. Saves when it closes, so one edit is one write. */
export function TagButton({ tags, all, label, onSave }: { tags: string[]; all: string[]; label: string; onSave: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(tags);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const close = () => {
    setOpen(false);
    const next = draftRef.current;
    if (next.join("\u0000") !== tags.join("\u0000")) onSave(next);
  };

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    setPos({ top: Math.min(r.bottom + 8, innerHeight - 220), left: Math.max(8, Math.min(r.right - 300, innerWidth - 308)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (close(), button.current?.focus());
    document.addEventListener("pointerdown", out);
    addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", out);
      removeEventListener("keydown", esc);
    };
  }); // re-binds each render so close() sees the latest tags

  return (
    <>
      <button
        ref={button}
        type="button"
        title="Tags"
        aria-label={label}
        aria-expanded={open}
        onClick={() => (open ? close() : (setDraft(tags), setOpen(true)))}
        className={`p-2.5 rounded-lg hover:bg-[var(--hover)] ${tags.length ? "text-ink" : "hover:text-ink"}`}
      >
        <TagIcon size={17} />
      </button>
      {open && pos && createPortal(
        <div ref={box} style={pos} className="fixed z-[60] w-[300px] bg-surface border border-line rounded-2xl shadow-[0_16px_40px_-12px_#00000040] p-3 text-left font-normal text-ink">
          <TagEditor value={draft} onChange={setDraft} all={all} autoFocus />
        </div>,
        document.body,
      )}
    </>
  );
}
