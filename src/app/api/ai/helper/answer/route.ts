import { addAnswer, helperUser } from "@/lib/llm/helper";

export async function POST(request: Request) {
  const userId = await helperUser(request);
  if (!userId) return new Response("Forbidden", { status: 403 });
  const { id, text, status } = (await request.json().catch(() => ({}))) as { id?: string; text?: string; status?: "done" | "failed" };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad request", { status: 400 });
  const live = await addAnswer(userId, id, typeof text === "string" ? text : "", status === "done" || status === "failed" ? status : undefined);
  return new Response(null, { status: live ? 204 : 410 });
}
