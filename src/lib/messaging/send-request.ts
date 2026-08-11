import "server-only";
import { NextResponse } from "next/server";
import {
  sendConversationMessage,
  SendMessageError,
} from "@/lib/messaging/send-message";
import { checkSendRateLimit } from "@/lib/messaging/rate-limit";
import type { Message, MessageChannel } from "@/types/messaging";

const MAX_BODY = 100_000; // REQ-SEC-24
const MAX_SUBJECT = 512; // REQ-SEC-24 / REQ-SEC-10

export interface SendRequestInput {
  channel: unknown;
  subject?: unknown;
  body: unknown;
}

export type SendOutcome =
  | { kind: "ok"; message: Message }
  | { kind: "invalid"; field: string; message: string }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "blocked"; reason: string; message: string }
  | { kind: "no_address"; message: string }
  | { kind: "error"; message: string };

interface ValidatedSend {
  channel: MessageChannel;
  subject?: string;
  body: string;
}

/**
 * Validate a 1:1 send body (REQ-SEC-24). Returns the typed values or a
 * field-named validation failure. Unknown fields are ignored, never spread.
 */
function validate(input: SendRequestInput): ValidatedSend | { field: string; message: string } {
  if (input.channel !== "email" && input.channel !== "sms") {
    return { field: "channel", message: "channel must be 'email' or 'sms'." };
  }
  const channel = input.channel;

  if (typeof input.body !== "string" || input.body.trim().length === 0) {
    return { field: "body", message: "body is required." };
  }
  if (input.body.length > MAX_BODY) {
    return { field: "body", message: "body is too long." };
  }

  let subject: string | undefined;
  if (channel === "email") {
    if (input.subject != null && typeof input.subject !== "string") {
      return { field: "subject", message: "subject must be a string." };
    }
    subject = typeof input.subject === "string" ? input.subject : undefined;
    if (subject && subject.length > MAX_SUBJECT) {
      return { field: "subject", message: "subject is too long." };
    }
  }

  return { channel, subject, body: input.body };
}

/**
 * The shared body of both 1:1 send routes: validate → rate-limit → send. The
 * rate check runs BEFORE `sendConversationMessage`, so a rate-limited request
 * never inserts a `messages` row or calls a provider (P5-07). Error mapping never
 * echoes a raw provider error to the caller (REQ-SEC-15.7) — the detail is logged
 * server-side by the route.
 */
export async function performSend(
  workspaceId: string,
  contactId: string,
  input: SendRequestInput
): Promise<SendOutcome> {
  const validated = validate(input);
  if ("field" in validated) {
    return { kind: "invalid", field: validated.field, message: validated.message };
  }

  const rate = await checkSendRateLimit(workspaceId);
  if (!rate.ok) {
    return { kind: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds };
  }

  try {
    const message = await sendConversationMessage({
      workspaceId,
      contactId,
      channel: validated.channel,
      subject: validated.subject,
      body: validated.body,
    });
    return { kind: "ok", message };
  } catch (err) {
    if (err instanceof SendMessageError) {
      switch (err.code) {
        case "no_address":
          return { kind: "no_address", message: err.message };
        case "suppressed":
          return {
            kind: "blocked",
            reason: "suppressed",
            message: err.message,
          };
        case "invalid_destination":
          return { kind: "invalid", field: "channel", message: err.message };
        default:
          return { kind: "error", message: err.message };
      }
    }
    throw err;
  }
}

/**
 * Map a {@link SendOutcome} to an HTTP response. `provider_error`/`error`
 * outcomes are logged with their detail here but returned to the caller as a
 * generic message (REQ-SEC-15.7 — a provider error can embed request payloads).
 */
export function sendOutcomeToResponse(
  outcome: SendOutcome,
  logLabel: string
): NextResponse {
  switch (outcome.kind) {
    case "ok":
      return NextResponse.json({ message: outcome.message }, { status: 201 });
    case "invalid":
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 }
      );
    case "no_address":
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    case "rate_limited":
      return NextResponse.json(
        { error: "Too many messages. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(outcome.retryAfterSeconds) },
        }
      );
    case "blocked":
      return NextResponse.json(
        { error: outcome.message, reason: outcome.reason },
        { status: 422 }
      );
    case "error":
    default:
      console.error(`${logLabel} send error:`, outcome.message);
      return NextResponse.json(
        { error: "Message could not be sent." },
        { status: 502 }
      );
  }
}
