"use client";

import { useState } from "react";

// A custom date range: a start and an end, either can be left open. Dates are plain YYYY-MM-DD, the user's own days.
export function RangePicker({ from, to, today, onApply, onClear }: { from: string; to: string; today: string; onApply: (from: string, to: string) => void; onClear?: () => void }) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const bad = !!a && !!b && a > b;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!bad) onApply(a, b); }} className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-xs text-muted">From
        <input type="date" value={a} max={b || today} onChange={(e) => setA(e.target.value)} className="select text-ink block" />
      </label>
      <label className="space-y-1 text-xs text-muted">To
        <input type="date" value={b} min={a || undefined} max={today} onChange={(e) => setB(e.target.value)} className="select text-ink block" />
      </label>
      <button disabled={bad || (!a && !b)} className="btn-primary !py-2">Show</button>
      {onClear && <button type="button" onClick={onClear} className="btn !py-2">Clear dates</button>}
      {bad && <p className="w-full text-sm text-bad">The start has to be before the end.</p>}
    </form>
  );
}
