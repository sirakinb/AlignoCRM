import { Webhook } from "svix";

/**
 * Verifies a Resend webhook's Svix signature (REQ-SEC-01, T1/T9).
 *
 * MUST run against the RAW request body string (`await request.text()`). Do not
 * parse to JSON and re-serialize — key ordering / unicode escaping differ and
 * either break verification or, if "fixed" by verifying the re-serialized form,
 * break the security property. Svix's verify() also enforces a ±5-minute
 * timestamp tolerance, bounding replay for Resend.
 *
 * There is NO development bypass. Callers pass the endpoint's own secret; a
 * missing secret is handled by the caller (503), never by skipping verification.
 * The two Resend webhooks use SEPARATE secrets and each verifies only its own.
 */

export type SvixVerifyResult =
  | { ok: true; event: unknown; eventId: string }
  | { ok: false };

export function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): SvixVerifyResult {
  const svixId = headers.get("svix-id") ?? "";
  const svixTimestamp = headers.get("svix-timestamp") ?? "";
  const svixSignature = headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) return { ok: false };

  try {
    const event = new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    return { ok: true, event, eventId: svixId };
  } catch {
    return { ok: false };
  }
}
