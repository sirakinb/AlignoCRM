import { describe, it, expect } from "vitest";
import {
  normalizeE164,
  normalizeSendableE164,
  phoneMatchCandidates,
  PhoneError,
} from "@/lib/messaging/phone";

describe("phoneMatchCandidates (inbound-SMS matching, no scan)", () => {
  it("generates the common stored formats for a US E.164", () => {
    const c = phoneMatchCandidates("+13105551234");
    expect(c).toContain("+13105551234");
    expect(c).toContain("13105551234");
    expect(c).toContain("3105551234");
    expect(c).toContain("(310) 555-1234");
    expect(c).toContain("310-555-1234");
    expect(c).toContain("310.555.1234");
    // deduped
    expect(new Set(c).size).toBe(c.length);
  });

  it("returns just the E.164 for a non-NANP number", () => {
    expect(phoneMatchCandidates("+442071838750")).toEqual(["+442071838750"]);
  });
});

describe("normalizeE164", () => {
  it("normalizes US numbers in various formats to E.164", () => {
    expect(normalizeE164("(212) 523-8886")).toBe("+12125238886");
    expect(normalizeE164("212-523-8886")).toBe("+12125238886");
    expect(normalizeE164("+1 212 523 8886")).toBe("+12125238886");
  });

  it("returns null for empty or unparseable input", () => {
    expect(normalizeE164(null)).toBeNull();
    expect(normalizeE164("")).toBeNull();
    expect(normalizeE164("not a phone")).toBeNull();
  });
});

describe("normalizeSendableE164 — REQ-SEC-18 allowlist", () => {
  it("accepts valid US/Canada numbers", () => {
    expect(normalizeSendableE164("+12125238886")).toBe("+12125238886"); // US
    expect(normalizeSendableE164("(604) 559-1234")).toBe("+16045591234"); // Canada
  });

  it("rejects non-+1 international numbers (anti-pumping)", () => {
    expect(() => normalizeSendableE164("+447700900000")).toThrow(PhoneError); // UK
    expect(() => normalizeSendableE164("+8801700000000")).toThrow(PhoneError); // BD
  });

  it("rejects premium-rate 900 numbers", () => {
    expect(() => normalizeSendableE164("+19005551234")).toThrow(PhoneError);
  });

  it("rejects non-US/Canada NANP (+1 Caribbean) fraud ranges", () => {
    expect(() => normalizeSendableE164("+18765551234")).toThrow(PhoneError); // Jamaica
    expect(() => normalizeSendableE164("+18095551234")).toThrow(PhoneError); // Dominican Republic
    expect(() => normalizeSendableE164("+18685551234")).toThrow(PhoneError); // Trinidad & Tobago
  });

  it("rejects missing numbers with a clear error", () => {
    expect(() => normalizeSendableE164(null)).toThrow(/No phone number/);
  });
});
