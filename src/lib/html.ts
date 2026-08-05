/**
 * Escape a string for safe interpolation into HTML text/attribute context.
 * Use this at EVERY point where user- or contact-controlled data is placed into
 * an HTML email or page. Merge-tag interpolation into email HTML must go through
 * here (REQ-SEC-12) — the invite email (IR-5) is the cautionary in-repo example
 * of what happens when it doesn't.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
