import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalStatus, ApprovalAction, ApprovalContentType } from "@/types/approval";

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

vi.mock("@/lib/insforge/client", () => ({
  insforge: {
    database: {
      from: vi.fn(() => chainable()),
    },
  },
}));

import { insforge } from "@/lib/insforge/client";
import {
  getApprovalRequests,
  getApprovalRequest,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  editAndApproveRequest,
} from "@/lib/data/approvals";

describe("approvals data layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable());
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockOrder.mockReturnValue(chainable());
  });

  describe("getApprovalRequests", () => {
    it("fetches requests filtered by workspace_id", async () => {
      const requests = [
        { id: "apr-1", workspace_id: "ws-1", status: "pending" },
      ];
      mockOrder.mockResolvedValueOnce({ data: requests, error: null });

      const result = await getApprovalRequests("ws-1");

      expect(insforge.database.from).toHaveBeenCalledWith("approval_requests");
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
      expect(result).toEqual(requests);
    });

    it("applies optional status filter", async () => {
      mockOrder.mockResolvedValueOnce({ data: [], error: null });

      await getApprovalRequests("ws-1", { status: ApprovalStatus.Pending });

      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
      expect(mockEq).toHaveBeenCalledWith("status", "pending");
    });

    it("throws on error", async () => {
      const error = new Error("DB error");
      mockOrder.mockResolvedValueOnce({ data: null, error });

      await expect(getApprovalRequests("ws-1")).rejects.toThrow("DB error");
    });
  });

  describe("getApprovalRequest", () => {
    it("fetches a single request by id", async () => {
      const request = { id: "apr-1", status: "pending" };
      mockSingle.mockResolvedValueOnce({ data: request, error: null });

      const result = await getApprovalRequest("apr-1");

      expect(insforge.database.from).toHaveBeenCalledWith("approval_requests");
      expect(mockEq).toHaveBeenCalledWith("id", "apr-1");
      expect(result).toEqual(request);
    });
  });

  describe("createApprovalRequest", () => {
    it("creates a request with correct fields", async () => {
      const input = {
        workspace_id: "ws-1",
        content_type: ApprovalContentType.EmailDraft,
        content: { to: "test@example.com", subject: "Hello", body: "Hi" },
        context: { trigger: "deal_stage_changed" },
      };
      const created = { id: "apr-new", ...input, status: "pending" };
      mockSingle.mockResolvedValueOnce({ data: created, error: null });

      const result = await createApprovalRequest(input);

      expect(insforge.database.from).toHaveBeenCalledWith("approval_requests");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          content_type: "email_draft",
          content: input.content,
          context: input.context,
        })
      );
      expect(result).toEqual(created);
    });
  });

  describe("approveRequest", () => {
    it("updates status to approved and creates action record", async () => {
      // First call: update request status
      mockEq.mockResolvedValueOnce({ error: null });
      // Second call: insert action record
      const actionRecord = {
        id: "act-1",
        request_id: "apr-1",
        actor_id: "user-1",
        action: "approved",
      };
      mockSingle.mockResolvedValueOnce({ data: actionRecord, error: null });

      const result = await approveRequest("apr-1", "user-1", "Looks good");

      expect(insforge.database.from).toHaveBeenCalledWith("approval_requests");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApprovalStatus.Approved,
          updated_at: expect.any(String),
        })
      );
      expect(insforge.database.from).toHaveBeenCalledWith("approval_actions");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: "apr-1",
          actor_id: "user-1",
          action: ApprovalAction.Approved,
          notes: "Looks good",
        })
      );
      expect(result).toEqual(actionRecord);
    });
  });

  describe("rejectRequest", () => {
    it("updates status to rejected and creates action record", async () => {
      mockEq.mockResolvedValueOnce({ error: null });
      const actionRecord = {
        id: "act-2",
        request_id: "apr-1",
        action: "rejected",
      };
      mockSingle.mockResolvedValueOnce({ data: actionRecord, error: null });

      const result = await rejectRequest("apr-1", "user-1", "Needs rework");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: ApprovalStatus.Rejected })
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ApprovalAction.Rejected,
          notes: "Needs rework",
        })
      );
      expect(result).toEqual(actionRecord);
    });
  });

  describe("editAndApproveRequest", () => {
    it("updates with edited content and creates action record", async () => {
      const editedContent = { to: "test@example.com", subject: "Updated", body: "New body" };
      mockEq.mockResolvedValueOnce({ error: null });
      const actionRecord = {
        id: "act-3",
        request_id: "apr-1",
        action: "edited",
        edited_content: editedContent,
      };
      mockSingle.mockResolvedValueOnce({ data: actionRecord, error: null });

      const result = await editAndApproveRequest(
        "apr-1",
        "user-1",
        editedContent,
        "Fixed subject line"
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApprovalStatus.Edited,
          content: editedContent,
        })
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ApprovalAction.Edited,
          edited_content: editedContent,
          notes: "Fixed subject line",
        })
      );
      expect(result).toEqual(actionRecord);
    });
  });
});
