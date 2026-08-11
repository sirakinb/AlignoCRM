import { verifyTwilioRequest } from "@/lib/messaging/twilio-signature";
import { claimWebhookEvent } from "@/lib/messaging/webhook-events";
import { addSuppression } from "@/lib/messaging/suppressions";
import {
  findMessageByProviderId,
  recomputeCampaignCounter,
  updateMessage,
} from "@/lib/messaging/webhook-store";
import { sanitizeHeaderValue } from "@/lib/messaging/header-safety";
import { redactProviderError } from "@/lib/messaging/redact";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/webhooks/twilio/status"; // literal, never request-derived

/** Twilio "attempt to send to an opted-out number" — reconcile a missed STOP (P2-19b). */
const BLOCKED_NUMBER_ERROR = "21610";

// Status precedence so out-of-order callbacks never regress (P2-23).
const RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: 3,
  bounced: 3,
};

function mapStatus(twilioStatus: string): "sent" | "delivered" | "failed" | null {
  switch (twilioStatus) {
    case "queued":
    case "accepted":
    case "scheduled":
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return null;
  }
}

/**
 * Twilio status-callback webhook (REQ-SEC-02/03/04). Signature validated against
 * the pinned base URL; message + workspace resolved from the MessageSid row.
 */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? "0") > 1024 * 1024) {
    return new Response("Payload too large", { status: 413 }); // REQ-SEC-05
  }
  const verified = await verifyTwilioRequest(request, ROUTE_PATH);
  if (!verified.ok) {
    if (verified.reason === "unconfigured") {
      console.error("[webhook:twilio-status] TWILIO_AUTH_TOKEN / MESSAGING_PUBLIC_BASE_URL missing");
      return new Response("Not configured", { status: 503 });
    }
    if (verified.reason === "bad_content_type") {
      return new Response("Bad request", { status: 400 });
    }
    if (verified.reason === "too_large") {
      return new Response("Payload too large", { status: 413 });
    }
    console.warn("[webhook:twilio-status] signature rejected");
    return new Response("Forbidden", { status: 403 });
  }

  const { limit, windowMs } = RATE_LIMITS.webhookPerRoute;
  if (!(await checkRateLimit("wh:twilio-status", limit, windowMs))) {
    return new Response("Rate limited", { status: 429, headers: { "retry-after": "60" } });
  }

  const params = verified.params;
  try {
    const messageSid = params.MessageSid ?? params.SmsSid ?? "";
    const twilioStatus = (params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase();
    const errorCode = params.ErrorCode ?? "";
    const errorMessage = params.ErrorMessage ?? "";
    if (!messageSid || !twilioStatus) {
      console.warn("[webhook:twilio-status] malformed params");
      return new Response("ok", { status: 200 });
    }

    const next = mapStatus(twilioStatus);
    if (!next) return new Response("ok", { status: 200 }); // status we don't track

    const message = await findMessageByProviderId("twilio", messageSid);
    if (!message) {
      console.info("[webhook:twilio-status] no message for MessageSid");
      return new Response("ok", { status: 200 }); // unknown SID → no-op (REQ-SEC-03)
    }

    // Idempotency keyed on SID + status (a SID gets several callbacks — REQ-SEC-04).
    const first = await claimWebhookEvent("twilio", `${messageSid}:${twilioStatus}`, "sms.status");
    if (!first) return new Response("ok", { status: 200 });

    const isBlocked = String(errorCode) === BLOCKED_NUMBER_ERROR;
    const currentRank = RANK[message.status] ?? 0;
    const nextRank = RANK[next] ?? 0;
    // Advance, or always record a failure; never regress delivered→sent (P2-23).
    const applyStatus = nextRank > currentRank || next === "failed";

    if (applyStatus) {
      const patch: Record<string, unknown> = { status: next };
      if (next === "delivered") patch.delivered_at = message.delivered_at ?? new Date().toISOString();
      if (errorCode || errorMessage) {
        patch.error = sanitizeHeaderValue(
          [errorCode, errorMessage].filter(Boolean).join(": "),
          512
        );
      }
      await updateMessage(message.id, patch);

      if (next === "delivered" && message.campaign_id) {
        await recomputeCampaignCounter(message.campaign_id, "delivered_count");
      }
      if (next === "failed" && message.campaign_id) {
        await recomputeCampaignCounter(message.campaign_id, "failed_count");
      }
    }

    // Blocked-number reconciliation: a STOP that Advanced Opt-Out swallowed never
    // reached our inbound webhook, so write the suppression now (P2-19b).
    if (isBlocked && message.to_address) {
      await addSuppression({
        workspaceId: message.workspace_id,
        channel: "sms",
        address: message.to_address,
        reason: "stop",
        sourceMessageId: message.id,
      });
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[webhook:twilio-status] processing error", redactProviderError(err));
    return new Response("ok", { status: 200 });
  }
}
