"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";

export function AccountToggle({ id, included, name }: { id: string; included: boolean; name: string }) {
  const router = useRouter();
  const [on, setOn] = useState(included);
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={`Include ${name} in totals`}
      title={on ? "Included in totals" : "Hidden from totals"}
      onClick={async () => {
        const next = !on;
        setOn(next);
        // RLS blocks with 0 rows, not an error.
        const { data, error } = await createClient().from("accounts").update({ included: next }).eq("id", id).select("id");
        if (error || !data?.length) return setOn(!next), toast("Couldn't save that. Try again.");
        router.refresh();
      }}
      className={`w-10 h-6 rounded-full p-0.5 shrink-0 transition ${on ? "bg-good" : "bg-line"}`}
    >
      <span className={`block size-5 rounded-full bg-white shadow transition ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}
