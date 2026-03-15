import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockLimit = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
  limit: mockLimit,
});

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockUpdate.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());
mockOrder.mockReturnValue(chainable());
mockLimit.mockReturnValue(chainable());

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

import { insforge } from "@/lib/insforge/client";
import {
  emitEvent,
  getUnprocessedEvents,
  markEventProcessed,
} from "@/lib/events/emitter";
import { BusinessEventType } from "@/types/events";

describe("event emitter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
    mockLimit.mockReturnValue(chainable());
  });

  describe("emitEvent", () => {
    it("creates event with correct payload", async () => {
      const event = {
        id: "evt-1",
        workspace_id: "ws-1",
        event_type: BusinessEventType.ContactCreated,
        record_id: "c-1",
        record_type: "contact",
        payload: {
          contactId: "c-1",
          email: "test@example.com",
          firstName: "Alice",
          lastName: "Smith",
        },
        idempotency_key: "contact_created:c-1:123",
        processed: false,
        created_at: "2026-01-01T00:00:00Z",
      };
      mockSingle.mockResolvedValueOnce({ data: event, error: null });

      const result = await emitEvent({
        workspace_id: "ws-1",
        event_type: BusinessEventType.ContactCreated,
        record_id: "c-1",
        record_type: "contact",
        payload: {
          contactId: "c-1",
          email: "test@example.com",
          firstName: "Alice",
          lastName: "Smith",
        },
      });

      expect(insforge.database.from).toHaveBeenCalledWith("business_events");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          event_type: BusinessEventType.ContactCreated,
          record_id: "c-1",
          record_type: "contact",
          payload: expect.objectContaining({
            contactId: "c-1",
            email: "test@example.com",
          }),
        })
      );
      expect(result).toEqual(event);
    });

    it("returns null on duplicate idempotency key", async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      });

      const result = await emitEvent({
        workspace_id: "ws-1",
        event_type: BusinessEventType.ContactCreated,
        record_id: "c-1",
        record_type: "contact",
        payload: {
          contactId: "c-1",
          email: "test@example.com",
          firstName: "Alice",
          lastName: "Smith",
        },
      });

      expect(result).toBeNull();
    });

    it("throws on non-duplicate errors", async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: "42P01", message: "table not found" },
      });

      await expect(
        emitEvent({
          workspace_id: "ws-1",
          event_type: BusinessEventType.ContactCreated,
          record_id: "c-1",
          record_type: "contact",
          payload: {
            contactId: "c-1",
            email: null,
            firstName: "Alice",
            lastName: "Smith",
          },
        })
      ).rejects.toEqual(
        expect.objectContaining({ code: "42P01" })
      );
    });
  });

  describe("getUnprocessedEvents", () => {
    it("filters by workspace and processed=false", async () => {
      const events = [
        { id: "evt-1", event_type: "contact_created", processed: false },
      ];
      mockLimit.mockResolvedValueOnce({ data: events, error: null });

      const result = await getUnprocessedEvents("ws-1", 10);

      expect(insforge.database.from).toHaveBeenCalledWith("business_events");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(mockEq).toHaveBeenCalledWith("processed", false);
      expect(mockOrder).toHaveBeenCalledWith("created_at", {
        ascending: true,
      });
      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(result).toEqual(events);
    });

    it("uses default limit of 50", async () => {
      mockLimit.mockResolvedValueOnce({ data: [], error: null });

      await getUnprocessedEvents("ws-1");

      expect(mockLimit).toHaveBeenCalledWith(50);
    });
  });

  describe("markEventProcessed", () => {
    it("updates the event processed flag", async () => {
      mockEq.mockResolvedValueOnce({ error: null });

      await markEventProcessed("evt-1");

      expect(insforge.database.from).toHaveBeenCalledWith("business_events");
      expect(mockUpdate).toHaveBeenCalledWith({ processed: true });
      expect(mockEq).toHaveBeenCalledWith("id", "evt-1");
    });

    it("throws on error", async () => {
      const error = new Error("DB error");
      mockEq.mockResolvedValueOnce({ error });

      await expect(markEventProcessed("evt-1")).rejects.toThrow("DB error");
    });
  });
});
