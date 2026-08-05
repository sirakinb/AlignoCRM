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

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockUpdate.mockReturnValue(chainable());
mockDelete.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());
mockOrder.mockReturnValue(chainable());

vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

import { insforge } from "@/lib/insforge/server";
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/data/templates";

describe("templates data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockDelete.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("getTemplates", () => {
    it("filters by workspace_id and orders by created_at", async () => {
      const templates = [
        { id: "t-1", name: "Welcome", channel: "email" },
      ];
      mockOrder.mockResolvedValueOnce({ data: templates, error: null });

      const result = await getTemplates("ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("message_templates");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(mockOrder).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(result).toEqual(templates);
    });

    it("throws on error", async () => {
      mockOrder.mockResolvedValueOnce({
        data: null,
        error: new Error("DB error"),
      });
      await expect(getTemplates("ws-1")).rejects.toThrow("DB error");
    });
  });

  describe("getTemplate", () => {
    it("fetches a single template by id", async () => {
      const template = { id: "t-1", name: "Welcome" };
      mockSingle.mockResolvedValueOnce({ data: template, error: null });

      const result = await getTemplate("t-1", "ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("message_templates");
      expect(mockEq).toHaveBeenCalledWith("id", "t-1");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(result).toEqual(template);
    });
  });

  describe("createTemplate", () => {
    it("creates a template with correct fields", async () => {
      const input = {
        workspace_id: "ws-1",
        name: "Welcome Email",
        body: "Hello {{contact.first_name}}",
        subject: "Welcome!",
        channel: "email" as const,
      };
      const created = { id: "t-1", ...input };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createTemplate(input);

      expect(insforge.database.from).toHaveBeenCalledWith("message_templates");
      expect(mockInsert).toHaveBeenCalledWith(input);
      expect(result).toEqual(created);
    });
  });

  describe("updateTemplate", () => {
    it("updates and sets updated_at", async () => {
      const updated = { id: "t-1", name: "Updated Template" };
      mockSingle.mockResolvedValueOnce({ data: updated, error: null });

      const result = await updateTemplate("t-1", "ws-1", {
        name: "Updated Template",
      });

      expect(insforge.database.from).toHaveBeenCalledWith("message_templates");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Updated Template",
          updated_at: expect.any(String),
        })
      );
      expect(mockEq).toHaveBeenCalledWith("id", "t-1");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(result).toEqual(updated);
    });
  });

  describe("deleteTemplate", () => {
    it("deletes a template by id and workspace", async () => {
      // delete chains .eq("id").eq("workspace_id"); the second eq is awaited.
      mockEq.mockReturnValueOnce(chainable()).mockResolvedValueOnce({ error: null });

      await deleteTemplate("t-1", "ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("message_templates");
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("id", "t-1");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
    });

    it("throws on error", async () => {
      mockEq
        .mockReturnValueOnce(chainable())
        .mockResolvedValueOnce({ error: new Error("Delete failed") });
      await expect(deleteTemplate("t-1", "ws-1")).rejects.toThrow("Delete failed");
    });
  });
});
