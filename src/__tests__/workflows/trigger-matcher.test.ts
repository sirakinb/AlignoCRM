import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusinessEventType } from "@/types/events";
import type { BusinessEvent } from "@/types/events";
import { WorkflowStatus } from "@/types/workflow";
import { EnrollmentStatus } from "@/types/enrollment";

// ── Mocks ─────────────────────────────────────────────

const mockInsforgeFrom = vi.fn();
const mockCreateEnrollment = vi.fn();
const mockAdvanceWorkflow = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: (...args: unknown[]) => mockInsforgeFrom(...args),
    },
  },
}));

vi.mock("@/lib/data/enrollments", () => ({
  createEnrollment: (...args: unknown[]) => mockCreateEnrollment(...args),
}));

vi.mock("@/lib/workflows/executor", () => ({
  advanceWorkflow: (...args: unknown[]) => mockAdvanceWorkflow(...args),
}));

// ── Helpers ───────────────────────────────────────────

/** Create a chainable mock query builder for a given table. */
function chainBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, any> = {};
  const chainMethods = ["select", "eq", "neq", "in", "not", "lte", "order", "limit", "filter"];
  for (const m of chainMethods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue(result);
  // For queries that resolve without .single()
  builder.then = vi.fn((resolve: (val: any) => void) => resolve(result));
  return builder;
}

function makeEvent(overrides?: Partial<BusinessEvent>): BusinessEvent {
  return {
    id: "evt-1",
    workspace_id: "ws-1",
    event_type: BusinessEventType.ContactCreated,
    record_id: "contact-1",
    record_type: "contact",
    payload: {
      contactId: "contact-1",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
    },
    idempotency_key: "idem-1",
    processed: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────

let processEvent: typeof import("@/lib/workflows/trigger-matcher").processEvent;
let matchEventToWorkflows: typeof import("@/lib/workflows/trigger-matcher").matchEventToWorkflows;
let enrollRecord: typeof import("@/lib/workflows/trigger-matcher").enrollRecord;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("@/lib/workflows/trigger-matcher");
  processEvent = mod.processEvent;
  matchEventToWorkflows = mod.matchEventToWorkflows;
  enrollRecord = mod.enrollRecord;
});

describe("matchEventToWorkflows", () => {
  it("returns workflows matching the event type", async () => {
    const workflows = [
      {
        id: "wf-1",
        workspace_id: "ws-1",
        name: "Welcome",
        status: WorkflowStatus.Published,
        trigger_type: BusinessEventType.ContactCreated,
        trigger_config: {},
        allow_re_enrollment: false,
      },
    ];

    mockInsforgeFrom.mockReturnValue(
      chainBuilder({ data: workflows, error: null })
    );

    const event = makeEvent();
    const result = await matchEventToWorkflows(event);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("wf-1");
  });

  it("filters by payload fields when trigger_config has filters", async () => {
    const workflows = [
      {
        id: "wf-1",
        workspace_id: "ws-1",
        name: "VIP Tag",
        status: WorkflowStatus.Published,
        trigger_type: BusinessEventType.TagAdded,
        trigger_config: { filters: { tagId: "tag-vip" } },
        allow_re_enrollment: false,
      },
    ];

    mockInsforgeFrom.mockReturnValue(
      chainBuilder({ data: workflows, error: null })
    );

    // Event with matching tagId
    const event = makeEvent({
      event_type: BusinessEventType.TagAdded,
      record_type: "contact",
      payload: { contactId: "c1", tagId: "tag-vip", tagName: "VIP" },
    });

    const result = await matchEventToWorkflows(event);
    expect(result).toHaveLength(1);
  });

  it("excludes workflows when filters don't match", async () => {
    const workflows = [
      {
        id: "wf-1",
        workspace_id: "ws-1",
        name: "VIP Tag",
        status: WorkflowStatus.Published,
        trigger_type: BusinessEventType.TagAdded,
        trigger_config: { filters: { tagId: "tag-vip" } },
        allow_re_enrollment: false,
      },
    ];

    mockInsforgeFrom.mockReturnValue(
      chainBuilder({ data: workflows, error: null })
    );

    const event = makeEvent({
      event_type: BusinessEventType.TagAdded,
      record_type: "contact",
      payload: { contactId: "c1", tagId: "tag-other", tagName: "Other" },
    });

    const result = await matchEventToWorkflows(event);
    expect(result).toHaveLength(0);
  });
});

