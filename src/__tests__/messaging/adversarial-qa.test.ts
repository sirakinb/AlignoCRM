/**
 * Adversarial QA for Phase 2 (two-way webhook plumbing).
 *
 * Added by the QA pass — does NOT modify route/lib source. Tests that use
 * `it.fails` document a CONFIRMED defect: the body asserts the *correct*
 * behavior, `it.fails` records that the current implementation does not meet it,
 * so the suite stays green while the gap is pinned for the executor to fix.
 */
import { describe, it, expect } from "vitest";
import { sanitizeInboundHtml } from "@/lib/messaging/sanitize-html";
import { isStopKeyword, isStartKeyword } from "@/lib/messaging/sms-keywords";
import { twilioStatusCallbackUrl, messagingPublicBaseUrl } from "@/lib/messaging/urls";

// ── Sanitizer: does the real allowedStyles config stop CSS-based script? ───────
describe("sanitizeInboundHtml — style-based vectors (real config)", () => {
  it("drops background:url(javascript:) shorthand (not in allowedStyles allowlist)", () => {
    const out = sanitizeInboundHtml('<div style="background:url(javascript:alert(1))">x</div>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/url\(/i);
  });

  it("drops CSS expression() in a color value", () => {
    const out = sanitizeInboundHtml('<div style="color:expression(alert(1))">x</div>');
    expect(out).not.toMatch(/expression/i);
  });

  it("drops position/behavior properties entirely", () => {
    const out = sanitizeInboundHtml('<div style="behavior:url(#x);position:fixed;top:0">x</div>');
    expect(out).not.toMatch(/behavior/i);
    expect(out).not.toMatch(/position/i);
  });

  it("neutralizes an mXSS mglyph/style breakout", () => {
    const out = sanitizeInboundHtml(
      "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>"
    );
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/<style/i);
  });
});

// ── SMS keyword matching: correctness of the first-word heuristic ──────────────
describe("sms-keywords — opt-out keyword matching", () => {
  it("matches the canonical forms", () => {
    expect(isStopKeyword("STOP")).toBe(true);
    expect(isStopKeyword(" stop ")).toBe(true);
    expect(isStopKeyword("Stop")).toBe(true);
    expect(isStartKeyword("START")).toBe(true);
    expect(isStartKeyword("unstop")).toBe(true);
  });

  it("does NOT suppress when 'stop' appears mid-sentence", () => {
    // "please stop texting me" — first word is "PLEASE", so not an opt-out.
    // (Documenting current behavior; this is arguably a missed opt-out, but the
    // flagged concern was the inverse — a mid-sentence 'stop' wrongly firing.)
    expect(isStopKeyword("please stop texting me")).toBe(false);
  });

  // FIXED (was DEFECT 1): trailing punctuation is now stripped before matching,
  // so "STOP." / "STOP!" opt out (canonicalize drops non-alphanumerics).
  it("treats 'STOP.' (trailing punctuation) as opt-out", () => {
    expect(isStopKeyword("STOP.")).toBe(true);
  });

  it("treats 'STOP!' as opt-out", () => {
    expect(isStopKeyword("STOP!")).toBe(true);
  });

  // FIXED (was DEFECT 2): matching is now whole-body-exact, so a benign message
  // that merely contains "stop" does not opt the contact out.
  it("does NOT suppress a benign 'Stop by ...' message", () => {
    expect(isStopKeyword("Stop by the store later")).toBe(false);
  });

  // FIXED: NFKC normalization folds fullwidth forms to ASCII.
  it("handles fullwidth 'ＳＴＯＰ'", () => {
    expect(isStopKeyword("ＳＴＯＰ")).toBe(true);
  });
});

// ── Concern #1: statusCallback URL vs Twilio signature URL are decoupled ───────
// sms-service.ts builds statusCallback from NEXT_PUBLIC_APP_URL; twilio/status
// verifies the signature against MESSAGING_PUBLIC_BASE_URL. Twilio signs the
// callback over the statusCallback URL it was given. If the two env values
// differ in scheme/host/trailing-slash, EVERY status callback fails signature
// validation (403) and is dropped: no delivered/failed status, no campaign
// counter updates, and the 21610 blocked-number STOP reconciliation never fires.
describe("Twilio statusCallback / signature URL coupling (concern #1)", () => {
  const PATH = "/api/webhooks/twilio/status";
  // Reproduces the two construction expressions verbatim from source.
  const smsServiceCallback = (appUrl: string) => `${appUrl}${PATH}`;
  const verifierUrl = (base: string) => `${base.replace(/\/$/, "")}${PATH}`;

  it("committed example env values produce mismatched URLs → all callbacks drop", () => {
    // From .env.local.example
    const NEXT_PUBLIC_APP_URL = "http://localhost:9000";
    const MESSAGING_PUBLIC_BASE_URL = "https://www.alignocrm.com";
    const signed = smsServiceCallback(NEXT_PUBLIC_APP_URL); // URL Twilio signs
    const verified = verifierUrl(MESSAGING_PUBLIC_BASE_URL); // URL we validate against
    // These MUST be byte-identical for validateRequest to pass. They are not.
    expect(signed).not.toBe(verified);
  });

  it("even matched hosts break on a www / trailing-slash mismatch", () => {
    expect(smsServiceCallback("https://alignocrm.com")).not.toBe(
      verifierUrl("https://www.alignocrm.com")
    );
    expect(smsServiceCallback("https://app.alignocrm.com/")).not.toBe(
      verifierUrl("https://app.alignocrm.com")
    );
  });

  // FIXED (HIGH): the statusCallback is now built from MESSAGING_PUBLIC_BASE_URL —
  // the SAME base the verifier validates against — via one shared helper. The two
  // are coupled through urls.ts, so they can no longer drift.
  it("the sender's statusCallback and the verifier URL share one source", () => {
    const prev = process.env.MESSAGING_PUBLIC_BASE_URL;
    try {
      process.env.MESSAGING_PUBLIC_BASE_URL = "https://app.alignocrm.com/";
      // Re-import fresh so the helper reads the env we just set.
      const sent = twilioStatusCallbackUrl(); // what sms-service sets on the send
      const verified = verifierUrl(messagingPublicBaseUrl()!); // what the route validates
      expect(sent).toBe(verified);
      expect(sent).toBe("https://app.alignocrm.com/api/webhooks/twilio/status");
    } finally {
      if (prev === undefined) delete process.env.MESSAGING_PUBLIC_BASE_URL;
      else process.env.MESSAGING_PUBLIC_BASE_URL = prev;
    }
  });
});
