import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  delete: mockDelete,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
});

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
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
  getTags,
  createTag,
  addTagToContact,
  removeTagFromContact,
} from "@/lib/data/tags";

describe("tags data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockDelete.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("getTags", () => {
    it("filters by workspace_id", async () => {
      const tags = [{ id: "t-1", name: "VIP" }];
      mockOrder.mockResolvedValueOnce({ data: tags, error: null });

      const result = await getTags("ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("tags");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(result).toEqual(tags);
    });
  });

  describe("createTag", () => {
    it("creates a tag", async () => {
      const input = { workspace_id: "ws-1", name: "Lead", color: "#ff0000" };
      const created = { id: "t-1", ...input };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createTag(input);

      // createTag now generates a client-side uuid for the id
      expect(mockInsert).toHaveBeenCalledWith({
        id: expect.any(String),
        ...input,
      });
      expect(result).toEqual(created);
    });
  });

  describe("addTagToContact", () => {
    it("creates junction record", async () => {
      const record = { contact_id: "c-1", tag_id: "t-1" };
      mockSingle.mockResolvedValueOnce({ data: record, error: null });

      const result = await addTagToContact("c-1", "t-1");

      expect(insforge.database.from).toHaveBeenCalledWith("contact_tags");
      expect(mockInsert).toHaveBeenCalledWith({
        contact_id: "c-1",
        tag_id: "t-1",
      });
      expect(result).toEqual(record);
    });
  });

  describe("removeTagFromContact", () => {
    it("deletes junction record", async () => {
      // First .eq() returns chainable, second .eq() resolves
      mockEq
        .mockReturnValueOnce(chainable())
        .mockResolvedValueOnce({ error: null });

      await removeTagFromContact("c-1", "t-1");

      expect(insforge.database.from).toHaveBeenCalledWith("contact_tags");
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("contact_id", "c-1");
      expect(mockEq).toHaveBeenCalledWith("tag_id", "t-1");
    });
  });
});
