import { newPairCode, redeemCode } from "@/lib/llm/helper";
import { isHosted } from "@/lib/llm/providers";
import { sameOrigin } from "@/lib/setup";
import { createClient } from "@/utils/supabase/server";

// The Connect your AI page asks for a code (signed in, this site only). The helper swaps that code for its token.
export async function POST(request: Request) {
  if (!isHosted()) return new Response("Only for a hosted copy", { status: 404 });
  const { code } = (await request.json().catch(() => ({}))) as { code?: unknown };
  if (typeof code === "string") {
    const token = await redeemCode(code);
    return token ? Response.json({ token }) : new Response("That code has expired. Get a new command from Connect your AI.", { status: 401 });
  }
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  return Response.json({ code: await newPairCode(user.id) });
}
