import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "svix";

const { store, claimWebhookEvent, checkRateLimit } = vi.hoisted(() => ({
  store: {
    findConversationByReplyToken: vi.fn(),
    getContactEmail: vi.fn(),
    insertInboundMessage: vi.fn(),
    bumpConversationInbound: vi.fn(),
  },
  claimWebhookEvent: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/messaging/webhook-store", () => store);
vi.mock("@/lib/messaging/webhook-events", () => ({ claimWebhookEvent }));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkRateLimit,
  RATE_LIMITS: {
    webhookPerRoute: { limit: 600, windowMs: 60_000 },
    smsAutoCreatePerWorkspace: { limit: 50, windowMs: 3_600_000 },
  },
}));

import { POST } from "@/app/api/webhooks/resend/inbound/route";

const SECRET = "whsec_" + Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").toString("base64");

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
  return new Request("http://localhost/api/webhooks/resend/inbound", { method: "POST", headers, body });
}

function inboundEvent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      to: ["r+TOK123@reply.alignocrm.com"],
      from: "alice@example.com",
      subject: "Re: hi",
      html: "<p>Thanks!</p>",
      text: "Thanks!\n\nOn Mon, Aug 5, 2026, Bob <b@x.com> wrote:\n> earlier",
      headers: [{ name: "Message-ID", value: "<abc@mail.example>" }],
      attachments: [],
      ...overrides,
    },
  };
}

const CONVERSATION = {
  id: "c-1",
  workspace_id: "ws-1",
  contact_id: "ct-1",
  reply_token: "TOK123",
  subject: null,
  unread_count: 2,
};

describe("POST /api/webhooks/resend/inbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = SECRET;
    claimWebhookEvent.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue(true);
    store.findConversationByReplyToken.mockResolvedValue({ ...CONVERSATION });
    store.getContactEmail.mockResolvedValue("alice@example.com");
    store.insertInboundMessage.mockResolvedValue(undefined);
    store.bumpConversationInbound.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  });

  it("fails closed with 503 when secret unset", async () => {
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    const res = await POST(signedRequest(inboundEvent()));
    expect(res.status).toBe(503);
  });

  it("rejects an invalid signature with 401", async () => {
    const wrong = "whsec_" + Buffer.from("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb").toString("base64");
    const res = await POST(signedRequest(inboundEvent(), wrong));
    expect(res.status).toBe(401);
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("routes a valid reply token to the conversation and bumps unread (P2-12)", async () => {
    const res = await POST(signedRequest(inboundEvent()));
    expect(res.status).toBe(200);
    expect(store.insertInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "c-1",
        contactId: "ct-1",
        channel: "email",
        provider: "resend",
        providerId: "<abc@mail.example>",
        emailMessageId: "<abc@mail.example>",
        senderVerified: true,
      })
    );
    expect(store.bumpConversationInbound).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ channel: "email", currentUnread: 2 })
    );
  });

  it("sanitizes HTML before storage (P2-15)", async () => {
    const res = await POST(
      signedRequest(inboundEvent({ html: '<p>hi</p><script>alert(1)</script><img src=x onerror=alert(1)>' }))
    );
    expect(res.status).toBe(200);
    const arg = store.insertInboundMessage.mock.calls[0][0];
    expect(arg.bodyHtml).not.toMatch(/<script/i);
    expect(arg.bodyHtml).not.toMatch(/onerror/i);
  });

  it("strips quoted reply history into body_text (P2-24)", async () => {
    await POST(signedRequest(inboundEvent()));
    const arg = store.insertInboundMessage.mock.calls[0][0];
    expect(arg.bodyText).toBe("Thanks!");
  });

  it("flags sender_verified=false when From does not match the contact (REQ-SEC-07)", async () => {
    store.getContactEmail.mockResolvedValue("realcontact@example.com");
    await POST(signedRequest(inboundEvent({ from: "attacker@evil.com" })));
    const arg = store.insertInboundMessage.mock.calls[0][0];
    expect(arg.senderVerified).toBe(false);
  });

  it("unknown reply token → 200 drop, no writes (P2-13)", async () => {
    store.findConversationByReplyToken.mockResolvedValue(null);
    const res = await POST(signedRequest(inboundEvent({ to: ["r+NOPE@reply.alignocrm.com"] })));
    expect(res.status).toBe(200);
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
    expect(claimWebhookEvent).not.toHaveBeenCalled();
  });

  it("no r+ recipient → 200 drop, no conversation lookup (P2-13)", async () => {
    const res = await POST(signedRequest(inboundEvent({ to: ["support@alignocrm.com"] })));
    expect(res.status).toBe(200);
    expect(store.findConversationByReplyToken).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("ignores an r+token addressed to a foreign domain (Security #6)", async () => {
    const res = await POST(signedRequest(inboundEvent({ to: ["r+TOK123@evil.com"] })));
    expect(res.status).toBe(200);
    expect(store.findConversationByReplyToken).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("records an attachments indicator without storing bytes (P2-16)", async () => {
    await POST(signedRequest(inboundEvent({ attachments: [{ filename: "a.pdf" }, { filename: "b.png" }] })));
    const arg = store.insertInboundMessage.mock.calls[0][0];
    expect(arg.providerResponse).toEqual({ has_attachments: true, attachment_count: 2 });
  });

  it("duplicate delivery is a no-op 200 (P2-05)", async () => {
    claimWebhookEvent.mockResolvedValue(false);
    const res = await POST(signedRequest(inboundEvent()));
    expect(res.status).toBe(200);
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });
});
