import { describe, it, expect, vi, beforeEach } from "vitest";
import { NodeType } from "@/types/workflow";
import { StepOutcome, EnrollmentStatus } from "@/types/enrollment";
import type { WorkflowEnrollment } from "@/types/enrollment";
import type { WorkflowNode, SendEmailConfig, AddTagConfig, RemoveTagConfig, MoveDealStageConfig, WaitConfig } from "@/types/workflow";

// ── Mocks ─────────────────────────────────────────────

const mockCreateExecutionStep = vi.fn().mockResolvedValue({});
const mockGetContact = vi.fn();
const mockSendEmail = vi.fn();
const mockAddTagToContact = vi.fn().mockResolvedValue({});
const mockRemoveTagFromContact = vi.fn().mockResolvedValue({});
const mockMoveDealStage = vi.fn().mockResolvedValue({});
const mockInsforgeFrom = vi.fn();

vi.mock("@/lib/data/enrollments", () => ({
  getEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  createExecutionStep: (...args: unknown[]) => mockCreateExecutionStep(...args),
}));

vi.mock("@/lib/data/contacts", () => ({
  getContact: (...args: unknown[]) => mockGetContact(...args),
}));

vi.mock("@/lib/messaging/email-service", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/data/tags", () => ({
  addTagToContact: (...args: unknown[]) => mockAddTagToContact(...args),
  removeTagFromContact: (...args: unknown[]) => mockRemoveTagFromContact(...args),
}));

vi.mock("@/lib/data/deals", () => ({
  moveDealStage: (...args: unknown[]) => mockMoveDealStage(...args),
}));

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: (...args: unknown[]) => mockInsforgeFrom(...args),
    },
  },
}));

vi.mock("@/lib/messaging/interpolation", () => ({
  interpolateTemplate: (template: string, _ctx: Record<string, unknown>) => ({
    text: template.replace(/\{\{(.+?)\}\}/g, "Interpolated"),
    warnings: [],
  }),
}));

// ── Helpers ───────────────────────────────────────────

