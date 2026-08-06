import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import twilio from "twilio";

const { store, claimWebhookEvent, addSuppression, checkRateLimit } = vi.hoisted(() => ({
  store: {
    findMessageByProviderId: vi.fn(),
    updateMessage: vi.fn(),
    recomputeCampaignCounter: vi.fn(),
  },
  claimWebhookEvent: vi.fn(),
  addSuppression: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/messaging/webhook-store", () => store);
vi.mock("@/lib/messaging/webhook-events", () => ({ claimWebhookEvent }));
vi.mock("@/lib/messaging/suppressions", () => ({ addSuppression }));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkRateLimit,
  RATE_LIMITS: {
    webhookPerRoute: { limit: 600, windowMs: 60_000 },
    smsAutoCreatePerWorkspace: { limit: 50, windowMs: 3_600_000 },
  },
}));

import { POST } from "@/app/api/webhooks/twilio/status/route";

const TOKEN = "twilio_status_token";
const BASE = "https://app.alignocrm.com";
const PATH = "/api/webhooks/twilio/status";

function signedRequest(params: Record<string, string>, opts: { badSig?: boolean } = {}) {
  const body = new URLSearchParams(params).toString();
  const signature = opts.badSig
    ? "bogus"
    : twilio.getExpectedTwilioSignature(TOKEN, BASE + PATH, params);
  return new Request("http://localhost" + PATH, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body,
  });
}

const BASE_MESSAGE = {
  id: "m-1",
  workspace_id: "ws-1",
  status: "sent",
  campaign_id: null,
  to_address: "+13105551234",
  delivered_at: null,
  opened_at: null,
  clicked_at: null,
  provider_response: null,
};

describe("POST /api/webhooks/twilio/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.MESSAGING_PUBLIC_BASE_URL = BASE;
    claimWebhookEvent.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue(true);
    store.findMessageByProviderId.mockResolvedValue({ ...BASE_MESSAGE });
    store.updateMessage.mockResolvedValue(undefined);
    store.recomputeCampaignCounter.mockResolvedValue(undefined);
    addSuppression.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.MESSAGING_PUBLIC_BASE_URL;
  });

  it("rejects an invalid signature with 403 (P2-01)", async () => {
    const res = await POST(signedRequest({ MessageSid: "SM1", MessageStatus: "delivered" }, { badSig: true }));
    expect(res.status).toBe(403);
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("delivered → status delivered + delivered_at (P2-22)", async () => {
    const res = await POST(signedRequest({ MessageSid: "SM1", MessageStatus: "delivered" }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).toHaveBeenCalledWith(
      "m-1",
      expect.objectContaining({ status: "delivered", delivered_at: expect.any(String) })
    );
  });

  it("undelivered → failed, error captured (P2-22)", async () => {
    const res = await POST(
      signedRequest({ MessageSid: "SM1", MessageStatus: "undelivered", ErrorCode: "30006", ErrorMessage: "Landline" })
    );
    expect(res.status).toBe(200);
    const patch = store.updateMessage.mock.calls[0][1];
    expect(patch.status).toBe("failed");
    expect(patch.error).toContain("30006");
  });

  it("late 'sent' after 'delivered' does not regress (P2-23)", async () => {
    store.findMessageByProviderId.mockResolvedValue({ ...BASE_MESSAGE, status: "delivered" });
    const res = await POST(signedRequest({ MessageSid: "SM1", MessageStatus: "sent" }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("error 21610 writes an sms 'stop' suppression + marks failed (P2-19b)", async () => {
    const res = await POST(
      signedRequest({ MessageSid: "SM1", MessageStatus: "failed", ErrorCode: "21610" })
    );
    expect(res.status).toBe(200);
    expect(store.updateMessage).toHaveBeenCalledWith("m-1", expect.objectContaining({ status: "failed" }));
    expect(addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", channel: "sms", address: "+13105551234", reason: "stop" })
    );
  });

  it("duplicate SID+status callback is a no-op 200 (P2-05)", async () => {
    claimWebhookEvent.mockResolvedValue(false);
    const res = await POST(signedRequest({ MessageSid: "SM1", MessageStatus: "delivered" }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("unknown MessageSid → 200 no-op (REQ-SEC-03)", async () => {
    store.findMessageByProviderId.mockResolvedValue(null);
    const res = await POST(signedRequest({ MessageSid: "nope", MessageStatus: "delivered" }));
    expect(res.status).toBe(200);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(store.updateMessage).not.toHaveBeenCalled();
  });
});
