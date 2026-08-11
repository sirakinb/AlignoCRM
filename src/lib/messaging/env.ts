/**
 * Messaging environment access (REQ-SEC-20). Secrets are read through these
 * helpers, never `process.env.X!` — a non-null assertion on an unset secret puts
 * `undefined` into an HMAC, which then "verifies" attacker input signed with the
 * same undefined key. Every getter fails CLOSED with a descriptive error.
 */

/**
 * The HMAC signing key for unsubscribe tokens (REQ-SEC-08) and campaign job
 * tokens (REQ-SEC-16). MUST be distinct from ALIGNO_API_KEY and any provider
 * credential, and MUST be present and long enough — an empty or short key is a
 * forgeable signature (P5-05b).
 */
export function requireMessagingTokenSecret(): string {
  const secret = process.env.MESSAGING_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "MESSAGING_TOKEN_SECRET is unset or too short (need ≥32 chars). " +
        "Refusing to sign or verify a token with a weak/empty key."
    );
  }
  return secret;
}
