import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export const middleware = (request: NextRequest) => updateSession(request);

// auth/callback runs without the session refresh: clearing an old sign-in there would wipe the one the email link just made.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/plaid/webhook|auth/callback|api/agent|api/ai/helper|broke-connect|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
