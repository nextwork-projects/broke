import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Same rule as lib/setup.ts isSet (kept inline: middleware can't import server-only code).
const isSet = (v?: string) => !!v && !/^your[_-]|your-project|YOUR-PASSWORD/.test(v);
const toSetup = (request: NextRequest) => {
  const url = request.nextUrl.clone();
  url.pathname = "/setup";
  url.search = "";
  return NextResponse.redirect(url);
};

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isSetupPath = path.startsWith("/setup") || path.startsWith("/api/setup");
  const supabaseReady =
    isSet(process.env.NEXT_PUBLIC_SUPABASE_URL) && isSet(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) && isSet(process.env.SUPABASE_SERVICE_ROLE_KEY);
  // Without Supabase nobody can sign in, so everything goes to the setup checklist.
  if (!supabaseReady) return isSetupPath ? NextResponse.next({ request }) : toSetup(request);

  // The app layout reads the path (it has no other way to) to let /accounts/add through during onboarding.
  request.headers.set("x-path", path);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refreshes the auth token when it's due; without this call sessions expire. getClaims checks the JWT against
  // the project's ES256 public key locally (cached JWKS), so most requests skip a round trip to Supabase Auth.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  // The setup page and its API check access themselves (signed in, or localhost in dev).
  if (isSetupPath) return response;
  if (!user && !path.startsWith("/login") && !path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Keep the cookie changes getClaims made: a sign-in Supabase no longer accepts gets cleared here, not resent forever.
    const to = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => to.cookies.set(c));
    return to;
  }
  // Signed in but no bank keys yet: app pages would be empty, so show the checklist instead.
  if (user && !path.startsWith("/api") && !(isSet(process.env.PLAID_CLIENT_ID) && isSet(process.env.PLAID_SECRET))) return toSetup(request);
  return response;
}
