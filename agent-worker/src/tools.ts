// App tools: definitions (Anthropic tool format) + executors that call the
// CRM's own API routes with the x-api-key header.

export interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  ALIGNO_API_KEY: string;
  ALIGNO_BASE_URL: string;
  /** Comma-separated origin allowlist for CORS. Defaults to localhost dev origins. */
  ALLOWED_ORIGINS?: string;
  /** If set, /agui and /realtime/* require `Authorization: Bearer <token>`. */
  AGENT_AUTH_TOKEN?: string;
  /** Phase C: external MCP connections (Durable Object). */
  CONNECTIONS: import("agents").AgentNamespace<
    import("./connections").ConnectionsAgent
  >;
  /** Composio hosted MCP server URL (per-user), seeded on first boot. */
  COMPOSIO_MCP_URL?: string;
  COMPOSIO_API_KEY?: string;
}

export interface RenderResult {
  summary: string;
  facts: string[];
  suggested_actions: string[];
  draft_message?: { subject?: string; body: string };
}

export const RENDER_RESULT_TOOL_NAME = "render_result";

export const APP_TOOLS = [
  {
    name: "get_contact",
    description:
      "Fetch a CRM contact's full record (fields + tags) by its contact id. Use when you need details about a contact that are not already in your context.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string", description: "The CRM contact id (uuid)." },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "add_note",
    description:
      "Append a note to a CRM contact's record. Use for durable observations worth keeping on the contact (research findings, call summaries).",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string", description: "The CRM contact id (uuid)." },
        note: { type: "string", description: "The note text to append." },
      },
      required: ["contact_id", "note"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a follow-up task in the CRM, optionally linked to a contact and with a due date.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short task title." },
        description: { type: "string", description: "Optional task details." },
        contact_id: {
          type: "string",
          description: "Optional CRM contact id to link the task to.",
        },
        due_date: {
          type: "string",
          description: "Optional due date as an ISO 8601 date, e.g. 2026-08-04.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: RENDER_RESULT_TOOL_NAME,
    description:
      "REQUIRED final step: render the structured result panel for the user. Call this exactly once, as your last action, with everything the user should see. After this tool the run ends.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "2-4 sentence summary of what you found or did.",
        },
        facts: {
          type: "array",
          items: { type: "string" },
          description: "Key facts as short bullet strings.",
        },
        suggested_actions: {
          type: "array",
          items: { type: "string" },
          description: "Concrete next actions the user could take.",
        },
        draft_message: {
          type: "object",
          description: "Include only if the user asked for a drafted message/email.",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["body"],
        },
      },
      required: ["summary", "facts", "suggested_actions"],
    },
  },
];

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search",
  max_uses: 5,
};

interface ToolExecution {
  content: string;
  isError: boolean;
}

async function crmFetch(
  env: Env,
  path: string,
  init?: RequestInit
): Promise<ToolExecution> {
  const url = `${env.ALIGNO_BASE_URL.replace(/\/$/, "")}${path}`;
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "x-api-key": env.ALIGNO_API_KEY,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        content: `CRM API error ${response.status}: ${text.slice(0, 500)}`,
        isError: true,
      };
    }
    return { content: text, isError: false };
  } catch (error) {
    return {
      content: `CRM API request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      isError: true,
    };
  }
}

export async function executeAppTool(
  env: Env,
  name: string,
  input: Record<string, unknown>
): Promise<ToolExecution> {
  switch (name) {
    case "get_contact": {
      const id = String(input.contact_id ?? "");
      if (!id) return { content: "Missing contact_id", isError: true };
      return crmFetch(env, `/api/agent/contacts/${encodeURIComponent(id)}`);
    }
    case "add_note":
      return crmFetch(env, "/api/agent/notes", {
        method: "POST",
        body: JSON.stringify({
          contactId: String(input.contact_id ?? ""),
          note: String(input.note ?? ""),
        }),
      });
    case "create_task":
      return crmFetch(env, "/api/agent/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: String(input.title ?? ""),
          description: input.description ? String(input.description) : undefined,
          contactId: input.contact_id ? String(input.contact_id) : undefined,
          dueDate: input.due_date ? String(input.due_date) : undefined,
        }),
      });
    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}

export function parseRenderResult(input: Record<string, unknown>): RenderResult {
  const draft = input.draft_message as
    | { subject?: string; body?: string }
    | undefined;
  return {
    summary: typeof input.summary === "string" ? input.summary : "",
    facts: Array.isArray(input.facts) ? input.facts.map(String) : [],
    suggested_actions: Array.isArray(input.suggested_actions)
      ? input.suggested_actions.map(String)
      : [],
    ...(draft && typeof draft.body === "string"
      ? {
          draft_message: {
            ...(typeof draft.subject === "string" ? { subject: draft.subject } : {}),
            body: draft.body,
          },
        }
      : {}),
  };
}
