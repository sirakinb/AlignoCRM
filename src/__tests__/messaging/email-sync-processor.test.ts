import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockEnsureConversation,
  mockFindContactByEmail,
  mockCreateInboundEmailContact,
  mockInsertInboundMessage,
  mockBumpConversationInbound,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockEnsureConversation: vi.fn(),
  mockFindContactByEmail: vi.fn(),
  mockCreateInboundEmailContact: vi.fn(),
  mockInsertInboundMessage: vi.fn(),
  mockBumpConversationInbound: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}));

vi.mock("@/lib/messaging/send-message", () => ({
  ensureConversation: mockEnsureConversation,
}));

vi.mock("@/lib/messaging/webhook-store", () => ({
  findContactByEmail: mockFindContactByEmail,
  createInboundEmailContact: mockCreateInboundEmailContact,
  insertInboundMessage: mockInsertInboundMessage,
  bumpConversationInbound: mockBumpConversationInbound,
}));

vi.mock("@/lib/messaging/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RATE_LIMITS: {
    emailAutoCreatePerWorkspace: { limit: 50, windowMs: 3_600_000 },
  },
}));

vi.mock("@/lib/messaging/sanitize-html", () => ({
  sanitizeInboundHtml: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ""),
}));

vi.mock("@/lib/messaging/quote-strip", () => ({
  stripQuotedReply: (text: string) => text,
}));

import { processSyncedInboundEmail } from "@/lib/messaging/email-sync/processor";

describe("processSyncedInboundEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true);
    mockEnsureConversation.mockResolvedValue({
      id: "conv-1",
      unread_count: 2,
    });
    mockInsertInboundMessage.mockResolvedValue(undefined);
    mockBumpConversationInbound.mockResolvedValue(undefined);
  });

  it("skips mail from the connected mailbox itself", async () => {
    const result = await processSyncedInboundEmail({
      workspaceId: "ws-1",
      connectionEmail: "me@gmail.com",
      provider: "google",
      providerMessageId: "g1",
      emailMessageId: "<a@b>",
      fromAddress: "Me <me@gmail.com>",
      toAddress: "other@example.com",
      subject: "Self",
      bodyHtml: "<p>hi</p>",
      bodyText: "hi",
    });
    expect(result).toBe("skipped_self");
    expect(mockInsertInboundMessage).not.toHaveBeenCalled();
  });

  it("matches an existing contact and stores the inbound message", async () => {
    mockFindContactByEmail.mockResolvedValueOnce({ id: "ct-1" });

    const result = await processSyncedInboundEmail({
      workspaceId: "ws-1",
      connectionEmail: "me@gmail.com",
      provider: "google",
      providerMessageId: "g2",
      emailMessageId: "<msg-2@x>",
      fromAddress: "Lead <lead@example.com>",
      toAddress: "me@gmail.com",
      subject: "Hello",
      bodyHtml: "<p>Hello<script>alert(1)</script></p>",
      bodyText: "Hello",
    });

    expect(result).toBe("stored");
    expect(mockCreateInboundEmailContact).not.toHaveBeenCalled();
    expect(mockInsertInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "ct-1",
        conversationId: "conv-1",
        provider: "google",
        providerId: "g2",
        fromAddress: "lead@example.com",
        bodyHtml: "<p>Hello</p>",
      })
    );
    expect(mockBumpConversationInbound).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ currentUnread: 2, channel: "email" })
    );
  });

  it("auto-creates a contact when the sender is unknown", async () => {
    mockFindContactByEmail.mockResolvedValueOnce(null);
    mockCreateInboundEmailContact.mockResolvedValueOnce({ id: "ct-new" });

    const result = await processSyncedInboundEmail({
      workspaceId: "ws-1",
      connectionEmail: "me@outlook.com",
      provider: "microsoft",
      providerMessageId: "o1",
      emailMessageId: null,
      fromAddress: "new@example.com",
      toAddress: "me@outlook.com",
      subject: "Intro",
      bodyHtml: null,
      bodyText: "Intro body",
    });

    expect(result).toBe("stored");
    expect(mockCreateInboundEmailContact).toHaveBeenCalledWith("ws-1", "new@example.com");
    expect(mockInsertInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "ct-new", provider: "microsoft" })
    );
  });

  it("treats unique provider_id conflicts as duplicates", async () => {
    mockFindContactByEmail.mockResolvedValueOnce({ id: "ct-1" });
    mockInsertInboundMessage.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

    const result = await processSyncedInboundEmail({
      workspaceId: "ws-1",
      connectionEmail: "me@gmail.com",
      provider: "google",
      providerMessageId: "g-dup",
      emailMessageId: null,
      fromAddress: "lead@example.com",
      toAddress: null,
      subject: "Again",
      bodyHtml: null,
      bodyText: "x",
    });

    expect(result).toBe("duplicate");
    expect(mockBumpConversationInbound).not.toHaveBeenCalled();
  });

  it("drops auto-create when the workspace rate limit is hit", async () => {
    mockFindContactByEmail.mockResolvedValueOnce(null);
    mockCheckRateLimit.mockResolvedValueOnce(false);

    const result = await processSyncedInboundEmail({
      workspaceId: "ws-1",
      connectionEmail: "me@gmail.com",
      provider: "google",
      providerMessageId: "g3",
      emailMessageId: null,
      fromAddress: "flood@example.com",
      toAddress: null,
      subject: "Spam",
      bodyHtml: null,
      bodyText: "nope",
    });

    expect(result).toBe("skipped_rate_limit");
    expect(mockCreateInboundEmailContact).not.toHaveBeenCalled();
  });
});
