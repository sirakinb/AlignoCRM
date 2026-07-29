import { describe, it, expect, vi, beforeEach } from "vitest";

// Each `from()` call returns an independent chain. We track which table
// was queried so we can resolve per-call.
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
  self.in = vi.fn(chainMethod);
  self.order = vi.fn(chainMethod);
  self.limit = vi.fn(chainMethod);
  self.single = vi.fn(() => {
    const result = fromCallResults[idx];
    return Promise.resolve(result ?? { data: null, error: null });
  });
  // Make the chain itself thenable so `await chain` resolves
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

vi.mock("@/lib/data/enrollments", () => ({
  createEnrollment: vi.fn(),
  getEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  createExecutionStep: vi.fn(),
}));

vi.mock("@/lib/workflows/executor", () => ({
  advanceWorkflow: vi.fn(),
}));

import { insforge } from "@/lib/insforge/client";
import {
  matchEventToWorkflows,
  enrollRecord,
  processEvent,
} from "@/lib/workflows/trigger-matcher";
import { createEnrollment } from "@/lib/data/enrollments";
import { advanceWorkflow } from "@/lib/workflows/executor";
import { BusinessEventType } from "@/types/events";
import type { BusinessEvent } from "@/types/events";
import type { Workflow } from "@/types/workflow";
import { WorkflowStatus } from "@/types/workflow";

const makeEvent = (overrides?: Partial<BusinessEvent>): BusinessEvent => ({
  id: "evt-1",
  workspace_id: "ws-1",
  event_type: BusinessEventType.ContactCreated,
  record_id: "c-1",
  record_type: "contact",
  payload: {
    contactId: "c-1",
    email: "test@example.com",
    firstName: "Alice",
    lastName: "Smith",
  },
  idempotency_key: "contact_created:c-1:123",
  processed: false,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeWorkflow = (overrides?: Partial<Workflow>): Workflow => ({
  id: "wf-1",
  workspace_id: "ws-1",
  name: "Test Workflow",
  description: null,
  status: WorkflowStatus.Published,
  trigger_type: BusinessEventType.ContactCreated,
  trigger_config: {},
  allow_re_enrollment: false,
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("trigger-matcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallResults = [];
    fromCallIndex = 0;
  });

  describe("matchEventToWorkflows", () => {
    it("returns workflows matching the event type", async () => {
      const workflows = [makeWorkflow()];
      // matchEventToWorkflows does: from("workflows").select().eq().eq().eq()
      // This is the first from() call (index 0), result resolved via .then
      fromCallResults[0] = { data: workflows, error: null };

      const event = makeEvent();
      const result = await matchEventToWorkflows(event);

      expect(mockFrom).toHaveBeenCalledWith("workflows");
      expect(result).toEqual(workflows);
    });

    it("filters workflows by trigger_config filters", async () => {
      const wfMatch = makeWorkflow({
        id: "wf-match",
        trigger_config: { filters: { email: "test@example.com" } },
      });
      const wfNoMatch = makeWorkflow({
        id: "wf-no",
        trigger_config: { filters: { email: "other@example.com" } },
      });
      fromCallResults[0] = { data: [wfMatch, wfNoMatch], error: null };

      const event = makeEvent();
      const result = await matchEventToWorkflows(event);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("wf-match");
    });

    it("returns all workflows when no filters", async () => {
      const wf = makeWorkflow({ trigger_config: {} });
      fromCallResults[0] = { data: [wf], error: null };

      const result = await matchEventToWorkflows(makeEvent());
      expect(result).toHaveLength(1);
    });

    it("throws on database error", async () => {
      fromCallResults[0] = {
        data: null,
        error: { code: "42P01", message: "table not found" },
      };

      await expect(matchEventToWorkflows(makeEvent())).rejects.toEqual(
        expect.objectContaining({ code: "42P01" })
      );
    });
  });

  describe("enrollRecord", () => {
    it("creates enrollment when not already enrolled", async () => {
      // Call 0: from("workflows").select().eq().single() -> fetch workflow
      fromCallResults[0] = {
        data: makeWorkflow({ allow_re_enrollment: false }),
        error: null,
      };
      // Call 1: from("workflow_enrollments").select().eq().eq().eq().eq() -> check existing
      fromCallResults[1] = { data: [], error: null };

      const enrollment = {
        id: "enr-1",
        workspace_id: "ws-1",
        workflow_id: "wf-1",
        workflow_version_id: "ver-1",
        record_id: "c-1",
        record_type: "contact",
        status: "active",
      };
      (createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        enrollment
      );

      const result = await enrollRecord(
        "wf-1",
        "ver-1",
        "c-1",
        "contact",
        "ws-1"
      );

      expect(result).toEqual(enrollment);
      expect(createEnrollment).toHaveBeenCalledWith({
        workspace_id: "ws-1",
        workflow_id: "wf-1",
        workflow_version_id: "ver-1",
        record_id: "c-1",
        record_type: "contact",
      });
    });

    it("skips enrollment when already active and re-enrollment disabled", async () => {
      fromCallResults[0] = {
        data: makeWorkflow({ allow_re_enrollment: false }),
        error: null,
      };
      fromCallResults[1] = {
        data: [{ id: "enr-existing", status: "active" }],
        error: null,
      };

      const result = await enrollRecord(
        "wf-1",
        "ver-1",
        "c-1",
        "contact",
        "ws-1"
      );

      expect(result).toBeNull();
      expect(createEnrollment).not.toHaveBeenCalled();
    });

    it("allows re-enrollment when flag is true", async () => {
      fromCallResults[0] = {
        data: makeWorkflow({ allow_re_enrollment: true }),
        error: null,
      };

      const enrollment = { id: "enr-2", status: "active" };
      (createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        enrollment
      );

      const result = await enrollRecord(
        "wf-1",
        "ver-1",
        "c-1",
        "contact",
        "ws-1"
      );

      expect(result).toEqual(enrollment);
    });
  });

  describe("processEvent", () => {
    it("matches workflows, enrolls, and advances", async () => {
      const workflow = makeWorkflow();
      const version = { id: "ver-1", version_number: 1 };
      const enrollment = { id: "enr-1" };

      // Call 0: matchEventToWorkflows -> from("workflows")
      fromCallResults[0] = { data: [workflow], error: null };
      // Call 1: get latest version -> from("workflow_versions").select().eq().order().limit().single()
      fromCallResults[1] = { data: version, error: null };
      // Call 2: enrollRecord -> from("workflows").select().eq().single()
      fromCallResults[2] = {
        data: makeWorkflow({ allow_re_enrollment: true }),
        error: null,
      };

      (createEnrollment as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        enrollment
      );

      await processEvent(makeEvent());

      expect(advanceWorkflow).toHaveBeenCalledWith("enr-1");
    });

    it("skips when no workflows match", async () => {
      fromCallResults[0] = { data: [], error: null };

      await processEvent(makeEvent());

      expect(createEnrollment).not.toHaveBeenCalled();
      expect(advanceWorkflow).not.toHaveBeenCalled();
    });
  });
});
