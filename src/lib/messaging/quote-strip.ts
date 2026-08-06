/**
 * Quoted-reply stripping for inbound email plain text (A-9, P2-24, REQ-SEC-11).
 *
 * Operates on hostile input, so it is bounded (length + iteration capped), uses
 * only single-quantifier regexes (no ReDoS), and is wrapped in try/catch that
 * falls back to "no stripping". English-only for v1 — non-English quote headers
 * (e.g. "Le 5 août 2026, … a écrit :") are deliberately left intact (P2-24b);
 * the full sanitized original is always retained in body_html behind
 * "Show full message".
 *
 * The delimiter set is an enumerated constant (not inline regexes) so a reviewer
 * can read the v1 policy in one place and match it against the criteria.
 */

const MAX_INPUT_CHARS = 256 * 1024; // hard bound: never scan an unbounded body

/**
 * A line matching any of these marks the start of quoted history. Everything
 * from that line to the end of the message is treated as the quoted block.
 * Each pattern is anchored and uses at most one quantifier per run (ReDoS-safe).
 */
export const QUOTE_DELIMITERS: readonly RegExp[] = [
  /^\s*On\b.*\bwrote:\s*$/, // 1. "On <date>, <person> wrote:"
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i, // 2. "-----Original Message-----"
  /^\s*From:\s?\S.*$/, // 3a. Outlook-style forwarded header block ("From:")
  /^\s*Sent:\s?\S.*$/, // 3b. header block ("Sent:")
  /^\s*>/, // 4. leading-">" quoted line runs
  /^\s*_{8,}\s*$/, // 5. "________________" separator rules
];

function isDelimiterLine(line: string): boolean {
  for (const pattern of QUOTE_DELIMITERS) {
    if (pattern.test(line)) return true;
  }
  return false;
}

/**
 * Returns only the new reply text, with the first quoted block (and everything
 * after it) removed. If the input has no quoted history, the original is
 * returned unchanged. If stripping would remove everything, the original is
 * kept rather than returning an empty string (P2-25).
 */
export function stripQuotedReply(text: string | null | undefined): string {
  if (!text) return text ?? "";
  try {
    const capped = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
    const lines = capped.split(/\r?\n/);

    let cutIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isDelimiterLine(lines[i])) {
        cutIndex = i;
        break;
      }
    }

    if (cutIndex === -1) return text; // no quoted history — leave the message whole

    // Trim trailing blank lines left before the delimiter (the usual "\n\n").
    let end = cutIndex;
    while (end > 0 && lines[end - 1].trim() === "") end--;

    const reply = lines.slice(0, end).join("\n").trim();

    // Never empty a legitimate message: if stripping ate everything, keep the
    // original text (mis-strips stay recoverable via the full HTML body).
    return reply.length > 0 ? reply : text;
  } catch {
    return text; // hostile input must never throw out of the webhook
  }
}
