import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────

const mockInsforgeFrom = vi.fn();

vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: (...args: unknown[]) => mockInsforgeFrom(...args),
    },
  },
}));

vi.mock("@/lib/workflows/validation", () => ({
  validateWorkflow: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

function chainBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, any> = {};
  const methods = ["select", "insert", "update", "delete", "eq", "neq", "in", "not", "lte", "order", "limit"];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = vi.fn((resolve: (val: any) => void) => resolve(result));
  return builder;
}

// ── Tests ─────────────────────────────────────────────

let unpublishWorkflow: typeof import("@/lib/data/workflows").unpublishWorkflow;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("@/lib/data/workflows");
  unpublishWorkflow = mod.unpublishWorkflow;
});

describe("unpublishWorkflow", () => {
  it("sets workflow status to draft AND cancels active/paused enrollments", async () => {
    const workflowUpdateBuilder = chainBuilder({ data: null, error: null });
    const enrollmentUpdateBuilder = chainBuilder({ data: null, error: null });

    let callCount = 0;
    mockInsforgeFrom.mockImplementation((table: string) => {
      if (table === "workflows") return workflowUpdateBuilder;
      if (table === "workflow_enrollments") return enrollmentUpdateBuilder;
      return chainBuilder({ data: null, error: null });
    });

    await unpublishWorkflow("wf-1");

    // 1. Should update workflow status to draft
    expect(workflowUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" })
    );
    expect(workflowUpdateBuilder.eq).toHaveBeenCalledWith("id", "wf-1");

    // 2. Should cancel active/paused enrollments
    expect(enrollmentUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    );
    expect(enrollmentUpdateBuilder.eq).toHaveBeenCalledWith("workflow_id", "wf-1");
    expect(enrollmentUpdateBuilder.in).toHaveBeenCalledWith("status", ["active", "paused"]);
  });
});
