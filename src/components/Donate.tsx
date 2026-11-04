"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";

export const DONATE_URL = "https://buy.stripe.com/5kQ6oHgXWc1T33CbNt5Vu05";
const USED = "broke.minutesUsed", ASKED = "broke.donateAsked";
const ASK_AFTER = 120; // minutes with broke open and on screen

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window: just don't count */ } };

export function DonateLink({ className = "" }: { className?: string }) {
  return (
    <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className={className}>
      <Heart size={18} strokeWidth={1.6} className="shrink-0" />
      <span className="flex-1 text-left">Support broke</span>
    </a>
  );
}

// Asks once, after about two hours of use: minutes count only while a broke tab is open and visible, in this browser.
export function DonatePrompt() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (read(ASKED)) return;
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const used = Number(read(USED) ?? 0) + 1;
      write(USED, String(used));
      if (used < ASK_AFTER || read(ASKED)) return;
      write(ASKED, new Date().toISOString());
      setOpen(true);
      clearInterval(tick);
    }, 60_000);
    return () => clearInterval(tick);
  }, []);
  if (!open) return null;
  return (
    <Modal label="Support broke" onClose={() => setOpen(false)}>
      <div className="space-y-4">
        <Heart size={22} strokeWidth={1.6} className="text-muted" />
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Finding broke useful?</h2>
          <p className="text-sm text-muted">broke is free and open source. If it&apos;s saved you money, you can chip in to keep it going. This is the only time it asks.</p>
        </div>
        <div className="flex gap-3">
          <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="btn-primary" data-autofocus>Donate</a>
          <button className="btn" onClick={() => setOpen(false)}>Not now</button>
        </div>
      </div>
    </Modal>
  );
}
