import { addSuppression } from "@/lib/messaging/suppressions";
import { verifySvixSignature } from "@/lib/messaging/svix-signature";
import { claimWebhookEvent } from "@/lib/messaging/webhook-events";
import {
  findMessageByProviderId,
  recomputeCampaignCounter,
  updateMessage,
  type OwnedMessage,
} from "@/lib/messaging/webhook-store";
import { redactProviderError, sanitizeProviderResponse } from "@/lib/messaging/redact";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";

// Node runtime: svix + crypto are not edge-safe, and we need the raw body.
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB (REQ-SEC-05)

interface ResendEvent {
  type?: string;
  data?: { email_id?: string };
}

/**
 * Resend delivery-events webhook (REQ-SEC-01/03/04/05).
 * Svix-signed, idempotent per svix-id, tenant derived from the matched message.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook:resend] RESEND_WEBHOOK_SECRET not configured");
    return new Response("Not configured", { status: 503 }); // fail closed
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  const verified = verifySvixSignature(raw, request.headers, secret);
  if (!verified.ok) {
    console.warn("[webhook:resend] signature rejected");
    return new Response("Invalid signature", { status: 401 });
  }

  const { limit, windowMs } = RATE_LIMITS.webhookPerRoute;
  if (!(await checkRateLimit("wh:resend", limit, windowMs))) {
    return new Response("Rate limited", { status: 429, headers: { "retry-after": "60" } });
  }

  try {
    const event = verified.event as ResendEvent;
    const type = event?.type;
    const emailId = event?.data?.email_id;
    if (!type || !emailId) {
      console.warn("[webhook:resend] malformed event body");
      return new Response("ok", { status: 200 }); // survivable (REQ-SEC-05)
    }

    const message = await findMessageByProviderId("resend", emailId);
    if (!message) {
      console.info("[webhook:resend] no message for provider_id", { type });
      return new Response("ok", { status: 200 }); // unknown id → no-op 200 (P2-11)
    }

    // Idempotency AFTER we know there is work to do, so a genuine retry that
    // arrives before markSent commits provider_id is not permanently dropped.
    const first = await claimWebhookEvent("resend", verified.eventId, type);
    if (!first) return new Response("ok", { status: 200 }); // replay (P2-05)

    await applyResendEvent(type, event, message);
    return new Response("ok", { status: 200 });
  } catch (err) {
    // Internal error → 200 + log so the provider does not retry-storm us.
    console.error("[webhook:resend] processing error", redactProviderError(err));
    return new Response("ok", { status: 200 });
  }
}

async function applyResendEvent(
  type: string,
  event: ResendEvent,
  message: OwnedMessage
): Promise<void> {
  const now = new Date().toISOString();

  switch (type) {
    case "email.delivered": {
      // Don't regress a bounced message back to delivered on an out-of-order event.
      if (message.status === "bounced") return;
      await updateMessage(message.id, {
        status: "delivered",
        delivered_at: message.delivered_at ?? now,
      });
      if (message.campaign_id) {
        await recomputeCampaignCounter(message.campaign_id, "delivered_count");
      }
      return;
    }
    case "email.bounced": {
      await updateMessage(message.id, { status: "bounced" });
      if (message.to_address) {
        await addSuppression({
          workspaceId: message.workspace_id,
          channel: "email",
          address: message.to_address,
          reason: "bounce",
          sourceMessageId: message.id,
        });
      }
      if (message.campaign_id) {
        await recomputeCampaignCounter(message.campaign_id, "failed_count");
      }
      return;
    }
    case "email.complained": {
      // A complaint is not a delivery failure: status stays, suppression added.
      if (message.to_address) {
        await addSuppression({
          workspaceId: message.workspace_id,
          channel: "email",
          address: message.to_address,
          reason: "complaint",
          sourceMessageId: message.id,
        });
      }
      const merged = {
        ...(message.provider_response ?? {}),
        ...(sanitizeProviderResponse(event) ?? {}),
        complained_at: now,
      };
      await updateMessage(message.id, { provider_response: merged });
      return;
    }
    case "email.opened": {
      // First-open semantics: never overwrite an existing timestamp (P2-08c).
      if (!message.opened_at) await updateMessage(message.id, { opened_at: now });
      return;
    }
    case "email.clicked": {
      if (!message.clicked_at) await updateMessage(message.id, { clicked_at: now });
      return;
    }
    default:
      return; // unhandled event type: no-op
  }
}
