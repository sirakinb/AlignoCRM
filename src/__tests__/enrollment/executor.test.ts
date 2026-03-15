import { describe, it, expect, vi, beforeEach } from "vitest";

let fromCallResults: Array<{ data: unknown; error: unknown }> = [];
let fromCallIndex = 0;

function makeChain() {
  const idx = fromCallIndex++;
  const self: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainMethod = () => self;
  self.select = vi.fn(chainMethod);
  self.insert = vi.fn(chainMethod);
  self.update = vi.fn(chainMethod);
  self.delete = vi.fn(chainMethod);
  self.eq = vi.fn(chainMethod);
  self.order = vi.fn(chainMethod);
  self.limit = vi.fn(chainMethod);
  self.single = vi.fn(() => {
    const result = fromCallResults[idx];
    return Promise.resolve(result ?? { data: null, error: null });
  });
  (self as Record<string, unknown>).then = (
    resolve: (v: unknown) => void,
    reject: (v: unknown) => void
  ) => {
    const result = fromCallResults[idx];
    const val = result ?? { data: null, error: null };
    if (val.error) return reject(val.error);
    return resolve(val);
  };
  return self;
}

const mockFrom = vi.fn((_table: string) => makeChain());

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: (table: string) => mockFrom(table),
    },
  },
}));

const mockGetEnrollment = vi.fn();
const mockUpdateEnrollment = vi.fn();
const mockCreateExecutionStep = vi.fn();

vi.mock("@/lib/data/enrollments", () => ({
  getEnrollment: (...args: unknown[]) => mockGetEnrollment(...args),
  updateEnrollment: (...args: unknown[]) => mockUpdateEnrollment(...args),
  createExecutionStep: (...args: unknown[]) => mockCreateExecutionStep(...args),
}));

import { executeStep, advanceWorkflow } from "@/lib/workflows/executor";
import { NodeType } from "@/types/workflow";
import type { WorkflowNode, WorkflowDefinition } from "@/types/workflow";
import { EnrollmentStatus, StepOutcome } from "@/types/enrollment";
import type { WorkflowEnrollment } from "@/types/enrollment";

