/**
 * Provider-supplied identifiers (provider_id, RFC 5322 Message-ID, In-Reply-To,
 * References, inbound Subject, From) are attacker-controlled strings. Before
 * storage — and before ever being echoed back into an outbound header — they
 * MUST be stripped of CR/LF and length-capped (REQ-SEC-10, T4). A stored
 * Message-ID containing a smuggled `Bcc:` header that is later emitted into
 * In-Reply-To on our own outbound mail is header injection with an extra hop.
 */

// ASCII control characters (0x00-0x1F and DEL 0x7F): CR, LF, tab, etc. Built via
// new RegExp with \u escapes so the SOURCE holds no raw control bytes (which are
// unreviewable and fragile). Each run is collapsed to a single space.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]+", "g");

/** Strip control chars (collapse to space), collapse runs, trim, then cap length. */
export function sanitizeHeaderValue(
  value: string | null | undefined,
  maxLength: number
): string | null {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(CONTROL_CHARS, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, maxLength);
}

export const HEADER_LIMITS = {
  providerId: 255,
  messageId: 998,
  subject: 512,
  address: 320, // RFC 5321 max email length
} as const;
