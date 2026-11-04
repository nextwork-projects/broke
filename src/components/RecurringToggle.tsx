"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";

// Optimistic: the label flips at once, a failed write (or 0 rows from RLS) puts it back.
export function RecurringToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  return (
    <button
      className="btn text-xs"
      onClick={async () => {
        const next = !on;
        setOn(next);
        const { data, error } = await createClient().from("recurring").update({ active: next }).eq("id", id).select("id");
        if (error || !data?.length) return setOn(!next), toast("Couldn't save that. Try again.");
        router.refresh();
      }}
    >
      {on ? "Hide" : "Show"}
    </button>
  );
}
