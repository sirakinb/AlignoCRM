/**
 * Twilio Advanced Opt-Out keyword sets. Carrier-level Advanced Opt-Out already
 * blocks/starts at the carrier; we ALSO handle these in the inbound webhook so a
 * suppression row exists app-side and the send gate (send-message.ts) refuses
 * before ever reaching Twilio (belt-and-suspenders, A-7).
 */

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

/**
 * Canonicalize a message body for keyword matching:
 *  - NFKC-normalize so fullwidth/compatibility forms fold to ASCII (ＳＴＯＰ → STOP)
 *  - uppercase, then strip everything that isn't A–Z/0–9
 *
 * The result is compared for EXACT equality against the keyword set. So "STOP" /
 * " stop " / "STOP." / "STOP!" all opt out, while a benign message that merely
 * contains a keyword ("Stop by the store later", "please stop texting me") does
 * NOT — its canonical form is not a bare keyword. This mirrors carrier opt-out
 * matching and avoids both the missed ("STOP.") and spurious ("Stop by…")
 * opt-outs of the previous first-word heuristic.
 */
function canonicalize(body: string): string {
  return body.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Whole message (punctuation/spacing ignored) is a STOP-family opt-out keyword. */
export function isStopKeyword(body: string | null | undefined): boolean {
  if (!body) return false;
  return STOP_KEYWORDS.has(canonicalize(body));
}

/** Whole message is a START/UNSTOP opt-in keyword. */
export function isStartKeyword(body: string | null | undefined): boolean {
  if (!body) return false;
  return START_KEYWORDS.has(canonicalize(body));
}
