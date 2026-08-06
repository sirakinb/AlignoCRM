/**
 * Redaction helpers for logging (REQ-SEC-21). Message bodies, subjects, full
 * addresses, and tokens MUST NEVER reach application logs — Vercel runtime logs
 * are outside this app's tenant boundary, retention, and deletion controls. When
 * an address is genuinely needed for support triage, log the redacted form.
 */

/** "jane.doe@example.com" -> "ja***@example.com". Never emit the full address. */
export function redactAddress(address: string | null | undefined): string {
  if (!address) return "(none)";
  const at = address.indexOf("@");
  if (at <= 0) return "***";
  const local = address.slice(0, at);
  const domain = address.slice(at); // includes "@"
  const shown = local.slice(0, 2);
  return `${shown}***${domain}`;
}

/** "+15551234567" -> "+1555***4567". Keeps enough to eyeball, not enough to dial. */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "(none)";
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 5)}***${digits.slice(-4)}`;
}

const CONTENT_KEYS = new Set(["body", "html", "text", "body_text", "body_html"]);

/**
 * Strip content fields (body/html/text) from a provider event before storing it
 * in `messages.provider_response` (REQ-SEC-21). The content already lives in
 * `body_text`/`body_html` under proper access control; duplicating it into a
 * JSONB blob defeats any future redaction work. Shallow-strips the top level and
 * a nested `data` object (the shape Resend/Twilio events use).
 */
export function sanitizeProviderResponse(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (CONTENT_KEYS.has(k)) continue;
    if (k === "data" && v && typeof v === "object") {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        if (!CONTENT_KEYS.has(ik)) inner[ik] = iv;
      }
      out[k] = inner;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Provider SDK errors (Resend/Twilio) can carry `config.headers.Authorization`
 * and the full request body. Log only the class and a numeric code/status —
 * never the message or the object (REQ-SEC-21). Returns a short, safe string.
 */
export function redactProviderError(err: unknown): string {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    const name = err instanceof Error ? err.name : (typeof anyErr.name === "string" ? anyErr.name : "Error");
    const code =
      typeof anyErr.code === "string" || typeof anyErr.code === "number"
        ? anyErr.code
        : typeof anyErr.status === "number"
          ? anyErr.status
          : typeof anyErr.statusCode === "number"
            ? anyErr.statusCode
            : undefined;
    return code === undefined ? name : `${name}(${code})`;
  }
  return typeof err === "string" ? "error" : "unknown_error";
}
