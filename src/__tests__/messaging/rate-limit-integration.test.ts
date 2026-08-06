import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P5-07 / P5-18c — the rate limiter proven end-to-end through the real send
 * helper, not by mocking the limiter's answer. A stateful in-memory stand-in for
 * `messaging_rate_counters` makes checkRateLimit / checkSendRateLimit run for
 * real; the DB is the only thing faked. This exercises:
 *   - the 61st 1:1 send in a window is refused with a Retry-After value AND never
 *     reaches sendConversationMessage (no provider call, no messages row) — P5-07.
 *   - the budget is per-workspace: A exhausting its quota never blocks B — P5-07d.
 *   - both 1:1 routes share ONE budget via the same `send:<ws>` key — P5-07e.
 *   - the campaign 5/hour gate and the unsubscribe 30/min/IP gate trip at their
 *     own boundaries with their own scopes — P5-07 (campaign), REQ-SEC-17.
 */

const H = vi.hoisted(() => ({
  counters: new Map<string, number>(),
  from: vi.fn(),
  sendConversationMessage: vi.fn(),
}));

// Minimal stateful counter store. checkRateLimit does select→(compare)→upsert.
// The window is stable within a test run (ms-scale), so keying on bucket_key is
// faithful to a single fixed window.
function counterMock() {
  let bucketKey = "";
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string, val: string) => {
    if (col === "bucket_key") bucketKey = val;
    return chain;
  });
  chain.limit = vi.fn(async () => ({
    data: [{ count: H.counters.get(bucketKey) ?? 0 }],
    error: null,
  }));
  chain.upsert = vi.fn(async (row: { bucket_key: string; count: number }) => {
    H.counters.set(row.bucket_key, row.count);
    return { error: null };
  });
  return chain;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.from } },
}));
vi.mock("@/lib/messaging/send-message", () => ({
  sendConversationMessage: H.sendConversationMessage,
  SendMessageError: class SendMessageError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { performSend } from "@/lib/messaging/send-request";
import {
  checkCampaignSendRateLimit,
  checkUnsubscribeRateLimit,
} from "@/lib/messaging/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  H.counters.clear();
  H.from.mockImplementation(() => counterMock());
  H.sendConversationMessage.mockResolvedValue({ id: "m1", status: "sent" });
});

function goodSend(workspaceId: string) {
  return performSend(workspaceId, "contact-1", { channel: "email", body: "hi" });
}

describe("1:1 send limiter — end to end through performSend (P5-07)", () => {
  it("allows 60 sends then refuses the 61st with a Retry-After and no send-path call", async () => {
    for (let i = 0; i < 60; i++) {
      const out = await goodSend("ws-a");
      expect(out.kind).toBe("ok");
    }
    expect(H.sendConversationMessage).toHaveBeenCalledTimes(60);

    const blocked = await goodSend("ws-a");
    expect(blocked.kind).toBe("rate_limited");
    if (blocked.kind === "rate_limited") {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
    // The 61st never reached the transport layer — no provider call, no row.
    expect(H.sendConversationMessage).toHaveBeenCalledTimes(60);
  });

  it("is scoped per workspace: A exhausted does not block B (P5-07d)", async () => {
    for (let i = 0; i < 60; i++) await goodSend("ws-a");
    expect((await goodSend("ws-a")).kind).toBe("rate_limited");

    // Workspace B has its own budget and is unaffected.
    expect((await goodSend("ws-b")).kind).toBe("ok");
  });

  it("both 1:1 routes share ONE budget via send:<ws> (P5-07e)", async () => {
    // performSend is the shared body of both routes; 30 through one call site and
    // 30 through the other both land on the same `send:ws-a` bucket.
    for (let i = 0; i < 30; i++) await goodSend("ws-a"); // route: /api/messages/send
    for (let i = 0; i < 30; i++) await goodSend("ws-a"); // route: /conversations/[id]/messages
    expect(H.counters.get("send:ws-a")).toBe(60);
    expect((await goodSend("ws-a")).kind).toBe("rate_limited");
  });
});

describe("campaign send limiter — 5/hour/workspace (P5-07)", () => {
  it("allows 5 then refuses the 6th, scoped per workspace", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await checkCampaignSendRateLimit("ws-a")).ok).toBe(true);
    }
    const sixth = await checkCampaignSendRateLimit("ws-a");
    expect(sixth.ok).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);

    // A different workspace still has its full budget.
    expect((await checkCampaignSendRateLimit("ws-b")).ok).toBe(true);
  });
});

describe("unsubscribe limiter — 30/min/IP (REQ-SEC-17)", () => {
  it("allows 30 then refuses the 31st, scoped per IP", async () => {
    for (let i = 0; i < 30; i++) {
      expect(await checkUnsubscribeRateLimit("1.2.3.4")).toBe(true);
    }
    expect(await checkUnsubscribeRateLimit("1.2.3.4")).toBe(false);

    // A different source IP is independent.
    expect(await checkUnsubscribeRateLimit("5.6.7.8")).toBe(true);
  });
});
