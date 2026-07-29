// Phase C: external MCP connections (Google Drive / Gmail via Composio, etc.).
// A thin Agent Durable Object owns the MCP client connections — configs and
// OAuth tokens persist in its SQLite storage and restore across hibernation.
// /agui itself stays stateless: it asks this DO for tools per run.

import { Agent } from "agents";
import type { Env } from "./tools";

export interface ConnectionInfo {
  id: string;
  name: string;
  url: string;
  state: string;
  authUrl: string | null;
  error: string | null;
}

export interface ExternalToolInfo {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface ExternalCallOutcome {
  content: string;
  isError: boolean;
}

const CONNECT_TIMEOUT_MS = 8_000;

export class ConnectionsAgent extends Agent<Env> {
  async onStart() {
    // Seed the Composio connection from env on first boot (header auth, no
    // OAuth dance). Runtime-added connections are persisted automatically.
    if (this.env.COMPOSIO_MCP_URL) {
      const existing = Object.values(this.getMcpServers().servers);
      if (!existing.some((server) => server.name === "composio")) {
        await this.addConnection(
          "composio",
          this.env.COMPOSIO_MCP_URL,
          this.env.COMPOSIO_API_KEY
            ? { "x-api-key": this.env.COMPOSIO_API_KEY }
            : undefined
        ).catch((error) => {
          console.error("[connections] Composio seed failed:", error);
        });
      }
    }
  }

  async addConnection(
    name: string,
    url: string,
    headers?: Record<string, string>
  ): Promise<{ id: string; state: string; authUrl?: string }> {
    return this.addMcpServer(name, url, {
      transport: {
        type: "streamable-http",
        ...(headers ? { headers } : {}),
      },
    });
  }

  async listConnections(): Promise<ConnectionInfo[]> {
    const { servers } = this.getMcpServers();
    return Object.entries(servers).map(([id, server]) => ({
      id,
      name: server.name,
      url: server.server_url,
      state: server.state,
      authUrl: server.auth_url,
      error: server.error,
    }));
  }

  async removeConnection(id: string): Promise<void> {
    await this.removeMcpServer(id);
  }

  async listExternalTools(): Promise<ExternalToolInfo[]> {
    await this.mcp
      .waitForConnections({ timeout: CONNECT_TIMEOUT_MS })
      .catch(() => {});
    const { servers } = this.getMcpServers();
    return this.mcp.listTools().map((tool) => ({
      serverId: tool.serverId,
      serverName: servers[tool.serverId]?.name ?? tool.serverId,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callExternalTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<ExternalCallOutcome> {
    try {
      const result = await this.mcp.callTool({
        serverId,
        name,
        arguments: args,
      });
      const blocks = result.content as
        | Array<{ type: string; text?: string }>
        | undefined;
      const content = Array.isArray(blocks)
        ? blocks
            .map((item) =>
              item.type === "text" && typeof item.text === "string"
                ? item.text
                : JSON.stringify(item)
            )
            .join("\n")
        : JSON.stringify(result);
      return { content, isError: Boolean(result.isError) };
    } catch (error) {
      return {
        content: `External tool call failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
    }
  }
}
