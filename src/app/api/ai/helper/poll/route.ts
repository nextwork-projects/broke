import { helperUser, nextJob, type HelperCli } from "@/lib/llm/helper";

// The helper's heartbeat: says which AI apps it has and picks up the next question.
export async function POST(request: Request) {
  const userId = await helperUser(request);
  if (!userId) return new Response("Forbidden", { status: 403 });
  const { clis } = (await request.json().catch(() => ({}))) as { clis?: HelperCli[] };
  return Response.json({ job: await nextJob(userId, Array.isArray(clis) ? clis : []) });
}
