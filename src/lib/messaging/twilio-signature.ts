import twilio from "twilio";

/**
 * Verifies an inbound Twilio webhook's `X-Twilio-Signature` (REQ-SEC-02, T1/T8).
 *
 * THE URL-RECONSTRUCTION PITFALL — read before touching this. Twilio signs over
 * the exact URL it was configured to call, plus the POST params. Two ways naive
 * implementations break:
 *   - `request.url` on Vercel does not reliably reproduce the public URL (edge
 *     TLS termination, internal hostnames, path rewrites) — verification fails
 *     and inbound SMS silently drops.
 *   - Rebuilding from `Host` / `x-forwarded-*` headers "fixes" that but those are
 *     attacker-controlled: an attacker sets Host to whatever makes their forged
 *     signature validate. That is a bypass, not a validation.
 *
 * So the URL is pinned from configuration (`MESSAGING_PUBLIC_BASE_URL`) + a
 * hardcoded literal path passed by the caller. Request headers are never
 * consulted for URL reconstruction.
 */

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB (REQ-SEC-05)

export type TwilioVerifyResult =
  | { ok: true; params: Record<string, string> }
  | {
      ok: false;
      params: null;
      reason: "unconfigured" | "bad_content_type" | "too_large" | "bad_signature";
    };

export async function verifyTwilioRequest(
  request: Request,
  /** A STRING LITERAL from the call site, e.g. "/api/webhooks/twilio/inbound". Never request-derived. */
  path: string
): Promise<TwilioVerifyResult> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.MESSAGING_PUBLIC_BASE_URL;
  // Fail closed: no auth token or no pinned base URL means we cannot verify.
  if (!token || !base) return { ok: false, params: null, reason: "unconfigured" };

  // Twilio posts application/x-www-form-urlencoded. Anything else is not a
  // genuine Twilio callback; reject before attempting the form-body variant.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return { ok: false, params: null, reason: "bad_content_type" };
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";

  // Read raw text then parse deterministically. Do NOT use request.formData() —
  // it consumes the body and gives less control over param extraction. Cap the
  // body here too: a request that omits content-length slips past the route's
  // header check, then this bounds the actual read (REQ-SEC-05, QA #13).
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, params: null, reason: "too_large" };
  }
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const url = `${base.replace(/\/$/, "")}${path}`; // pinned base + literal path
  const ok = validate(token, signature, url, params);
  return ok
    ? { ok: true, params }
    : { ok: false, params: null, reason: "bad_signature" };
}

function validate(
  token: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  try {
    return twilio.validateRequest(token, signature, url, params);
  } catch {
    return false;
  }
}
