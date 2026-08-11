import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockSelect, mockEq, mockLimit, mockUpsert } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockLimit: vi.fn(),
  mockUpsert: vi.fn(),
}));

const chainable = () => ({
  select: mockSelect,
  eq: mockEq,
  limit: mockLimit,
  upsert: mockUpsert,
});

vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: mockFrom } },
}));

import { checkRateLimit } from "@/lib/messaging/rate-limit";

describe("checkRateLimit (REQ-SEC-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("allows and increments when under the limit", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ count: 5 }] });
    const ok = await checkRateLimit("wh:resend", 600, 60_000);
    expect(ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ bucket_key: "wh:resend", count: 6 }),
      { onConflict: "bucket_key,window_start" }
    );
  });

  it("starts a fresh window at count 1 when no row exists", async () => {
    mockLimit.mockResolvedValueOnce({ data: [] });
    const ok = await checkRateLimit("wh:resend", 600, 60_000);
    expect(ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }), expect.anything());
  });

  it("rejects (and does not increment) at the limit", async () => {
    mockLimit.mockResolvedValueOnce({ data: [{ count: 600 }] });
    const ok = await checkRateLimit("wh:resend", 600, 60_000);
    expect(ok).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("fails OPEN on a counter error for webhook buckets (availability > perfect quota)", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const ok = await checkRateLimit("wh:resend", 600, 60_000);
    expect(ok).toBe(true);
  });

  it("fails CLOSED on a counter error for send buckets (spend ceiling, MEDIUM #2)", async () => {
    mockLimit.mockRejectedValueOnce(new Error("db down"));
    const ok = await checkRateLimit("send:ws-1", 60, 60_000, false);
    expect(ok).toBe(false);
  });
});

describe("checkSendRateLimit — 1:1 spend gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("blocks (fails closed) when the counter store is down", async () => {
    mockLimit.mockRejectedValue(new Error("db down"));
    const { checkSendRateLimit } = await import("@/lib/messaging/rate-limit");
    const res = await checkSendRateLimit("ws-1");
    expect(res.ok).toBe(false);
    expect(res.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows when under the per-minute and per-day limits", async () => {
    mockLimit.mockResolvedValue({ data: [{ count: 1 }] });
    const { checkSendRateLimit } = await import("@/lib/messaging/rate-limit");
    const res = await checkSendRateLimit("ws-1");
    expect(res.ok).toBe(true);
  });
});

describe("checkCampaignSendRateLimit — bulk spend gate (Gate-4 #7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chainable());
    mockSelect.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("fails CLOSED (blocks the campaign send) when the counter store is down", async () => {
    mockLimit.mockRejectedValue(new Error("db down"));
    const { checkCampaignSendRateLimit } = await import("@/lib/messaging/rate-limit");
    const res = await checkCampaignSendRateLimit("ws-1");
    expect(res.ok).toBe(false);
  });

  it("allows under the 5/hour limit", async () => {
    mockLimit.mockResolvedValue({ data: [{ count: 2 }] });
    const { checkCampaignSendRateLimit } = await import("@/lib/messaging/rate-limit");
    const res = await checkCampaignSendRateLimit("ws-1");
    expect(res.ok).toBe(true);
  });
});
