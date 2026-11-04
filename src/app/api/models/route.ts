import { NextResponse } from "next/server";
import { savedChoice } from "@/lib/llm/gate";
import { providersFor } from "@/lib/llm/providers";
import { createClient } from "@/utils/supabase/server";

// Which AIs this user can pick (OpenRouter, plus this computer's CLIs and local models): names, readiness, the models each can run, the steps to set up
// the rest, and the signed-in user's saved choice (user_metadata.ai_model). ?fresh=1 re-checks now instead of the 30 s cache.
export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.has("fresh");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const providers = await providersFor(user.id, fresh);
  return NextResponse.json({
    providers: providers.map(({ id, label, model, models, ready, reason, howTo, found, action, helper }) => ({ id, label, model, models, ready, reason, howTo, found, action, helper })),
    choice: savedChoice(user) ?? { provider: providers.find((p) => p.ready)?.id ?? "openrouter", model: null },
  });
}
