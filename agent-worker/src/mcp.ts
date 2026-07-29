// Portability seam: the same app tools exposed as an MCP server
// (Streamable HTTP on GET/POST /mcp) via Cloudflare's stateless handler.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { executeAppTool, type Env } from "./tools";

function toMcpResult(execution: { content: string; isError: boolean }) {
  return {
    content: [{ type: "text" as const, text: execution.content }],
    ...(execution.isError ? { isError: true } : {}),
  };
}

function createServer(env: Env) {
  const server = new McpServer({ name: "aligno-agent", version: "0.1.0" });

  server.registerTool(
    "get_contact",
    {
      description: "Fetch a CRM contact's full record (fields + tags) by contact id.",
      inputSchema: z.object({ contact_id: z.string() }),
    },
    async ({ contact_id }) =>
      toMcpResult(await executeAppTool(env, "get_contact", { contact_id }))
  );

  server.registerTool(
    "add_note",
    {
      description: "Append a note to a CRM contact's record.",
      inputSchema: z.object({ contact_id: z.string(), note: z.string() }),
    },
    async ({ contact_id, note }) =>
      toMcpResult(await executeAppTool(env, "add_note", { contact_id, note }))
  );

  server.registerTool(
    "create_task",
    {
      description:
        "Create a follow-up task in the CRM, optionally linked to a contact and with an ISO due date.",
      inputSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        contact_id: z.string().optional(),
        due_date: z.string().optional(),
      }),
    },
    async (input) => toMcpResult(await executeAppTool(env, "create_task", input))
  );

  return server;
}

export function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  return createMcpHandler(() => createServer(env), { route: "/mcp" })(
    request,
    env,
    ctx
  );
}
