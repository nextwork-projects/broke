"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toastHost } from "@/components/Toast";

// Native modal <dialog>: focus trap, Escape, inert page and the top layer come from the browser.
// Bottom sheet on phones, centred card from md up (or always a sheet with `sheet`). Focus goes back to the trigger on close.
export function Modal({ label, onClose, sheet = false, className = "", children }: { label: string; onClose: () => void; sheet?: boolean; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) {
      back.current = document.activeElement as HTMLElement | null;
      d.showModal();
      // showModal focuses the first control; React's autoFocus ran while the dialog was still hidden.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    const drop = toastHost(d);
    return () => {
      drop();
      back.current?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      // A click on the dialog itself (not the panel) is a click on the dimmed backdrop.
      onClick={(e) => (e.stopPropagation(), e.target === e.currentTarget && onClose())}
      className={`fixed inset-0 m-0 p-0 size-full max-w-none max-h-none bg-transparent open:grid ${sheet ? "place-items-end" : "place-items-end md:place-items-center"} text-left font-normal whitespace-normal text-ink backdrop:bg-[var(--backdrop)] backdrop:animate-[fade_.15s_ease-out]`}
    >
      <div className={`relative w-full bg-surface ${sheet ? "rounded-t-3xl" : "md:max-w-md rounded-t-3xl md:rounded-3xl"} p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl max-h-[90vh] overflow-y-auto ${className}`}>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
