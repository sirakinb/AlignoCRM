import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockSyncAllEmailConnections } = vi.hoisted(() => ({
  mockSyncAllEmailConnections: vi.fn(),
}));

vi.mock("@/lib/messaging/email-sync", () => ({
  syncAllEmailConnections: mockSyncAllEmailConnections,
}));

import { GET } from "@/app/api/cron/email-sync/route";

const SECRET = "test-cron-secret";

function cronRequest(auth?: string): Request {
  return new Request("https://app.example/api/cron/email-sync", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/cron/email-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(mockSyncAllEmailConnections).not.toHaveBeenCalled();
  });

  it("returns 401 without the bearer secret", async () => {
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
    expect(mockSyncAllEmailConnections).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong secret", async () => {
    const res = await GET(cronRequest("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(mockSyncAllEmailConnections).not.toHaveBeenCalled();
  });

  it("runs the sync and returns a summary", async () => {
    mockSyncAllEmailConnections.mockResolvedValue({
      connections: 2,
      results: [
        { connectionId: "c1", processed: 3, stored: 2, skipped: 1 },
        { connectionId: "c2", processed: 0, stored: 0, skipped: 0, error: "boom" },
      ],
    });

    const res = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toBe(2);
    expect(body.stored).toBe(2);
    expect(body.errors).toBe(1);
  });

  it("returns 500 when the sync throws", async () => {
    mockSyncAllEmailConnections.mockRejectedValue(new Error("db down"));
    const res = await GET(cronRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
  });
});
