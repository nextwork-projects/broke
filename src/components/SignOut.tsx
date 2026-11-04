"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      className="btn text-xs"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
      }}
    >
      Sign out
    </button>
  );
}
