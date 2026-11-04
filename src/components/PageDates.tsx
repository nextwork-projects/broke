"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RangePicker } from "@/components/RangePicker";

// "Custom dates" on a page. The URL keeps the range, so back and refresh work.
export function PageDates({ path, from, to, today }: { path: string; from: string; to: string; today: string }) {
  const router = useRouter();
  const on = !!(from || to);
  const [open, setOpen] = useState(on);
  const go = (a: string, b: string) => router.push(`${path}?${new URLSearchParams(Object.entries({ from: a, to: b }).filter(([, v]) => v))}`, { scroll: false });
  if (!open) return <div className="text-center"><button onClick={() => setOpen(true)} className="text-sm text-muted underline underline-offset-4 hover:text-ink">Custom dates</button></div>;
  return (
    <section className="card p-4 flex justify-center">
      <RangePicker from={from} to={to} today={today} onApply={go} onClear={() => { setOpen(false); if (on) router.push(path, { scroll: false }); }} />
    </section>
  );
}
