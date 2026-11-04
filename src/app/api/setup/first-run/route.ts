import { NextResponse } from "next/server";
import { isHosted } from "@/lib/llm/providers";
import { currentEnv, hasUsers } from "@/lib/setup";

// What the login page needs before anyone signs in: the one Supabase step on an online copy (until someone has signed
// in), and whether "Skip login" works here (development, with DEV_LOGIN_EMAIL set).
export async function GET() {
  const devLogin = process.env.NODE_ENV !== "production" && !!process.env.DEV_LOGIN_EMAIL;
  if (!isHosted() || (await hasUsers())) return NextResponse.json({ devLogin });
  const ref = currentEnv().NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  return NextResponse.json({ devLogin, supabase: ref ? `https://supabase.com/dashboard/project/${ref}/auth/url-configuration` : "https://supabase.com/dashboard" });
}
