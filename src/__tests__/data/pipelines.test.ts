import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
});

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());
mockOrder.mockReturnValue(chainable());

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

import { insforge } from "@/lib/insforge/client";
import {
  getPipelines,
  getPipeline,
  createPipeline,
  getStages,
  createStage,
} from "@/lib/data/pipelines";

describe("pipelines data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("getPipelines", () => {
    it("filters by workspace_id and orders by position", async () => {
      const pipelines = [{ id: "p-1", name: "Sales" }];
      mockOrder.mockResolvedValueOnce({ data: pipelines, error: null });

      const result = await getPipelines("ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("pipelines");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(mockOrder).toHaveBeenCalledWith("position", { ascending: true });
      expect(result).toEqual(pipelines);
    });
  });

  describe("getStages", () => {
    it("filters by pipeline_id and orders by position", async () => {
      const stages = [{ id: "s-1", name: "Prospecting" }];
      mockOrder.mockResolvedValueOnce({ data: stages, error: null });

      const result = await getStages("p-1");

      expect(insforge.database.from).toHaveBeenCalledWith("stages");
      expect(mockEq).toHaveBeenCalledWith("pipeline_id", "p-1");
      expect(mockOrder).toHaveBeenCalledWith("position", { ascending: true });
      expect(result).toEqual(stages);
    });
  });

  describe("createPipeline", () => {
    it("creates pipeline with workspace", async () => {
      const input = { workspace_id: "ws-1", name: "Sales Pipeline" };
      const created = { id: "p-1", ...input, position: 0 };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createPipeline(input);

      // createPipeline now generates a client-side uuid for the id
      expect(mockInsert).toHaveBeenCalledWith({
        id: expect.any(String),
        ...input,
      });
      expect(result).toEqual(created);
    });
  });

  describe("createStage", () => {
    it("creates stage with pipeline_id", async () => {
      const input = {
        pipeline_id: "p-1",
        name: "Qualification",
        position: 1,
        color: "#00ff00",
      };
      const created = { id: "s-1", ...input };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createStage(input);

      expect(insforge.database.from).toHaveBeenCalledWith("stages");
      // createStage now generates a client-side uuid and normalizes the color
      // from the purple scale based on position (overriding the input color)
      expect(mockInsert).toHaveBeenCalledWith({
        id: expect.any(String),
        ...input,
        color: expect.any(String),
      });
      // The returned stage is normalized with the purple-scale color
      expect(result).toEqual({ ...created, color: expect.any(String) });
    });
  });
});
