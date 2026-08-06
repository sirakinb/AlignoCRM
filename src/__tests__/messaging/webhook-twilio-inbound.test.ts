import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import twilio from "twilio";

const { store, claimWebhookEvent, addSuppression, removeSuppression, ensureConversation, checkRateLimit } =
  vi.hoisted(() => ({
    store: {
      findSmsWorkspaceByNumber: vi.fn(),
      findContactByPhone: vi.fn(),
      createInboundSmsContact: vi.fn(),
      insertInboundMessage: vi.fn(),
      bumpConversationInbound: vi.fn(),
    },
    claimWebhookEvent: vi.fn(),
    addSuppression: vi.fn(),
    removeSuppression: vi.fn(),
    ensureConversation: vi.fn(),
    checkRateLimit: vi.fn(),
  }));

vi.mock("@/lib/messaging/webhook-store", () => store);
vi.mock("@/lib/messaging/webhook-events", () => ({ claimWebhookEvent }));
vi.mock("@/lib/messaging/suppressions", () => ({ addSuppression, removeSuppression }));
vi.mock("@/lib/messaging/send-message", () => ({ ensureConversation }));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkRateLimit,
  RATE_LIMITS: {
    webhookPerRoute: { limit: 600, windowMs: 60_000 },
    smsAutoCreatePerWorkspace: { limit: 50, windowMs: 3_600_000 },
  },
}));

import { POST } from "@/app/api/webhooks/twilio/inbound/route";

const TOKEN = "twilio_test_token";
const BASE = "https://app.alignocrm.com";
const PATH = "/api/webhooks/twilio/inbound";

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

const INBOUND = { From: "+13105551234", To: "+14155550123", Body: "hello", MessageSid: "SM_a" };

describe("POST /api/webhooks/twilio/inbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.MESSAGING_PUBLIC_BASE_URL = BASE;
    claimWebhookEvent.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue(true);
    store.findSmsWorkspaceByNumber.mockResolvedValue({ workspace_id: "ws-1", config: {} });
    store.findContactByPhone.mockResolvedValue({ id: "ct-1" });
    store.createInboundSmsContact.mockResolvedValue({ id: "ct-new" });
    store.insertInboundMessage.mockResolvedValue(undefined);
    store.bumpConversationInbound.mockResolvedValue(undefined);
    ensureConversation.mockResolvedValue({ id: "c-1", unread_count: 0 });
    addSuppression.mockResolvedValue(undefined);
    removeSuppression.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.MESSAGING_PUBLIC_BASE_URL;
  });

  it("rejects an invalid signature with 403 and writes nothing (P2-01)", async () => {
    const res = await POST(signedRequest(INBOUND, { badSig: true }));
    expect(res.status).toBe(403);
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the auth token is unset (P2-04)", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const res = await POST(signedRequest(INBOUND));
    expect(res.status).toBe(503);
  });

  it("matches a known contact and stores the inbound message (P2-17)", async () => {
    const res = await POST(signedRequest(INBOUND));
    expect(res.status).toBe(200);
    expect(store.createInboundSmsContact).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "sms", contactId: "ct-1", fromAddress: "+13105551234", senderVerified: true })
    );
    expect(store.bumpConversationInbound).toHaveBeenCalledWith("c-1", expect.objectContaining({ channel: "sms", currentUnread: 0 }));
  });

  it("auto-creates a contact for an unknown sender (P2-18)", async () => {
    store.findContactByPhone.mockResolvedValue(null);
    const res = await POST(signedRequest(INBOUND));
    expect(res.status).toBe(200);
    expect(store.createInboundSmsContact).toHaveBeenCalledTimes(1);
    expect(store.createInboundSmsContact).toHaveBeenCalledWith("ws-1", "+13105551234");
  });

  it("drops (200, no create) when the per-workspace auto-create limit is hit (REQ-SEC-17)", async () => {
    store.findContactByPhone.mockResolvedValue(null);
    // allow the per-route guard, deny the auto-create bucket
    checkRateLimit.mockImplementation((key: string) =>
      Promise.resolve(!key.startsWith("sms-autocreate"))
    );
    const res = await POST(signedRequest(INBOUND));
    expect(res.status).toBe(200);
    expect(store.createInboundSmsContact).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("STOP adds an sms suppression and still stores the message (P2-19/P2-21)", async () => {
    const res = await POST(signedRequest({ ...INBOUND, Body: "STOP", MessageSid: "SM_stop" }));
    expect(res.status).toBe(200);
    expect(addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", channel: "sms", address: "+13105551234", reason: "stop" })
    );
    expect(store.insertInboundMessage).toHaveBeenCalled(); // message logged too
  });

  it("START removes the suppression (P2-20)", async () => {
    const res = await POST(signedRequest({ ...INBOUND, Body: "START", MessageSid: "SM_start" }));
    expect(res.status).toBe(200);
    expect(removeSuppression).toHaveBeenCalledWith("ws-1", "sms", "+13105551234");
  });

  it("duplicate MessageSid is a no-op 200 (P2-05)", async () => {
    claimWebhookEvent.mockResolvedValue(false);
    const res = await POST(signedRequest(INBOUND));
    expect(res.status).toBe(200);
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("unknown destination number → 200, no claim, no write (REQ-SEC-03)", async () => {
    store.findSmsWorkspaceByNumber.mockResolvedValue(null);
    const res = await POST(signedRequest(INBOUND));
    expect(res.status).toBe(200);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });
});
