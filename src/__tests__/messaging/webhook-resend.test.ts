import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "svix";

const { store, claimWebhookEvent, addSuppression, checkRateLimit } = vi.hoisted(() => ({
  store: {
    findMessageByProviderId: vi.fn(),
    recomputeCampaignCounter: vi.fn(),
    updateMessage: vi.fn(),
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

import { POST } from "@/app/api/webhooks/resend/route";

const SECRET = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

function signedRequest(event: unknown, secret = SECRET) {
  const body = JSON.stringify(event);
  const wh = new Webhook(secret);
  const id = "msg_" + Math.random().toString(36).slice(2);
  const when = new Date();
  const signature = wh.sign(id, when, body);
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": Math.floor(when.getTime() / 1000).toString(),
    "svix-signature": signature,
  });
  return new Request("http://localhost/api/webhooks/resend", { method: "POST", headers, body });
}

const BASE_MESSAGE = {
  id: "m-1",
  workspace_id: "ws-1",
  status: "sent",
  campaign_id: null,
  to_address: "alice@example.com",
  delivered_at: null,
  opened_at: null,
  clicked_at: null,
  provider_response: null,
};

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    claimWebhookEvent.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue(true);
    store.findMessageByProviderId.mockResolvedValue({ ...BASE_MESSAGE });
    store.updateMessage.mockResolvedValue(undefined);
    store.recomputeCampaignCounter.mockResolvedValue(undefined);
    addSuppression.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it("fails closed with 503 when the secret is unset (P2-04)", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(signedRequest({ type: "email.delivered", data: { email_id: "re_1" } }));
    expect(res.status).toBe(503);
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 401 and writes nothing (P2-01)", async () => {
    const wrong = "whsec_" + Buffer.from("ffffffffffffffffffffffffffffffff").toString("base64");
    const res = await POST(signedRequest({ type: "email.delivered", data: { email_id: "re_1" } }, wrong));
    expect(res.status).toBe(401);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("email.delivered → status delivered + delivered_at (P2-08)", async () => {
    const res = await POST(signedRequest({ type: "email.delivered", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).toHaveBeenCalledWith(
      "m-1",
      expect.objectContaining({ status: "delivered", delivered_at: expect.any(String) })
    );
  });

  it("email.bounced → status bounced, suppression, campaign failed_count (P2-08/09/10)", async () => {
    store.findMessageByProviderId.mockResolvedValue({ ...BASE_MESSAGE, campaign_id: "camp-1" });
    const res = await POST(signedRequest({ type: "email.bounced", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).toHaveBeenCalledWith("m-1", expect.objectContaining({ status: "bounced" }));
    expect(addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", channel: "email", address: "alice@example.com", reason: "bounce" })
    );
    expect(store.recomputeCampaignCounter).toHaveBeenCalledWith("camp-1", "failed_count");
  });

  it("returns 429 when the per-route flood guard trips (REQ-SEC-17)", async () => {
    checkRateLimit.mockResolvedValue(false);
    const res = await POST(signedRequest({ type: "email.delivered", data: { email_id: "re_1" } }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("email.complained → suppression written, status NOT changed (P2-08b)", async () => {
    const res = await POST(signedRequest({ type: "email.complained", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
    expect(addSuppression).toHaveBeenCalledWith(expect.objectContaining({ reason: "complaint" }));
    // the only updateMessage call must not set status
    for (const call of store.updateMessage.mock.calls) {
      expect(call[1]).not.toHaveProperty("status");
    }
  });

  it("email.opened → opened_at set; status unchanged (P2-08b)", async () => {
    const res = await POST(signedRequest({ type: "email.opened", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).toHaveBeenCalledWith("m-1", { opened_at: expect.any(String) });
  });

  it("repeat email.opened does NOT overwrite the first timestamp (P2-08c)", async () => {
    store.findMessageByProviderId.mockResolvedValue({ ...BASE_MESSAGE, opened_at: "2026-01-01T00:00:00Z" });
    const res = await POST(signedRequest({ type: "email.opened", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("unknown provider_id → 200 no-op, no claim, no write (P2-11)", async () => {
    store.findMessageByProviderId.mockResolvedValue(null);
    const res = await POST(signedRequest({ type: "email.delivered", data: { email_id: "nope" } }));
    expect(res.status).toBe(200);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("duplicate delivery is a no-op 200 (P2-05)", async () => {
    claimWebhookEvent.mockResolvedValue(false);
    const res = await POST(signedRequest({ type: "email.delivered", data: { email_id: "re_1" } }));
    expect(res.status).toBe(200);
    expect(store.updateMessage).not.toHaveBeenCalled();
  });

  it("malformed body (signed) → 200, survivable (P2-06)", async () => {
    const res = await POST(signedRequest({ nonsense: true }));
    expect(res.status).toBe(200);
    expect(store.findMessageByProviderId).not.toHaveBeenCalled();
  });
});
