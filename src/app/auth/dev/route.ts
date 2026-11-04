import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/setup";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// Dev-only login bypass: signs in as DEV_LOGIN_EMAIL without an email link. Dead in production builds.
// POST from the login page only, so another site can't sign a visitor in.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const email = process.env.DEV_LOGIN_EMAIL;
  if (process.env.NODE_ENV === "production" || !email) return new NextResponse("Not found", { status: 404 });
  if (!sameOrigin(request)) return new NextResponse("Forbidden", { status: 403 });
  const back = (path: string) => NextResponse.redirect(`${origin}${path}`, 303); // 303: the browser follows with GET

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) return back(`/login?error=${encodeURIComponent(error.message)}`);

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verifyError) return back(`/login?error=${encodeURIComponent(verifyError.message)}`);
  return back("/");
}
