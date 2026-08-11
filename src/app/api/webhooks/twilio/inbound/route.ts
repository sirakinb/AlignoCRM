import { verifyTwilioRequest } from "@/lib/messaging/twilio-signature";
import { claimWebhookEvent } from "@/lib/messaging/webhook-events";
import { ensureConversation } from "@/lib/messaging/send-message";
import { normalizeE164 } from "@/lib/messaging/phone";
import { isStartKeyword, isStopKeyword } from "@/lib/messaging/sms-keywords";
import { addSuppression, removeSuppression } from "@/lib/messaging/suppressions";
import {
  findSmsWorkspaceByNumber,
  findContactByPhone,
  createInboundSmsContact,
  insertInboundMessage,
  bumpConversationInbound,
} from "@/lib/messaging/webhook-store";
import { sanitizeHeaderValue, HEADER_LIMITS } from "@/lib/messaging/header-safety";
import { redactPhone, redactProviderError } from "@/lib/messaging/redact";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/webhooks/twilio/inbound"; // literal, never request-derived
const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(status: number): Response {
  return new Response(TWIML_EMPTY, {
    status,
    headers: { "content-type": "text/xml" },
  });
}

/**
 * Twilio inbound-SMS webhook (REQ-SEC-02/03/04). Signature validated against the
 * PINNED public base URL; workspace derived from the To number's channel row;
 * contact matched (or auto-created) by From WITHIN that workspace only.
 */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? "0") > 1024 * 1024) {
    return new Response("Payload too large", { status: 413 }); // REQ-SEC-05
  }
  const verified = await verifyTwilioRequest(request, ROUTE_PATH);
  if (!verified.ok) {
    if (verified.reason === "unconfigured") {
      console.error("[webhook:twilio-inbound] TWILIO_AUTH_TOKEN / MESSAGING_PUBLIC_BASE_URL missing");
      return new Response("Not configured", { status: 503 }); // fail closed
    }
    if (verified.reason === "bad_content_type") {
      return new Response("Bad request", { status: 400 });
    }
    if (verified.reason === "too_large") {
      return new Response("Payload too large", { status: 413 });
    }
    console.warn("[webhook:twilio-inbound] signature rejected");
    return new Response("Forbidden", { status: 403 });
  }

  const { limit, windowMs } = RATE_LIMITS.webhookPerRoute;
  if (!(await checkRateLimit("wh:twilio-inbound", limit, windowMs))) {
    return new Response("Rate limited", { status: 429, headers: { "retry-after": "60" } });
  }

  const params = verified.params;
  try {
    const messageSid = params.MessageSid ?? params.SmsSid ?? "";
    const rawFrom = params.From ?? "";
    const rawTo = params.To ?? "";
    const body = params.Body ?? "";
    if (!messageSid || !rawFrom || !rawTo) {
      console.warn("[webhook:twilio-inbound] malformed params");
      return twiml(200); // survivable (REQ-SEC-05)
    }

    // Workspace is derived from OUR number (the To), from a DB row (REQ-SEC-03).
    // Normalize before lookup so channel config stored as E.164 matches Twilio's
    // format (fall back to raw so a raw-stored value still resolves) — QA #2.
    const toE164 = normalizeE164(rawTo) ?? rawTo;
    const channel = await findSmsWorkspaceByNumber(toE164);
    if (!channel) {
      console.info("[webhook:twilio-inbound] no workspace for To number");
      return twiml(200); // unknown destination → no-op 200
    }
    const workspaceId = channel.workspace_id;

    const fromE164 = normalizeE164(rawFrom);
    if (!fromE164) {
      console.info("[webhook:twilio-inbound] unparseable From", { from: redactPhone(rawFrom) });
      return twiml(200);
    }

    // Idempotency per MessageSid (Twilio has no signature timestamp → unbounded
    // replay; this is the only defense — REQ-SEC-04).
    const first = await claimWebhookEvent("twilio", messageSid, "sms.inbound");
    if (!first) return twiml(200);

    // Match within the workspace, else auto-create a phone-only contact (P2-18),
    // bounded per workspace so an inbound flood from spoofed numbers can't create
    // unbounded contacts (REQ-SEC-17).
    let contact = await findContactByPhone(workspaceId, fromE164);
    if (!contact) {
      const { limit: acLimit, windowMs: acWindow } = RATE_LIMITS.smsAutoCreatePerWorkspace;
      if (!(await checkRateLimit(`sms-autocreate:${workspaceId}`, acLimit, acWindow))) {
        console.warn("[webhook:twilio-inbound] auto-create rate limit hit; dropping");
        return twiml(200); // don't create; don't 500 — drop and log
      }
      contact = await createInboundSmsContact(workspaceId, fromE164);
    }

    const conversation = await ensureConversation(workspaceId, contact.id);

    // The message is stored regardless of keyword (operators need to see why
    // sending stopped — P2-21). SMS sender is carrier-verified.
    await insertInboundMessage({
      workspaceId,
      conversationId: conversation.id,
      contactId: contact.id,
      channel: "sms",
      bodyText: sanitizeHeaderValue(body, 4096) ?? body.slice(0, 4096),
      bodyHtml: null,
      fromAddress: fromE164,
      toAddress: sanitizeHeaderValue(toE164, HEADER_LIMITS.address),
      provider: "twilio",
      providerId: messageSid,
      emailMessageId: null,
      subject: null,
      senderVerified: true,
    });

    await bumpConversationInbound(conversation.id, {
      channel: "sms",
      preview: body.slice(0, 140),
      subject: null,
      currentUnread: conversation.unread_count,
    });

    // Opt-out / opt-in keyword handling (app-side mirror of Advanced Opt-Out).
    if (isStopKeyword(body)) {
      await addSuppression({ workspaceId, channel: "sms", address: fromE164, reason: "stop" });
    } else if (isStartKeyword(body)) {
      await removeSuppression(workspaceId, "sms", fromE164);
    }

    return twiml(200);
  } catch (err) {
    console.error("[webhook:twilio-inbound] processing error", redactProviderError(err));
    return twiml(200);
  }
}
