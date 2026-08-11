import { describe, it, expect, afterEach } from "vitest";
import { messagingPublicBaseUrl, twilioStatusCallbackUrl, TWILIO_STATUS_PATH } from "@/lib/messaging/urls";

describe("messaging urls (HIGH — single source of truth)", () => {
  afterEach(() => {
    delete process.env.MESSAGING_PUBLIC_BASE_URL;
  });

  it("strips a trailing slash from the base", () => {
    process.env.MESSAGING_PUBLIC_BASE_URL = "https://app.alignocrm.com/";
    expect(messagingPublicBaseUrl()).toBe("https://app.alignocrm.com");
  });

  it("builds the status callback as base + the literal status path", () => {
    process.env.MESSAGING_PUBLIC_BASE_URL = "https://app.alignocrm.com";
    expect(twilioStatusCallbackUrl()).toBe(`https://app.alignocrm.com${TWILIO_STATUS_PATH}`);
  });

  it("returns null when the base is unset (caller decides)", () => {
    expect(messagingPublicBaseUrl()).toBeNull();
    expect(twilioStatusCallbackUrl()).toBeNull();
  });
});
