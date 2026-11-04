"use client";

import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { useAssistant } from "@/components/Assistant";

const STARTERS = ["What should I do first with my money?", "How can I spend less without feeling it?", "Am I on track for my goals?"];

// The plan as a conversation: ask in plain words. The AI can look up your numbers and offer budget and category changes.
export function PlanChat() {
  const { ask } = useAssistant();
  const [q, setQ] = useState("");
  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    ask(q.trim());
    setQ("");
  }
  return (
    <section className="card p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="card-title">Talk it through</h2>
        <p className="text-sm text-muted">Ask anything about your money. It can look at your numbers and suggest changes to your budget and categories.</p>
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask about your plan" placeholder="I want to save for a trip. Where do I start?" className="select flex-1 min-w-0" />
        <button aria-label="Ask" disabled={!q.trim()} className="btn-primary !px-3 shrink-0"><ArrowUp size={18} /></button>
      </form>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-3.5 py-1.5 text-sm hover:bg-[var(--hover)]">{s}</button>)}
      </div>
    </section>
  );
}
