import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "svix";

const { store, claimWebhookEvent, checkRateLimit, findWorkspaceByEmailAlias, ensureConversation } =
  vi.hoisted(() => ({
    store: {
      findConversationByReplyToken: vi.fn(),
      getContactEmail: vi.fn(),
      insertInboundMessage: vi.fn(),
      bumpConversationInbound: vi.fn(),
      findContactByEmail: vi.fn(),
      createInboundEmailContact: vi.fn(),
    },
    claimWebhookEvent: vi.fn(),
    checkRateLimit: vi.fn(),
    findWorkspaceByEmailAlias: vi.fn(),
    ensureConversation: vi.fn(),
  }));

vi.mock("@/lib/messaging/webhook-store", () => store);
vi.mock("@/lib/messaging/webhook-events", () => ({ claimWebhookEvent }));
vi.mock("@/lib/messaging/reply-alias", () => ({ findWorkspaceByEmailAlias }));
vi.mock("@/lib/messaging/send-message", () => ({ ensureConversation }));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkRateLimit,
  RATE_LIMITS: {
    webhookPerRoute: { limit: 600, windowMs: 60_000 },
    smsAutoCreatePerWorkspace: { limit: 50, windowMs: 3_600_000 },
    emailAutoCreatePerWorkspace: { limit: 50, windowMs: 3_600_000 },
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

  // Resend's email.received webhook is metadata-only — the body must be fetched
  // from the Received-emails API via data.email_id. Without this the stored body
  // is always empty (found in a live prod test 2026-08-05).
  it("fetches the body from the API when the webhook is metadata-only", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          html: "<p>Fetched body</p>",
          text: "Fetched body",
          headers: [{ name: "Message-ID", value: "<fetched@mail>" }],
        }),
        { status: 200 }
      )
    );
    const res = await POST(
      signedRequest({
        data: {
          to: ["r+TOK123@reply.alignocrm.com"],
          from: "alice@example.com",
          subject: "Re: hi",
          email_id: "eml_123",
          attachments: [],
        },
      })
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/emails/inbound/eml_123"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      })
    );
    const arg = store.insertInboundMessage.mock.calls[0][0];
    expect(arg.bodyText).toBe("Fetched body");
    expect(arg.bodyHtml).toContain("Fetched body");
    expect(arg.emailMessageId).toBe("<fetched@mail>");
    fetchMock.mockRestore();
    delete process.env.RESEND_API_KEY;
  });

  // ── Pretty alias routing (alias@reply-domain instead of r+token) ──────────

  it("routes an alias recipient via workspace + sender to the contact's conversation", async () => {
    findWorkspaceByEmailAlias.mockResolvedValue("ws-9");
    store.findContactByEmail.mockResolvedValue({ id: "ct-9" });
    ensureConversation.mockResolvedValue({
      id: "c-9",
      workspace_id: "ws-9",
      contact_id: "ct-9",
      unread_count: 0,
    });

    const res = await POST(
      signedRequest(inboundEvent({ to: ["pentridge-media@reply.alignocrm.com"] }))
    );
    expect(res.status).toBe(200);
    expect(findWorkspaceByEmailAlias).toHaveBeenCalledWith("pentridge-media");
    expect(store.findContactByEmail).toHaveBeenCalledWith("ws-9", "alice@example.com");
    expect(ensureConversation).toHaveBeenCalledWith("ws-9", "ct-9");
    expect(store.findConversationByReplyToken).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-9",
        conversationId: "c-9",
        contactId: "ct-9",
        toAddress: "pentridge-media@reply.alignocrm.com",
        senderVerified: true,
      })
    );
  });

  it("auto-creates a contact for an unknown alias sender (rate limited)", async () => {
    findWorkspaceByEmailAlias.mockResolvedValue("ws-9");
    store.findContactByEmail.mockResolvedValue(null);
    store.createInboundEmailContact.mockResolvedValue({ id: "ct-new" });
    ensureConversation.mockResolvedValue({
      id: "c-new",
      workspace_id: "ws-9",
      contact_id: "ct-new",
      unread_count: 0,
    });

    const res = await POST(
      signedRequest(inboundEvent({ to: ["pentridge-media@reply.alignocrm.com"] }))
    );
    expect(res.status).toBe(200);
    expect(store.createInboundEmailContact).toHaveBeenCalledWith("ws-9", "alice@example.com");
    expect(store.insertInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "ct-new" })
    );
  });

  it("drops (200) when auto-create is rate limited on the alias path", async () => {
    findWorkspaceByEmailAlias.mockResolvedValue("ws-9");
    store.findContactByEmail.mockResolvedValue(null);
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith("email-autocreate:"));

    const res = await POST(
      signedRequest(inboundEvent({ to: ["pentridge-media@reply.alignocrm.com"] }))
    );
    expect(res.status).toBe(200);
    expect(store.createInboundEmailContact).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("unknown alias → 200 drop, no claim, no writes", async () => {
    findWorkspaceByEmailAlias.mockResolvedValue(null);
    const res = await POST(signedRequest(inboundEvent({ to: ["nobody@reply.alignocrm.com"] })));
    expect(res.status).toBe(200);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("ignores an alias addressed to a foreign domain", async () => {
    const res = await POST(signedRequest(inboundEvent({ to: ["pentridge-media@evil.com"] })));
    expect(res.status).toBe(200);
    expect(findWorkspaceByEmailAlias).not.toHaveBeenCalled();
    expect(store.insertInboundMessage).not.toHaveBeenCalled();
  });

  it("prefers the r+token path when both address forms are present", async () => {
    const res = await POST(
      signedRequest(
        inboundEvent({ to: ["r+TOK123@reply.alignocrm.com", "pentridge-media@reply.alignocrm.com"] })
      )
    );
    expect(res.status).toBe(200);
    expect(store.findConversationByReplyToken).toHaveBeenCalledWith("TOK123");
    expect(findWorkspaceByEmailAlias).not.toHaveBeenCalled();
  });

  it("still stores the message (subject/routing survive) if the body fetch fails", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const res = await POST(
      signedRequest({
        data: {
          to: ["r+TOK123@reply.alignocrm.com"],
          from: "alice@example.com",
          subject: "Re: hi",
          email_id: "eml_err",
          message_id: "<wh@mail>",
          attachments: [],
        },
      })
    );
    expect(res.status).toBe(200);
    const arg = store.insertInboundMessage.mock.calls[0][0];
    expect(arg.bodyText).toBeNull();
    expect(arg.bodyHtml).toBeNull();
    expect(arg.emailMessageId).toBe("<wh@mail>"); // falls back to webhook message_id
    fetchMock.mockRestore();
    delete process.env.RESEND_API_KEY;
  });
});
