"use client";

import { useEffect, useState } from "react";
import { AskButton } from "@/components/Assistant";
import { useMoney } from "@/components/Money";
import { changeLines, trackLines, type CheckinFacts } from "@/lib/checkins";

type Checkin = { id: string; created_at: string; facts: CheckinFacts; summary: string | null };

// "Your week" on Home: the weekly review, written once a week (POST /api/checkins makes a new one when the last is 7+
// days old, else returns it). Your AI's words when one is connected, else the plain facts. A few lines, no more.
export function WeekCard() {
  const { money0, dateLabel } = useMoney();
  const [c, setC] = useState<Checkin | null>(null);
  useEffect(() => {
    fetch("/api/checkins", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then((r) => (r.ok ? r.json() : null)).then((x: Checkin | null) => x?.facts && setC(x)).catch(() => {});
  }, []);
  if (!c) return null;
  const lines = (c.summary ? c.summary.split("\n").map((l) => l.replace(/^- /, "").trim()) : [...changeLines(c.facts, { $: money0 }), ...trackLines(c.facts, money0)]).filter(Boolean).slice(0, 4);
  if (!lines.length) return null;
  return (
    <section className="card p-5 space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">Your week · {dateLabel(c.created_at.slice(0, 10), { month: "short", day: "numeric" })}</span>
        <AskButton q="Talk me through my week: what changed, and what should I do about it?" className="text-sm text-muted hover:text-ink">Ask about this</AskButton>
      </div>
      <ul className="space-y-1.5 text-sm list-disc pl-5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </section>
  );
}