describe("enrollRecord", () => {
  it("skips re-enrollment when not allowed and already enrolled", async () => {
    // First call: get workflow (allow_re_enrollment = false)
    const workflowBuilder = chainBuilder({
      data: {
        id: "wf-1",
        allow_re_enrollment: false,
      },
      error: null,
    });

    // Second call: check existing enrollments (found one)
    const enrollmentBuilder = chainBuilder({
      data: [{ id: "enr-existing", status: EnrollmentStatus.Active }],
      error: null,
    });

    let callCount = 0;
    mockInsforgeFrom.mockImplementation((table: string) => {
      if (table === "workflows") return workflowBuilder;
      if (table === "workflow_enrollments") return enrollmentBuilder;
      return chainBuilder({ data: null, error: null });
    });

    const result = await enrollRecord("wf-1", "wfv-1", "contact-1", "contact", "ws-1");

    expect(result).toBeNull();
    expect(mockCreateEnrollment).not.toHaveBeenCalled();
  });

  it("creates enrollment when re-enrollment is allowed", async () => {
    const workflowBuilder = chainBuilder({
      data: { id: "wf-1", allow_re_enrollment: true },
      error: null,
    });

    mockInsforgeFrom.mockReturnValue(workflowBuilder);

    const newEnrollment = {
      id: "enr-new",
      workflow_id: "wf-1",
      record_id: "contact-1",
      status: EnrollmentStatus.Active,
    };
    mockCreateEnrollment.mockResolvedValue(newEnrollment);

    const result = await enrollRecord("wf-1", "wfv-1", "contact-1", "contact", "ws-1");

    expect(result).toEqual(newEnrollment);
    expect(mockCreateEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: "wf-1",
        record_id: "contact-1",
        record_type: "contact",
      })
    );
  });
});

describe("processEvent", () => {
  it("contact_created event enrolls with contact ID as record_id", async () => {
    const workflow = {
      id: "wf-1",
      workspace_id: "ws-1",
      name: "Welcome",
      status: WorkflowStatus.Published,
      trigger_type: BusinessEventType.ContactCreated,
      trigger_config: {},
      allow_re_enrollment: true,
    };
    const version = {
      id: "wfv-1",
      workflow_id: "wf-1",
      version_number: 1,
      definition: { nodes: [], edges: [] },
    };

    // workflows query
    const workflowsBuilder = chainBuilder({ data: [workflow], error: null });
    // versions query
    const versionsBuilder = chainBuilder({ data: version, error: null });
    // workflow re-enrollment check
    const wfSingleBuilder = chainBuilder({ data: workflow, error: null });

    mockInsforgeFrom.mockImplementation((table: string) => {
      if (table === "workflows") {
        // First call is matchEventToWorkflows, second is enrollRecord
        return workflowsBuilder.single.mock.calls.length > 0
          ? wfSingleBuilder
          : workflowsBuilder;
      }
      if (table === "workflow_versions") return versionsBuilder;
      return chainBuilder({ data: null, error: null });
    });

    mockCreateEnrollment.mockResolvedValue({
      id: "enr-1",
      workflow_id: "wf-1",
      record_id: "contact-1",
    });

    const event = makeEvent({
      event_type: BusinessEventType.ContactCreated,
      record_id: "contact-1",
      record_type: "contact",
    });

    await processEvent(event);

    // Should use contact-1 as record_id (not a deal ID)
    expect(mockCreateEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        record_id: "contact-1",
        record_type: "contact",
      })
    );
    expect(mockAdvanceWorkflow).toHaveBeenCalledWith("enr-1");
  });

  it("deal_stage_changed event resolves deal's contact_id", async () => {
    const workflow = {
      id: "wf-1",
      workspace_id: "ws-1",
      name: "Deal Moved",
      status: WorkflowStatus.Published,
      trigger_type: BusinessEventType.DealStageChanged,
      trigger_config: {},
      allow_re_enrollment: true,
    };
    const version = {
      id: "wfv-1",
      workflow_id: "wf-1",
      version_number: 1,
      definition: { nodes: [], edges: [] },
    };

    const workflowsBuilder = chainBuilder({ data: [workflow], error: null });
    const versionsBuilder = chainBuilder({ data: version, error: null });
    const wfSingleBuilder = chainBuilder({ data: workflow, error: null });

    // Deal lookup: returns a deal with contact_id
    const dealsBuilder = chainBuilder({
      data: { contact_id: "contact-from-deal" },
      error: null,
    });

    mockInsforgeFrom.mockImplementation((table: string) => {
      if (table === "workflows") {
        return workflowsBuilder.single.mock.calls.length > 0
          ? wfSingleBuilder
          : workflowsBuilder;
      }
      if (table === "workflow_versions") return versionsBuilder;
      if (table === "deals") return dealsBuilder;
      return chainBuilder({ data: null, error: null });
    });

    mockCreateEnrollment.mockResolvedValue({
      id: "enr-2",
      workflow_id: "wf-1",
      record_id: "contact-from-deal",
    });

    const event = makeEvent({
      event_type: BusinessEventType.DealStageChanged,
      record_id: "deal-1",
      record_type: "deal",
      payload: {
        dealId: "deal-1",
        previousStageId: "stage-1",
        newStageId: "stage-2",
        pipelineId: "pipe-1",
      },
    });

    await processEvent(event);

    // Key assertion: enrollment uses contact_id from the deal, NOT deal-1
    expect(mockCreateEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        record_id: "contact-from-deal",
        record_type: "contact",
      })
    );
    expect(mockAdvanceWorkflow).toHaveBeenCalledWith("enr-2");
  });
});
