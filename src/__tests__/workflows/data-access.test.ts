import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock InsForge client
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockOrder = vi.fn(() => ({ limit: mockLimit, single: mockSingle }));
const mockEq = vi.fn(() => ({
  single: mockSingle,
  order: mockOrder,
  eq: mockEq,
  select: mockSelect,
}));
const mockSelect = vi.fn(() => ({ eq: mockEq, order: mockOrder, single: mockSingle }));
const mockInsert = vi.fn(() => ({ single: mockSingle, select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockDelete = vi.fn(() => ({ eq: mockEq }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = vi.fn((_table?: any) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: (table: string) => mockFrom(table),
    },
  },
}));

// Must import after mocking
import {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  getWorkflowVersion,
} from "@/lib/data/workflows";

beforeEach(() => {
  vi.clearAllMocks();

  // Reset default return values
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockEq.mockReturnValue({
    single: mockSingle,
    order: mockOrder,
    eq: mockEq,
    select: mockSelect,
  });
  mockOrder.mockReturnValue({ limit: mockLimit, single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder, single: mockSingle });
});

describe("getWorkflows", () => {
  it("queries workflows by workspace_id ordered by created_at desc", async () => {
    const mockData = [
      { id: "w1", name: "Workflow 1" },
      { id: "w2", name: "Workflow 2" },
    ];
    mockOrder.mockReturnValueOnce({ data: mockData, error: null } as any);

    const result = await getWorkflows("ws-1");

    expect(mockFrom).toHaveBeenCalledWith("workflows");
    expect(mockSelect).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(mockOrder).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(result).toEqual(mockData);
  });

  it("throws on error", async () => {
    mockOrder.mockReturnValueOnce({
      data: null,
      error: new Error("DB error"),
    } as any);

    await expect(getWorkflows("ws-1")).rejects.toThrow("DB error");
  });
});

describe("getWorkflow", () => {
  it("queries a single workflow by id", async () => {
    const mockData = { id: "w1", name: "Workflow 1" };
    mockSingle.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getWorkflow("w1");

    expect(mockFrom).toHaveBeenCalledWith("workflows");
    expect(mockEq).toHaveBeenCalledWith("id", "w1");
    expect(result).toEqual(mockData);
  });
});

describe("createWorkflow", () => {
  it("inserts a new workflow", async () => {
    const input = {
      workspace_id: "ws-1",
      name: "New Workflow",
      created_by: "user-1",
    };
    const mockData = { id: "w1", ...input };
    mockSingle.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await createWorkflow(input);

    expect(mockFrom).toHaveBeenCalledWith("workflows");
    expect(mockInsert).toHaveBeenCalledWith(input);
    expect(result).toEqual(mockData);
  });
});

describe("updateWorkflow", () => {
  it("updates a workflow by id", async () => {
    const input = { name: "Updated Name" };
    const mockData = { id: "w1", name: "Updated Name" };
    mockSingle.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await updateWorkflow("w1", input);

    expect(mockFrom).toHaveBeenCalledWith("workflows");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated Name" })
    );
    expect(mockEq).toHaveBeenCalledWith("id", "w1");
    expect(result).toEqual(mockData);
  });
});

describe("getWorkflowVersion", () => {
  it("queries a single version by id", async () => {
    const mockData = { id: "v1", version_number: 1 };
    mockSingle.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getWorkflowVersion("v1");

    expect(mockFrom).toHaveBeenCalledWith("workflow_versions");
    expect(mockEq).toHaveBeenCalledWith("id", "v1");
    expect(result).toEqual(mockData);
  });
});
