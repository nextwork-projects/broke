"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient, updateMeta } from "@/utils/supabase/client";

// "What should your plan know?": the money profile's notes, on the plan page too. The plan and the chat read it;
// a cloud model gets it with bank and merchant names swapped for placeholders.
export function PlanContext({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  async function save() {
    setState("saving");
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    const profile = (data.user?.user_metadata?.profile ?? {}) as Record<string, unknown>;
    const { error } = await updateMeta(sb, { data: { profile: { ...profile, notes: text.trim().slice(0, 1000) } } });
    setState(error ? "failed" : "saved");
    if (!error) router.refresh();
  }
  return (
    <section className="card p-6 space-y-3 mb-6">
      <div>
        <div className="card-title">What should your plan know?</div>
        <p className="text-sm text-muted mt-0.5">Anything your bank data can&apos;t show. broke ai reads it when it builds your plan and when you chat.</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setState("idle"); }}
        rows={3}
        maxLength={1000}
        aria-label="What should your plan know?"
        placeholder="e.g. I moved to the US in July, so my accounts are new. I get paid twice a month. I want to buy a car next year."
        className="w-full bg-surface border border-line rounded-2xl px-4 py-3 text-sm outline-none focus:border-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={save} disabled={state === "saving" || text.trim() === initial.trim()}>{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save"}</button>
        {state === "saved" && <span className="text-sm text-muted">Run the audit again to use it.</span>}
        {state === "failed" && <span className="text-sm text-bad">Couldn&apos;t save. Try again.</span>}
        <span className="text-xs text-muted ml-auto">Names of banks and shops are swapped out before it goes to a cloud AI.</span>
      </div>
    </section>
  );
}
