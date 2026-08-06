/**
 * Single source of truth for the messaging public base URL (REQ-SEC-02).
 *
 * The Twilio status callback MUST be built from the SAME base URL that
 * `twilio-signature.ts` validates against, or every status callback fails
 * signature and is dropped (no delivered/failed status, no campaign counter
 * updates from Twilio, no 21610 STOP reconciliation). Both the sender
 * (sms-service.ts) and the verifier resolve the base through here so they can
 * never drift — this replaces the earlier statusCallback-from-NEXT_PUBLIC_APP_URL
 * mismatch.
 */

export const TWILIO_STATUS_PATH = "/api/webhooks/twilio/status";

/** The pinned public base URL, trailing slash stripped, or null if unset. */
export function messagingPublicBaseUrl(): string | null {
  const base = process.env.MESSAGING_PUBLIC_BASE_URL;
  if (!base) return null;
  return base.replace(/\/$/, "");
}

/** Absolute Twilio status-callback URL, or null when the base URL is unset. */
export function twilioStatusCallbackUrl(): string | null {
  const base = messagingPublicBaseUrl();
  return base ? `${base}${TWILIO_STATUS_PATH}` : null;
}
