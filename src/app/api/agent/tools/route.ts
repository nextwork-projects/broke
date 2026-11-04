import { z } from "zod";
import { agentClient, isLocalRequest } from "@/lib/llm/agent-auth";
import { aiAllowed } from "@/lib/llm/gate";
import { makeTools } from "@/lib/llm/shared";

// Called only by scripts/broke-mcp.mjs (spawned by a broke Claude Code session) with its agent token. Localhost only.
// Claude Code is a cloud model, so these are always the summary tools, and nothing at all in Off mode.
async function auth(request: Request) {
  if (!isLocalRequest(request)) return null;
  const a = await agentClient(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null);
  return a && aiAllowed(a.user) ? a : null;
}

export async function GET(request: Request) {
  const a = await auth(request);
  if (!a) return new Response("Forbidden", { status: 403 });
  const tools = makeTools(a.supabase, a.user.user_metadata?.profile, a.user.id, "summary");
  return Response.json({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.schema) })) });
}

export async function POST(request: Request) {
  const a = await auth(request);
  if (!a) return new Response("Forbidden", { status: 403 });
  const { name, input } = (await request.json()) as { name?: string; input?: unknown };
  const t = makeTools(a.supabase, a.user.user_metadata?.profile, a.user.id, "summary").find((x) => x.name === name);
  if (!t) return Response.json({ error: `Unknown tool ${name}` }, { status: 404 });
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return Response.json({ error: "Invalid arguments", issues: parsed.error.issues }, { status: 400 });
  return Response.json({ text: await t.run(parsed.data as Record<string, unknown>) });
}
