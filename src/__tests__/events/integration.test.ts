import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusinessEventType } from "@/types/events";

const mockEmitEvent = vi.fn();

vi.mock("@/lib/events/emitter", () => ({
  emitEvent: (...args: unknown[]) => mockEmitEvent(...args),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockLimit = vi.fn();

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
  limit: mockLimit,
});

mockSelect.mockReturnValue(chainable());
mockInsert.mockReturnValue(chainable());
mockUpdate.mockReturnValue(chainable());
mockDelete.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());
mockOrder.mockReturnValue(chainable());
mockLimit.mockReturnValue(chainable());

vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

// Mock activity-logs for deals
vi.mock("@/lib/data/activity-logs", () => ({
  createActivityLog: vi.fn().mockResolvedValue({}),
}));

import { createContact } from "@/lib/data/contacts";
import { createTask } from "@/lib/data/tasks";
import { addTagToContact } from "@/lib/data/tags";
import { moveDealStage } from "@/lib/data/deals";

describe("CRM event integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitEvent.mockResolvedValue({ id: "evt-1" });
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockDelete.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
    mockLimit.mockReturnValue(chainable());
  });

  it("createContact emits contact_created event", async () => {
    const contact = {
      id: "c-1",
      workspace_id: "ws-1",
      first_name: "Alice",
      last_name: "Smith",
      email: "alice@example.com",
      phone: null,
      status: "active",
      owner_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mockSingle.mockResolvedValueOnce({ data: contact, error: null });

    await createContact({
      workspace_id: "ws-1",
      first_name: "Alice",
      last_name: "Smith",
      email: "alice@example.com",
    });

    expect(mockEmitEvent).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      event_type: BusinessEventType.ContactCreated,
      record_id: "c-1",
      record_type: "contact",
      payload: {
        contactId: "c-1",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
      },
    });
  });

  it("createTask emits task_created event", async () => {
    const task = {
      id: "t-1",
      workspace_id: "ws-1",
      title: "Follow up",
      description: null,
      status: "pending",
      assignee_id: "user-1",
      contact_id: "c-1",
      deal_id: null,
      due_date: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mockSingle.mockResolvedValueOnce({ data: task, error: null });

    await createTask({
      workspace_id: "ws-1",
      title: "Follow up",
      assignee_id: "user-1",
      contact_id: "c-1",
    });

    expect(mockEmitEvent).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      event_type: BusinessEventType.TaskCreated,
      record_id: "t-1",
      record_type: "task",
      payload: {
        taskId: "t-1",
        title: "Follow up",
        assigneeId: "user-1",
        contactId: "c-1",
        dealId: null,
      },
    });
  });

  it("addTagToContact emits tag_added event when workspaceId provided", async () => {
    const contactTag = { contact_id: "c-1", tag_id: "tag-1" };
    mockSingle
      .mockResolvedValueOnce({ data: contactTag, error: null })
      .mockResolvedValueOnce({
        data: { id: "tag-1", name: "VIP", workspace_id: "ws-1" },
        error: null,
      });

    await addTagToContact("c-1", "tag-1", "ws-1");

    expect(mockEmitEvent).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      event_type: BusinessEventType.TagAdded,
      record_id: "c-1",
      record_type: "contact",
      payload: {
        contactId: "c-1",
        tagId: "tag-1",
        tagName: "VIP",
      },
    });
  });

  it("addTagToContact does not emit event without workspaceId", async () => {
    const contactTag = { contact_id: "c-1", tag_id: "tag-1" };
    mockSingle.mockResolvedValueOnce({ data: contactTag, error: null });

    await addTagToContact("c-1", "tag-1");

    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it("moveDealStage emits deal_stage_changed event", async () => {
    const existingDeal = {
      id: "d-1",
      workspace_id: "ws-1",
      pipeline_id: "pipe-1",
      stage_id: "stage-1",
      title: "Big Deal",
      value: 10000,
      contact_id: null,
      owner_id: null,
      status: "open",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const updatedDeal = { ...existingDeal, stage_id: "stage-2" };

    // getDeal call
    mockSingle.mockResolvedValueOnce({ data: existingDeal, error: null });
    // getStage call (moveDealStage derives deal status from stage.name)
    mockSingle.mockResolvedValueOnce({
      data: { id: "stage-2", name: "Negotiation", position: 1 },
      error: null,
    });
    // update call
    mockSingle.mockResolvedValueOnce({ data: updatedDeal, error: null });

    await moveDealStage("d-1", "stage-2");

    expect(mockEmitEvent).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      event_type: BusinessEventType.DealStageChanged,
      record_id: "d-1",
      record_type: "deal",
      payload: {
        dealId: "d-1",
        previousStageId: "stage-1",
        newStageId: "stage-2",
        pipelineId: "pipe-1",
      },
    });
  });
});
