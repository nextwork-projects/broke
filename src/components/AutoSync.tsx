"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Opening broke syncs any bank that's due (the layout decides), in the background, once per 10 minutes per tab,
// then refreshes the page with what came in. Without a deployed webhook this is how new and older history arrives.
export function AutoSync({ due }: { due: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!due) return;
    try {
      const last = Number(sessionStorage.getItem("broke:autosync"));
      if (last && Date.now() - last < 10 * 60_000) return;
      sessionStorage.setItem("broke:autosync", String(Date.now()));
    } catch {}
    fetch("/api/plaid/sync", { method: "POST" }).then((r) => r.ok && router.refresh()).catch(() => {});
  }, [due, router]);
  return null;
}
