import { dropKey } from "@/lib/llm/openrouter";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { error } = await dropKey(user.id);
  if (error) return new Response("Couldn't disconnect", { status: 500 });
  if ((user.user_metadata?.ai_model as { provider?: string } | undefined)?.provider === "openrouter") await supabase.auth.updateUser({ data: { ai_model: null } });
  return new Response(null, { status: 204 });
}
