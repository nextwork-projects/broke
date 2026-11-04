"use client";

import { useId } from "react";
import { useAssistant } from "@/components/Assistant";
import { cancelPrompt, cancelUrl, negotiatePrompt, type Negotiable, type Stream } from "@/lib/subscriptions";

// "Cancel" opens a small native popover with the cancel page (when known) and a broke AI draft.
// "Negotiate" shows only on internet, phone and insurance bills.
export function CancelActions({ stream, kind, state }: { stream: Stream; kind: Negotiable | null; state?: string }) {
  const { ask } = useAssistant();
  const id = useId();
  const url = cancelUrl(stream.merchant_name);
  const close = () => (document.getElementById(id) as HTMLElement & { hidePopover?: () => void })?.hidePopover?.();
  return (
    <>
      {kind && (
        <button className="btn text-xs" onClick={() => ask(negotiatePrompt(stream, kind, state))}>
          Negotiate
        </button>
      )}
      <button className="btn text-xs" popoverTarget={id}>
        Cancel
      </button>
      <div id={id} popover="auto" className="card m-auto w-[min(380px,calc(100vw-32px))] p-6 space-y-4 backdrop:bg-black/30">
        <div className="card-title">Cancel {stream.merchant_name}</div>
        {url ? (
          <p className="text-sm">
            Cancel it yourself here:{" "}
            <a href={url} target="_blank" rel="noreferrer" className="underline break-all">
              {url.replace(/^https:\/\/(www\.)?/, "")}
            </a>
          </p>
        ) : (
          <p className="text-sm text-muted">broke has no direct cancel link for {stream.merchant_name}. Check your account settings on their site, or send them a message.</p>
        )}
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => (close(), ask(cancelPrompt(stream)))}>
            Write my cancel message
          </button>
          <button className="btn" popoverTarget={id} popoverTargetAction="hide">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
