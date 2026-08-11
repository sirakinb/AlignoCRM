import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockSelect, mockInsert, mockUpdate, mockEq, mockLimit } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockLimit: vi.fn(),
}));

const chainable = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  limit: mockLimit,
});

vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: mockFrom } },
}));

import { addSuppression, findSuppression } from "@/lib/messaging/suppressions";

describe("addSuppression — precedence (QA MEDIUM #7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockInsert.mockReturnValue(chainable()); // awaited object → success (error undefined)
    mockUpdate.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
  });

  it("inserts a new row when none exists", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null }); // findSuppression → none
    await addSuppression({ workspaceId: "ws-1", channel: "email", address: "X@Example.com", reason: "bounce" });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email", address: "x@example.com", reason: "bounce" })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("UPGRADES a weaker reason (unsubscribe → bounce)", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ reason: "unsubscribe" }], error: null });
    await addSuppression({ workspaceId: "ws-1", channel: "email", address: "a@b.com", reason: "bounce" });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ reason: "bounce" }));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("NEVER downgrades a hard block: manual is not overwritten by complaint", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ reason: "manual" }], error: null });
    await addSuppression({ workspaceId: "ws-1", channel: "email", address: "a@b.com", reason: "complaint" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("NEVER downgrades bounce → complaint (P1-30 hard-block preserved)", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ reason: "bounce" }], error: null });
    await addSuppression({ workspaceId: "ws-1", channel: "email", address: "a@b.com", reason: "complaint" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when the reason is unchanged", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ reason: "stop" }], error: null });
    await addSuppression({ workspaceId: "ws-1", channel: "sms", address: "+13105551234", reason: "stop" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("findSuppression — normalized, workspace-scoped lookup (P1-31/P1-32)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
  });

  it("lowercases the email and scopes the query by workspace (P1-31/P1-32)", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ reason: "bounce" }], error: null });
    const hit = await findSuppression("ws-1", "email", "X@Example.COM");
    expect(hit).toEqual({ reason: "bounce" });
    expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(mockEq).toHaveBeenCalledWith("address", "x@example.com");
  });

  it("returns null (no cross-tenant match) when the workspace has no row (P1-32)", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    const hit = await findSuppression("ws-2", "email", "x@example.com");
    expect(hit).toBeNull();
  });
});
