import { verifyTwilioRequest } from "@/lib/messaging/twilio-signature";
import { claimWebhookEvent } from "@/lib/messaging/webhook-events";
import { applyTrusthubStatusUpdate } from "@/lib/messaging/sms-compliance";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { redactProviderError } from "@/lib/messaging/redact";

export const runtime = "nodejs";

const ROUTE_PATH = "/api/webhooks/twilio/trusthub";

/**
 * Twilio TrustHub / A2P status callbacks. Signature-validated against the
 * pinned public base URL. Bundle SID → workspace_sms_profiles update.
 */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? "0") > 1024 * 1024) {
    return new Response("Payload too large", { status: 413 });
  }

  const verified = await verifyTwilioRequest(request, ROUTE_PATH);
  if (!verified.ok) {
    if (verified.reason === "unconfigured") {
      console.error("[webhook:twilio-trusthub] missing TWILIO_AUTH_TOKEN / MESSAGING_PUBLIC_BASE_URL");
      return new Response("Not configured", { status: 503 });
    }
    if (verified.reason === "bad_content_type") {
      return new Response("Bad request", { status: 400 });
    }
    if (verified.reason === "too_large") {
      return new Response("Payload too large", { status: 413 });
    }
    console.warn("[webhook:twilio-trusthub] signature rejected");
    return new Response("Forbidden", { status: 403 });
  }

  const { limit, windowMs } = RATE_LIMITS.webhookPerRoute;
  if (!(await checkRateLimit("wh:twilio-trusthub", limit, windowMs))) {
    return new Response("Rate limited", { status: 429, headers: { "retry-after": "60" } });
  }

  try {
    const params = verified.params;
    const bundleSid =
      params.BundleSid ||
      params.CustomerProfileSid ||
      params.TrustProductSid ||
      params.BrandSid ||
      "";
    const status = params.Status || params.AccountStatus || "";
    const eventId =
      params.EventId ||
      params.Sid ||
      `${bundleSid}:${status}:${params.Timestamp || Date.now()}`;

    if (!bundleSid) {
      console.info("[webhook:twilio-trusthub] no bundle sid; ignoring");
      return new Response("ok", { status: 200 });
    }

    const first = await claimWebhookEvent("twilio", eventId, "trusthub.status");
    if (!first) return new Response("ok", { status: 200 });

    await applyTrusthubStatusUpdate({ bundleSid, status });
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[webhook:twilio-trusthub] processing error", redactProviderError(err));
    return new Response("ok", { status: 200 });
  }
}
