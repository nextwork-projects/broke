#!/usr/bin/env node
// broke's MCP server (stdio) for Claude Code sessions. Read-only money tools, acting as one signed-in user:
// every call goes to broke's localhost /api/agent/tools with the session's BROKE_TOKEN, where RLS applies.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const { BROKE_URL, BROKE_TOKEN } = process.env;
if (!BROKE_URL || !BROKE_TOKEN) {
  console.error("broke-mcp: BROKE_URL and BROKE_TOKEN are required");
  process.exit(1);
}
const api = (init) =>
  fetch(`${BROKE_URL}/api/agent/tools`, { ...init, headers: { authorization: `Bearer ${BROKE_TOKEN}`, "content-type": "application/json" } });
const expired = { content: [{ type: "text", text: "This broke session has expired. Open the chat in broke again." }], isError: true };

const server = new Server({ name: "broke", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const res = await api({ method: "GET" });
  if (!res.ok) return { tools: [] };
  return { tools: (await res.json()).tools.map((t) => ({ ...t, annotations: { readOnlyHint: true } })) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const res = await api({ method: "POST", body: JSON.stringify({ name: req.params.name, input: req.params.arguments ?? {} }) });
  if (res.status === 403) return expired;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { content: [{ type: "text", text: JSON.stringify(body) }], isError: true };
  return { content: [{ type: "text", text: body.text }] };
});

await server.connect(new StdioServerTransport());
