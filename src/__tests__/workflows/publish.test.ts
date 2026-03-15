import { describe, expect, it, vi, beforeEach } from "vitest";
import { NodeType } from "@/types/workflow";

// Mock the validation module
vi.mock("@/lib/workflows/validation", () => ({
  validateWorkflow: vi.fn(),
}));

// Mock InsForge
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockEq = vi.fn(() => ({
  single: mockSingle,
  order: mockOrder,
  eq: mockEq,
}));
const mockSelect = vi.fn(() => ({ eq: mockEq, single: mockSingle }));
const mockInsert = vi.fn(() => ({ single: mockSingle, select: mockSelect }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = vi.fn((_table?: any) => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: (table: string) => mockFrom(table),
    },
  },
}));

import { publishWorkflow } from "@/lib/data/workflows";
import { validateWorkflow } from "@/lib/workflows/validation";

const mockedValidate = vi.mocked(validateWorkflow);

beforeEach(() => {
  vi.clearAllMocks();

  // Restore default return values after clearing
  mockEq.mockReturnValue({
    single: mockSingle,
    order: mockOrder,
    eq: mockEq,
  });
  mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
  mockInsert.mockReturnValue({ single: mockSingle, select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockOrder.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ single: mockSingle });
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  });
});

describe("publishWorkflow", () => {
  it("validates before publishing and rejects invalid workflows", async () => {
    // Mock fetching nodes and edges
    const nodes = [
      { id: "n1", type: NodeType.SendEmail, config: {} },
    ];
    const edges: unknown[] = [];

    // First call: fetch nodes
    mockEq.mockReturnValueOnce({
      data: nodes,
      error: null,
    } as any);
    // Second call: fetch edges
    mockEq.mockReturnValueOnce({
      data: edges,
      error: null,
    } as any);

    mockedValidate.mockReturnValue({
      valid: false,
      errors: ["Workflow must have exactly one trigger node."],
    });

    const result = await publishWorkflow("wf-1", "user-1");

    expect(mockedValidate).toHaveBeenCalled();
    expect(result.version).toBeNull();
    expect(result.errors).toContain(
      "Workflow must have exactly one trigger node."
    );
  });

  it("creates a version when workflow is valid", async () => {
    const nodes = [
      {
        id: "n1",
        type: NodeType.Trigger,
        config: { triggerType: "contact_created" },
      },
      {
        id: "n2",
        type: NodeType.SendEmail,
        config: { to: "a@b.com", subject: "Hi", body: "Hello" },
      },
    ];
    const edges = [
      { id: "e1", source_node_id: "n1", target_node_id: "n2" },
    ];

    // First from("workflow_nodes").select().eq() -> nodes
    mockEq.mockReturnValueOnce({
      data: nodes,
      error: null,
    } as any);
    // Second from("workflow_edges").select().eq() -> edges
    mockEq.mockReturnValueOnce({
      data: edges,
      error: null,
    } as any);

    mockedValidate.mockReturnValue({ valid: true, errors: [] });

    // Get latest version -> no previous version
    mockSingle.mockResolvedValueOnce({ data: null, error: null });

    // Insert version
    const versionData = {
      id: "v1",
      workflow_id: "wf-1",
      version_number: 1,
      definition: { nodes, edges },
      published_by: "user-1",
    };
    mockSingle.mockResolvedValueOnce({ data: versionData, error: null });

    const result = await publishWorkflow("wf-1", "user-1");

    expect(mockedValidate).toHaveBeenCalledWith(nodes, edges);
    expect(result.version).toEqual(versionData);
    expect(result.errors).toHaveLength(0);
  });
});
