import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockLimit = vi.fn();

const chainable = () => ({
  insert: mockInsert,
  select: mockSelect,
  eq: mockEq,
  limit: mockLimit,
});

mockSelect.mockReturnValue(chainable());
mockEq.mockReturnValue(chainable());

vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: vi.fn(() => chainable()) } },
}));

import { claimWebhookEvent } from "@/lib/messaging/webhook-events";

describe("claimWebhookEvent (idempotency, REQ-SEC-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
  });

  it("returns true on first insert (process it)", async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    await expect(claimWebhookEvent("resend", "evt_1", "email.delivered")).resolves.toBe(true);
  });

  it("returns false when the event id already exists (replay → no-op)", async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: "duplicate key" } });
    mockLimit.mockResolvedValueOnce({ data: [{ id: "existing" }] });
    await expect(claimWebhookEvent("twilio", "SM1:delivered")).resolves.toBe(false);
  });

  it("rethrows a real (non-conflict) insert error", async () => {
    const dbErr = { message: "connection refused" };
    mockInsert.mockResolvedValueOnce({ error: dbErr });
    mockLimit.mockResolvedValueOnce({ data: [] }); // no existing row → not a conflict
    await expect(claimWebhookEvent("resend", "evt_2")).rejects.toEqual(dbErr);
  });
});
