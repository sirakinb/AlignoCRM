import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockSelect, mockInsert, mockUpdate, mockEq, mockNot, mockIn, mockOrder, mockLimit, mockSingle } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockEq: vi.fn(),
    mockNot: vi.fn(),
    mockIn: vi.fn(),
    mockOrder: vi.fn(),
    mockLimit: vi.fn(),
    mockSingle: vi.fn(),
  }));

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  not: mockNot,
  in: mockIn,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
});

vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: mockFrom } },
}));

import {
  findMessageByProviderId,
  findContactByPhone,
  createInboundSmsContact,
  recomputeCampaignCounter,
  insertInboundMessage,
} from "@/lib/messaging/webhook-store";

describe("webhook-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockNot.mockReturnValue(chainable());
    mockIn.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("findMessageByProviderId (Security #1)", () => {
    it("constrains to outbound and orders deterministically", async () => {
      mockLimit.mockResolvedValueOnce({ data: [{ id: "m-1", workspace_id: "ws-1" }] });
      const m = await findMessageByProviderId("resend", "re_1");
      expect(m).toEqual({ id: "m-1", workspace_id: "ws-1" });
      expect(mockEq).toHaveBeenCalledWith("direction", "outbound");
      expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: true });
    });
  });

  describe("findContactByPhone (P2-17, no scan)", () => {
    it("matches via an indexed .in over candidate formats (incl. legacy)", async () => {
      mockLimit.mockResolvedValueOnce({ data: [{ id: "ct-legacy", phone: "(310) 555-1234" }] });
      const c = await findContactByPhone("ws-1", "+13105551234");
      expect(c).toEqual({ id: "ct-legacy", phone: "(310) 555-1234" });
      expect(mockNot).not.toHaveBeenCalled(); // no full-table scan
      expect(mockIn.mock.calls[0][0]).toBe("phone");
      const candidates = mockIn.mock.calls[0][1] as string[];
      expect(candidates).toContain("+13105551234");
      expect(candidates).toContain("(310) 555-1234");
      expect(candidates).toContain("3105551234");
    });

    it("returns null when nothing matches", async () => {
      mockLimit.mockResolvedValueOnce({ data: [] });
      expect(await findContactByPhone("ws-1", "+13105551234")).toBeNull();
    });
  });

  describe("recomputeCampaignCounter (Security #4 — aggregation, not +1)", () => {
    it("counts matching message rows and writes the count", async () => {
      mockIn.mockResolvedValueOnce({ count: 3, error: null });
      await recomputeCampaignCounter("camp-1", "delivered_count");
      expect(mockSelect).toHaveBeenCalledWith("id", { count: "exact", head: true });
      expect(mockIn).toHaveBeenCalledWith("status", ["delivered"]);
      expect(mockUpdate).toHaveBeenCalledWith({ delivered_count: 3 });
    });

    it("failed_count aggregates failed + bounced", async () => {
      mockIn.mockResolvedValueOnce({ count: 2, error: null });
      await recomputeCampaignCounter("camp-1", "failed_count");
      expect(mockIn).toHaveBeenCalledWith("status", ["failed", "bounced"]);
      expect(mockUpdate).toHaveBeenCalledWith({ failed_count: 2 });
    });
  });

  describe("createInboundSmsContact (P2-18 + Security #14)", () => {
    it("creates a phone-only contact and tags it source:sms-inbound", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: "ct-new" }, error: null }) // contact insert
        .mockResolvedValueOnce({ data: { id: "tag-1" }, error: null }); // tag insert
      mockLimit.mockResolvedValueOnce({ data: [] }); // tag lookup: none existing

      const created = await createInboundSmsContact("ws-1", "+13105551234");
      expect(created).toEqual({ id: "ct-new" });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: "ws-1", phone: "+13105551234" })
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: "ws-1", name: "source:sms-inbound" })
      );
      expect(mockInsert).toHaveBeenCalledWith({ contact_id: "ct-new", tag_id: "tag-1" });
    });

    it("on insert conflict re-selects the winner instead of duplicating", async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: "duplicate key" } });
      mockLimit.mockResolvedValueOnce({ data: [{ id: "ct-winner" }] });
      const created = await createInboundSmsContact("ws-1", "+13105551234");
      expect(created).toEqual({ id: "ct-winner" });
    });
  });

  describe("insertInboundMessage", () => {
    it("writes an inbound/received row with the given fields", async () => {
      mockInsert.mockResolvedValueOnce({ error: null });
      await insertInboundMessage({
        workspaceId: "ws-1",
        conversationId: "c-1",
        contactId: "ct-1",
        channel: "email",
        bodyText: "hi",
        bodyHtml: "<p>hi</p>",
        fromAddress: "a@x.com",
        toAddress: "r+tok@reply.alignocrm.com",
        provider: "resend",
        providerId: "<mid@x>",
        emailMessageId: "<mid@x>",
        subject: "Re: hi",
        senderVerified: true,
      });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "inbound",
          status: "received",
          email_message_id: "<mid@x>",
          sender_verified: true,
        })
      );
    });
  });
});
