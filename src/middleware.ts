import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export const middleware = (request: NextRequest) => updateSession(request);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/plaid/webhook|api/agent|api/ai/helper|broke-connect|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