const makeEnrollment = (
  overrides?: Partial<WorkflowEnrollment>
): WorkflowEnrollment => ({
  id: "enr-1",
  workspace_id: "ws-1",
  workflow_id: "wf-1",
  workflow_version_id: "ver-1",
  record_id: "c-1",
  record_type: "contact",
  current_node_id: null,
  status: EnrollmentStatus.Active,
  resume_at: null,
  started_at: "2026-01-01T00:00:00Z",
  completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeNode = (overrides?: Partial<WorkflowNode>): WorkflowNode => ({
  id: "node-1",
  workflow_id: "wf-1",
  type: NodeType.SendEmail,
  position_x: 0,
  position_y: 0,
  config: { to: "test@example.com", subject: "Hello", body: "World" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallResults = [];
    fromCallIndex = 0;
    mockCreateExecutionStep.mockResolvedValue({
      id: "step-1",
      outcome: StepOutcome.Completed,
    });
  });

  describe("executeStep", () => {
    it("completes a trigger node", async () => {
      const enrollment = makeEnrollment();
      const node = makeNode({
        type: NodeType.Trigger,
        config: { triggerType: "contact_created" },
      });

      const result = await executeStep(enrollment, node);

      expect(result).toBe(StepOutcome.Completed);
      expect(mockCreateExecutionStep).toHaveBeenCalledWith(
        expect.objectContaining({
          enrollment_id: "enr-1",
          node_id: "node-1",
          node_type: NodeType.Trigger,
          outcome: StepOutcome.Completed,
        })
      );
    });

    it("completes an add_tag node with provider response", async () => {
      const enrollment = makeEnrollment();
      const node = makeNode({
        type: NodeType.AddTag,
        config: { tagId: "t-1", tagName: "VIP" },
      });

      const result = await executeStep(enrollment, node);

      expect(result).toBe(StepOutcome.Completed);
      expect(mockCreateExecutionStep).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: StepOutcome.Completed,
          provider_response: expect.objectContaining({
            mock: true,
            action: "add_tag",
          }),
        })
      );
    });

    it("completes a condition node", async () => {
      const enrollment = makeEnrollment();
      const node = makeNode({
        type: NodeType.Condition,
        config: {
          conditionName: "has-email",
          logicOperator: "AND",
          rules: [{ field: "email", operator: "exists", value: true }],
        },
      });

      const result = await executeStep(enrollment, node);
      expect(result).toBe(StepOutcome.Completed);
    });

    it("completes a stop_workflow node", async () => {
      const enrollment = makeEnrollment();
      const node = makeNode({
        type: NodeType.StopWorkflow,
        config: { reason: "done" },
      });

      const result = await executeStep(enrollment, node);
      expect(result).toBe(StepOutcome.Completed);
    });

    it("logs failure when step throws", async () => {
      // First createExecutionStep call (success path) throws
      mockCreateExecutionStep
        .mockRejectedValueOnce(new Error("DB down"))
        .mockResolvedValueOnce({ id: "step-err" });

      const enrollment = makeEnrollment();
      const node = makeNode({ type: NodeType.AddTag, config: { tagId: "t-1", tagName: "Test" } });

      const result = await executeStep(enrollment, node);
      expect(result).toBe(StepOutcome.Failed);
    });
  });

  describe("advanceWorkflow", () => {
    it("starts from trigger and advances through nodes", async () => {
      const triggerNode = makeNode({
        id: "trigger-1",
        type: NodeType.Trigger,
        config: { triggerType: "contact_created" },
      });
      const emailNode = makeNode({
        id: "email-1",
        type: NodeType.SendEmail,
        config: { to: "a@b.com", subject: "Hi", body: "World" },
      });

      const definition: WorkflowDefinition = {
        nodes: [triggerNode, emailNode],
        edges: [
          {
            id: "e-1",
            workflow_id: "wf-1",
            source_node_id: "trigger-1",
            target_node_id: "email-1",
            source_handle: null,
            label: null,
          },
        ],
      };

      // advanceWorkflow call 1: trigger step
      mockGetEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: null })
      );
      // from("workflow_versions") call 0
      fromCallResults[0] = {
        data: { id: "ver-1", definition },
        error: null,
      };
      mockUpdateEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: "email-1" })
      );

      // advanceWorkflow call 2 (recursive): email step
      mockGetEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: "email-1" })
      );
      // from("workflow_versions") call 1
      fromCallResults[1] = {
        data: { id: "ver-1", definition },
        error: null,
      };
      mockUpdateEnrollment.mockResolvedValueOnce(
        makeEnrollment({
          current_node_id: "email-1",
          status: EnrollmentStatus.Completed,
        })
      );

      await advanceWorkflow("enr-1");

      expect(mockCreateExecutionStep).toHaveBeenCalledTimes(2);
      expect(mockCreateExecutionStep).toHaveBeenCalledWith(
        expect.objectContaining({ node_type: NodeType.Trigger })
      );
      expect(mockCreateExecutionStep).toHaveBeenCalledWith(
        expect.objectContaining({ node_type: NodeType.SendEmail })
      );
    });

    it("marks enrollment as completed when no next node", async () => {
      const triggerNode = makeNode({
        id: "trigger-1",
        type: NodeType.Trigger,
        config: { triggerType: "contact_created" },
      });

      const definition: WorkflowDefinition = {
        nodes: [triggerNode],
        edges: [],
      };

      mockGetEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: null })
      );
      fromCallResults[0] = {
        data: { id: "ver-1", definition },
        error: null,
      };
      mockUpdateEnrollment.mockResolvedValueOnce(
        makeEnrollment({ status: EnrollmentStatus.Completed })
      );

      await advanceWorkflow("enr-1");

      expect(mockUpdateEnrollment).toHaveBeenCalledWith("enr-1", {
        status: EnrollmentStatus.Completed,
        completed_at: expect.any(String),
        current_node_id: "trigger-1",
      });
    });

    it("handles condition branching (yes branch)", async () => {
      const conditionNode = makeNode({
        id: "cond-1",
        type: NodeType.Condition,
        config: {
          conditionName: "check",
          logicOperator: "AND",
          rules: [{ field: "email", operator: "exists", value: true }],
        },
      });
      const yesNode = makeNode({
        id: "yes-1",
        type: NodeType.AddTag,
        config: { tagId: "t-1", tagName: "VIP" },
      });
      const noNode = makeNode({
        id: "no-1",
        type: NodeType.RemoveTag,
        config: { tagId: "t-2", tagName: "Regular" },
      });

      const definition: WorkflowDefinition = {
        nodes: [conditionNode, yesNode, noNode],
        edges: [
          {
            id: "e-yes",
            workflow_id: "wf-1",
            source_node_id: "cond-1",
            target_node_id: "yes-1",
            source_handle: "yes",
            label: "Yes",
          },
          {
            id: "e-no",
            workflow_id: "wf-1",
            source_node_id: "cond-1",
            target_node_id: "no-1",
            source_handle: "no",
            label: "No",
          },
        ],
      };

      // First advance: condition node
      mockGetEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: "cond-1" })
      );
      fromCallResults[0] = {
        data: { id: "ver-1", definition },
        error: null,
      };
      mockUpdateEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: "yes-1" })
      );

      // Second advance: yes node (AddTag) - no outgoing edges so it completes
      mockGetEnrollment.mockResolvedValueOnce(
        makeEnrollment({ current_node_id: "yes-1" })
      );
      fromCallResults[1] = {
        data: { id: "ver-1", definition },
        error: null,
      };
      mockUpdateEnrollment.mockResolvedValueOnce(
        makeEnrollment({ status: EnrollmentStatus.Completed })
      );

      await advanceWorkflow("enr-1");

      // Should advance to yes-1, not no-1
      expect(mockUpdateEnrollment).toHaveBeenCalledWith("enr-1", {
        current_node_id: "yes-1",
      });
    });

    it("skips non-active enrollments", async () => {
      mockGetEnrollment.mockResolvedValueOnce(
        makeEnrollment({ status: EnrollmentStatus.Completed })
      );

      await advanceWorkflow("enr-1");

      expect(mockCreateExecutionStep).not.toHaveBeenCalled();
    });

    it("marks enrollment failed when version not found", async () => {
      mockGetEnrollment.mockResolvedValueOnce(makeEnrollment());
      fromCallResults[0] = {
        data: null,
        error: { code: "PGRST116", message: "not found" },
      };

      await advanceWorkflow("enr-1");

      expect(mockUpdateEnrollment).toHaveBeenCalledWith("enr-1", {
        status: EnrollmentStatus.Failed,
      });
    });
  });
});
