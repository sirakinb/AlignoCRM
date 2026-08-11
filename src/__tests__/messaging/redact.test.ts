import { describe, it, expect } from "vitest";
import {
  redactAddress,
  redactPhone,
  redactProviderError,
  sanitizeProviderResponse,
} from "@/lib/messaging/redact";

describe("redactAddress", () => {
  it("keeps first two local chars and the domain", () => {
    expect(redactAddress("jane.doe@example.com")).toBe("ja***@example.com");
  });
  it("handles empty / malformed", () => {
    expect(redactAddress(null)).toBe("(none)");
    expect(redactAddress("notanemail")).toBe("***");
  });
});

describe("redactPhone", () => {
  it("keeps country+prefix and last four", () => {
    expect(redactPhone("+15551234567")).toBe("+1555***4567");
  });
  it("handles empty / too short", () => {
    expect(redactPhone(null)).toBe("(none)");
    expect(redactPhone("12345")).toBe("***");
  });
});

describe("redactProviderError", () => {
  it("emits only class and code, never the message", () => {
    const err = new Error("Authorization: Bearer sk_secret");
    (err as unknown as { status: number }).status = 429;
    const out = redactProviderError(err);
    expect(out).toContain("Error");
    expect(out).toContain("429");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("Bearer");
  });
});

describe("sanitizeProviderResponse", () => {
  it("strips content fields at top level and inside data", () => {
    const out = sanitizeProviderResponse({
      type: "email.complained",
      html: "<p>secret</p>",
      text: "secret",
      data: { email_id: "re_1", body: "secret", subject: "keep" },
    });
    expect(out).toEqual({
      type: "email.complained",
      data: { email_id: "re_1", subject: "keep" },
    });
  });
  it("returns null for non-objects", () => {
    expect(sanitizeProviderResponse("x")).toBeNull();
    expect(sanitizeProviderResponse(null)).toBeNull();
  });
});
