import { ConnectAI } from "@/components/ConnectAI";
import { getUser } from "@/lib/data";
import { savedChoice } from "@/lib/llm/gate";
import { isHosted, providersFor } from "@/lib/llm/providers";

export default async function ConnectAIPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { user } = await getUser();
  const [providers, q] = await Promise.all([providersFor(user!.id), searchParams]);
  return <ConnectAI initial={JSON.parse(JSON.stringify(providers))} choice={savedChoice(user)} hosted={isHosted()} connected={!!q.connected} failed={!!q.error} />;
}