function makeEnrollment(overrides?: Partial<WorkflowEnrollment>): WorkflowEnrollment {
  return {
    id: "enr-1",
    workspace_id: "ws-1",
    workflow_id: "wf-1",
    workflow_version_id: "wfv-1",
    record_id: "contact-1",
    record_type: "contact",
    current_node_id: null,
    status: EnrollmentStatus.Active,
    resume_at: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeNode<T>(type: NodeType, config: T, id = "node-1"): WorkflowNode {
  return {
    id,
    workflow_id: "wf-1",
    type,
    position_x: 0,
    position_y: 0,
    config: config as any,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────

let executeStep: typeof import("@/lib/workflows/executor").executeStep;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to get fresh module with mocks
  const mod = await import("@/lib/workflows/executor");
  executeStep = mod.executeStep;
});

describe("executeStep", () => {
  it("Trigger node completes immediately", async () => {
    const enrollment = makeEnrollment();
    const node = makeNode(NodeType.Trigger, { triggerType: "contact_created" });

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Completed);
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollment_id: "enr-1",
        node_id: "node-1",
        outcome: StepOutcome.Completed,
      })
    );
  });

  it("SendEmail calls sendEmail with interpolated fields", async () => {
    const enrollment = makeEnrollment();
    const config: SendEmailConfig = {
      to: "{{contact.email}}",
      subject: "Hello {{contact.first_name}}",
      body: "<p>Welcome!</p>",
    };
    const node = makeNode(NodeType.SendEmail, config);

    mockGetContact.mockResolvedValue({
      id: "contact-1",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: null,
    });

    mockSendEmail.mockResolvedValue({
      id: "ml-1",
      status: "sent",
      provider_response: null,
    });

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Completed);
    expect(mockGetContact).toHaveBeenCalledWith("contact-1");
    expect(mockSendEmail).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        subject: expect.any(String),
        body: expect.any(String),
        contactId: "contact-1",
        enrollmentId: "enr-1",
      })
    );
  });

  it("SendEmail fails with clear error when contact not found", async () => {
    const enrollment = makeEnrollment();
    const config: SendEmailConfig = {
      to: "{{contact.email}}",
      subject: "Hello",
      body: "Body",
    };
    const node = makeNode(NodeType.SendEmail, config);

    mockGetContact.mockRejectedValue(new Error("Not found"));

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Failed);
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Failed,
        error_message: expect.stringContaining("not found"),
      })
    );
  });

  it("SendEmail fails when contact has no email address", async () => {
    const enrollment = makeEnrollment();
    const config: SendEmailConfig = {
      to: "", // empty template
      subject: "Hello",
      body: "Body",
    };
    const node = makeNode(NodeType.SendEmail, config);

    mockGetContact.mockResolvedValue({
      id: "contact-1",
      first_name: "Jane",
      last_name: "Doe",
      email: null, // no email
      phone: null,
    });

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Failed);
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Failed,
        error_message: expect.stringContaining("No email address"),
      })
    );
  });

  it("AddTag calls addTagToContact", async () => {
    const enrollment = makeEnrollment();
    const config: AddTagConfig = { tagId: "tag-1", tagName: "VIP" };
    const node = makeNode(NodeType.AddTag, config);

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Completed);
    expect(mockAddTagToContact).toHaveBeenCalledWith("contact-1", "tag-1");
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Completed,
        provider_response: expect.objectContaining({
          action: "add_tag",
          tagId: "tag-1",
        }),
      })
    );
  });

  it("RemoveTag calls removeTagFromContact", async () => {
    const enrollment = makeEnrollment();
    const config: RemoveTagConfig = { tagId: "tag-2", tagName: "Old" };
    const node = makeNode(NodeType.RemoveTag, config);

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Completed);
    expect(mockRemoveTagFromContact).toHaveBeenCalledWith("contact-1", "tag-2");
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Completed,
        provider_response: expect.objectContaining({
          action: "remove_tag",
          tagId: "tag-2",
        }),
      })
    );
  });

  it("MoveDealStage finds deal and moves stage", async () => {
    const enrollment = makeEnrollment();
    const config: MoveDealStageConfig = {
      pipelineId: "pipe-1",
      stageId: "stage-2",
    };
    const node = makeNode(NodeType.MoveDealStage, config);

    // Mock the DB query for deals
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (val: any) => void) =>
        resolve({
          data: [{ id: "deal-1", contact_id: "contact-1", pipeline_id: "pipe-1" }],
          error: null,
        })
      ),
    };
    mockInsforgeFrom.mockReturnValue(mockQueryBuilder);

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Completed);
    expect(mockMoveDealStage).toHaveBeenCalledWith("deal-1", "stage-2");
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Completed,
        provider_response: expect.objectContaining({
          action: "move_deal_stage",
          dealId: "deal-1",
          stageId: "stage-2",
        }),
      })
    );
  });

  it("MoveDealStage fails when no deal found", async () => {
    const enrollment = makeEnrollment();
    const config: MoveDealStageConfig = {
      pipelineId: "pipe-1",
      stageId: "stage-2",
    };
    const node = makeNode(NodeType.MoveDealStage, config);

    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (val: any) => void) =>
        resolve({ data: [], error: null })
      ),
    };
    mockInsforgeFrom.mockReturnValue(mockQueryBuilder);

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Failed);
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Failed,
        error_message: expect.stringContaining("No deal found"),
      })
    );
  });

  it("Wait returns Waiting outcome", async () => {
    const enrollment = makeEnrollment();
    const config: WaitConfig = { duration: 5, unit: "minutes" };
    const node = makeNode(NodeType.Wait, config);

    const outcome = await executeStep(enrollment, node);

    expect(outcome).toBe(StepOutcome.Waiting);
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Waiting,
        provider_response: expect.objectContaining({
          action: "wait",
          duration: 5,
          unit: "minutes",
        }),
      })
    );
  });

  it("records error_message in execution_step on failure", async () => {
    const enrollment = makeEnrollment();
    const config: SendEmailConfig = {
      to: "{{contact.email}}",
      subject: "Test",
      body: "Body",
    };
    const node = makeNode(NodeType.SendEmail, config);

    mockGetContact.mockRejectedValue(new Error("DB connection lost"));

    await executeStep(enrollment, node);

    // The executor wraps the getContact error with its own message
    expect(mockCreateExecutionStep).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: StepOutcome.Failed,
        error_message: expect.stringContaining("not found"),
      })
    );
  });
});
