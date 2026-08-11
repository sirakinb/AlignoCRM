// Phase B: OpenAI Realtime (speech-to-speech) support.
// The worker mints ephemeral client secrets (the browser never sees
// OPENAI_API_KEY) and executes forwarded function calls. The voice model is a
// thin front-end: all real capability stays in this worker's tools.

import { executeAppTool, type Env } from "./tools";

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
const REALTIME_MODEL = "gpt-realtime-2";

// Flat tool format per the GA Realtime API (not Chat Completions nesting).
const VOICE_TOOLS = [
  {
    type: "function",
    name: "run_agent_task",
    description:
      "Delegate any substantive request to Aligno's full agent (research, drafting, multi-step CRM work). Returns a structured result you should summarize aloud, briefly. Use this for anything beyond quick chat.",
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description:
            "The user's request, restated completely with all relevant details.",
        },
      },
      required: ["request"],
    },
  },
  {
    type: "function",
    name: "get_contact",
    description:
      "Fetch a CRM contact's record by contact id for quick factual lookups.",
    parameters: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "The CRM contact id (uuid)." },
      },
      required: ["contact_id"],
    },
  },
];

function buildVoiceInstructions(contactJson: string | null): string {
  const lines = [
    "You are Aligno's voice interface, embedded in the AlignoCRM dashboard.",
    "Converse briefly and naturally — short sentences, no lists, no markdown.",
    "Use tools for anything real: for research, drafting, notes, tasks, or multi-step work, call run_agent_task with the user's request. For a quick contact lookup, call get_contact.",
    "# Preambles",
    "When you start a tool call, say one short preamble sentence so the user knows work is happening (e.g. \"Let me look into that.\"). Keep talking naturally while tools run.",
    "When run_agent_task returns, summarize the result aloud in a couple of sentences — the full details are already on screen.",
  ];
  if (contactJson) {
    lines.push(
      "# Current context",
      `The user has this CRM contact open right now: ${contactJson}`,
      "When they say \"this person\" or \"this lead\", they mean this contact."
    );
  }
  return lines.join("\n");
}

/** POST /realtime/secret — body: { contact?: object } */
export async function handleRealtimeSecret(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let contactJson: string | null = null;
  try {
    const body = (await request.json()) as { contact?: unknown };
    if (body?.contact && typeof body.contact === "object") {
      contactJson = JSON.stringify(body.contact);
    }
  } catch {
    // empty body is fine
  }

  const response = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: buildVoiceInstructions(contactJson),
        output_modalities: ["audio"],
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: "auto",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: "marin" },
        },
        tools: VOICE_TOOLS,
        tool_choice: "auto",
      },
    }),
  });

  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /realtime/tool — body: { name, arguments }
 * Executes a forwarded Realtime function call for the direct (non-streaming)
 * tools. run_agent_task is NOT handled here — the browser drives it through
 * POST /agui so the activity feed streams while the call runs.
 */
export async function handleRealtimeTool(
  request: Request,
  env: Env
): Promise<Response> {
  let body: { name?: string; arguments?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const name = String(body.name ?? "");
  let args: Record<string, unknown> = {};
  if (typeof body.arguments === "string") {
    try {
      args = JSON.parse(body.arguments) as Record<string, unknown>;
    } catch {
      args = {};
    }
  } else if (body.arguments && typeof body.arguments === "object") {
    args = body.arguments as Record<string, unknown>;
  }

  const execution = await executeAppTool(env, name, args);
  return new Response(
    JSON.stringify({ output: execution.content, isError: execution.isError }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
