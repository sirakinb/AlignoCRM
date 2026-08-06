import { describe, it, expect, beforeEach, afterEach } from "vitest";
import twilio from "twilio";
import { verifyTwilioRequest } from "@/lib/messaging/twilio-signature";

const TOKEN = "test_auth_token_123";
const BASE = "https://app.alignocrm.com";
const PATH = "/api/webhooks/twilio/inbound";

function makeRequest(
  params: Record<string, string>,
  opts: { signature?: string; contentType?: string; extraHeaders?: Record<string, string> } = {}
) {
  const body = new URLSearchParams(params).toString();
  const url = BASE + PATH;
  const signature = opts.signature ?? twilio.getExpectedTwilioSignature(TOKEN, url, params);
  return new Request("http://localhost" + PATH, {
    method: "POST",
    headers: {
      "content-type": opts.contentType ?? "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
      ...(opts.extraHeaders ?? {}),
    },
    body,
  });
}

describe("verifyTwilioRequest", () => {
  const params = { From: "+15551234567", To: "+15559990000", Body: "hi", MessageSid: "SM1" };

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.MESSAGING_PUBLIC_BASE_URL = BASE;
  });
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.MESSAGING_PUBLIC_BASE_URL;
  });

  it("validates a correctly signed request", async () => {
    const res = await verifyTwilioRequest(makeRequest(params), PATH);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.params.From).toBe("+15551234567");
  });

  it("rejects when a param was mutated after signing", async () => {
    const signature = twilio.getExpectedTwilioSignature(TOKEN, BASE + PATH, params);
    const tampered = { ...params, Body: "changed" };
    const res = await verifyTwilioRequest(makeRequest(tampered, { signature }), PATH);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("bad_signature");
  });

  it("ignores attacker-controlled Host / X-Forwarded-* headers (REQ-SEC-02)", async () => {
    const res = await verifyTwilioRequest(
      makeRequest(params, {
        extraHeaders: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
      }),
      PATH
    );
    expect(res.ok).toBe(true); // still validates against the pinned base URL
  });

  it("fails closed when the auth token is unset", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const res = await verifyTwilioRequest(makeRequest(params), PATH);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unconfigured");
  });

  it("rejects a non-form content type", async () => {
    const res = await verifyTwilioRequest(
      makeRequest(params, { contentType: "application/json" }),
      PATH
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("bad_content_type");
  });
});
