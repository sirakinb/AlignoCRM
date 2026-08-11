import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
});

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockUpdate.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());
mockOrder.mockReturnValue(chainable());

vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

// Mock activity-logs module
vi.mock("@/lib/data/activity-logs", () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: "log-1" }),
}));

vi.mock("@/lib/events/emitter", () => ({
  emitEvent: vi.fn().mockResolvedValue({ id: "evt-1" }),
}));

import { insforge } from "@/lib/insforge/server";
import { createActivityLog } from "@/lib/data/activity-logs";
import {
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  moveDealStage,
} from "@/lib/data/deals";

describe("deals data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("getDeals", () => {
    it("filters by workspace_id", async () => {
      const deals = [{ id: "d-1", title: "Deal A" }];
      mockOrder.mockResolvedValueOnce({ data: deals, error: null });

      const result = await getDeals("ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("deals");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(result).toEqual(deals);
    });
  });

  describe("createDeal", () => {
    it("creates deal with required fields", async () => {
      const input = {
        workspace_id: "ws-1",
        pipeline_id: "p-1",
        stage_id: "s-1",
        title: "New Deal",
        value: 5000,
      };
      const created = { id: "d-1", ...input, status: "open" };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createDeal(input);

      // createDeal now generates a client-side uuid and mirrors title into name
      expect(mockInsert).toHaveBeenCalledWith({
        id: expect.any(String),
        name: input.title,
        ...input,
      });
      expect(result).toEqual(created);
    });
  });

  describe("moveDealStage", () => {
    it("updates stage and creates activity log", async () => {
      const existingDeal = {
        id: "d-1",
        workspace_id: "ws-1",
        stage_id: "s-1",
        title: "Deal A",
      };
      // First call: getDeal
      mockSingle.mockResolvedValueOnce({ data: existingDeal, error: null });
      // Second call: getStage (moveDealStage derives deal status from stage.name)
      mockSingle.mockResolvedValueOnce({
        data: { id: "s-2", name: "Qualified", position: 1 },
        error: null,
      });
      // Third call: update stage
      const updatedDeal = { ...existingDeal, stage_id: "s-2", status: "open" };
      mockSingle.mockResolvedValueOnce({ data: updatedDeal, error: null });

      const result = await moveDealStage("d-1", "s-2", "user-1");

      expect(result).toEqual(updatedDeal);
      expect(createActivityLog).toHaveBeenCalledWith({
        workspace_id: "ws-1",
        entity_type: "deal",
        entity_id: "d-1",
        action: "stage_changed",
        metadata: {
          from_stage_id: "s-1",
          to_stage_id: "s-2",
        },
        actor_id: "user-1",
      });
    });
  });
});
