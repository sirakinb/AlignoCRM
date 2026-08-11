import { describe, it, expect } from "vitest";
import { sanitizeHeaderValue, HEADER_LIMITS } from "@/lib/messaging/header-safety";

describe("sanitizeHeaderValue", () => {
  it("strips CR/LF so a smuggled header cannot be injected (REQ-SEC-10)", () => {
    const dirty = "<abc@mail.example>\r\nBcc: victim@evil.com";
    const clean = sanitizeHeaderValue(dirty, HEADER_LIMITS.messageId);
    expect(clean).not.toMatch(/[\r\n]/);
    expect(clean).not.toContain("Bcc:victim");
    // the newline becomes a space, so the token stays but is one line
    expect(clean).toBe("<abc@mail.example> Bcc: victim@evil.com");
  });

  it("caps length", () => {
    const long = "x".repeat(2000);
    expect(sanitizeHeaderValue(long, 10)).toHaveLength(10);
  });

  it("returns null for empty / whitespace-only / null", () => {
    expect(sanitizeHeaderValue(null, 10)).toBeNull();
    expect(sanitizeHeaderValue("", 10)).toBeNull();
    expect(sanitizeHeaderValue("   ", 10)).toBeNull();
  });

  it("preserves hyphens and normal punctuation", () => {
    expect(sanitizeHeaderValue("re-subject: hi-there", 100)).toBe("re-subject: hi-there");
  });

  // Security #3: exact assertion requested — no raw \r/\n survive.
  it('sanitizeHeaderValue("a\\r\\nBcc: x@y.z", 100) has no CR/LF', () => {
    const out = sanitizeHeaderValue("a\r\nBcc: x@y.z", 100);
    expect(out).not.toMatch(/[\r\n]/);
  });
});
