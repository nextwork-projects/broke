import { NextResponse } from "next/server";
import { saveFoundRecurring } from "@/lib/recurring-save";
import { createClient } from "@/utils/supabase/server";

// Finds charges and pay that repeat in the signed-in user's own transactions. Called after a statement import.
export async function POST() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await saveFoundRecurring(user.id));
}
