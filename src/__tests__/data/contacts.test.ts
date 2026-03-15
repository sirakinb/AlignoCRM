import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
});

// Each mock returns the chainable object so methods can be chained
mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockUpdate.mockReturnValue(chainable());
mockDelete.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());
mockOrder.mockReturnValue(chainable());

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

vi.mock("@/lib/events/emitter", () => ({
  emitEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
}));

import { insforge } from "@/lib/insforge/client";
import {
  getContacts,
  getContact,
  createContact,
  updateContact,
  archiveContact,
} from "@/lib/data/contacts";

describe("contacts data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chainable returns
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockDelete.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("getContacts", () => {
    it("filters by workspace_id and orders by created_at", async () => {
      const contacts = [
        { id: "1", first_name: "Alice", last_name: "Smith" },
      ];
      mockOrder.mockResolvedValueOnce({ data: contacts, error: null });

      const result = await getContacts("ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("contacts");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(mockOrder).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(result).toEqual(contacts);
    });

    it("throws on error", async () => {
      const error = new Error("DB error");
      mockOrder.mockResolvedValueOnce({ data: null, error });

      await expect(getContacts("ws-1")).rejects.toThrow("DB error");
    });
  });

  describe("createContact", () => {
    it("creates a contact with correct fields", async () => {
      const input = {
        workspace_id: "ws-1",
        first_name: "Bob",
        last_name: "Jones",
        email: "bob@example.com",
        phone: "555-0100",
      };
      const created = { id: "c-1", ...input, status: "active" };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createContact(input);

      expect(insforge.database.from).toHaveBeenCalledWith("contacts");
      expect(mockInsert).toHaveBeenCalledWith(input);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockSingle).toHaveBeenCalled();
      expect(result).toEqual(created);
    });
  });

  describe("updateContact", () => {
    it("updates and sets updated_at", async () => {
      const updated = {
        id: "c-1",
        first_name: "Robert",
        last_name: "Jones",
      };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const result = await updateContact("c-1", { first_name: "Robert" });

      expect(insforge.database.from).toHaveBeenCalledWith("contacts");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: "Robert",
          updated_at: expect.any(String),
        })
      );
      expect(mockEq).toHaveBeenCalledWith("id", "c-1");
      expect(result).toEqual(updated);
    });
  });

  describe("archiveContact", () => {
    it("sets status to archived", async () => {
      const archived = { id: "c-1", status: "archived" };
      mockSingle.mockResolvedValueOnce({ data: archived, error: null });

      const result = await archiveContact("c-1");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "archived" })
      );
      expect(result).toEqual(archived);
    });
  });
});
