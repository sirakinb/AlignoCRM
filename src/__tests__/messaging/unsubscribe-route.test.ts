import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

const H = vi.hoisted(() => ({
  addSuppression: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/messaging/suppressions", () => ({
  addSuppression: H.addSuppression,
}));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkUnsubscribeRateLimit: H.rateLimit,
}));

import { GET, POST } from "@/app/api/unsubscribe/[token]/route";
import { signUnsubToken } from "@/lib/messaging/token";

function params(token: string) {
  return { params: Promise.resolve({ token }) };
}
function req() {
  return new Request("https://app.example/api/unsubscribe/x", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.rateLimit.mockResolvedValue(true);
  H.addSuppression.mockResolvedValue(undefined);
});

describe("GET /api/unsubscribe/[token] — confirm only (REQ-SEC-09, P4-26)", () => {
  it("renders a confirm page and writes NOTHING for a valid token", async () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "j@x.com" });
    const res = await GET(req(), params(token));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("method=\"POST\"");
    expect(H.addSuppression).not.toHaveBeenCalled(); // GET must not mutate
  });

  it("renders a neutral invalid page for a bad token and writes nothing", async () => {
    const res = await GET(req(), params("garbage.token.here"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("no longer valid");
    expect(H.addSuppression).not.toHaveBeenCalled();
  });
});

describe("POST /api/unsubscribe/[token] — executes (P4-26b)", () => {
  it("writes an unsubscribe suppression for the token's workspace/address", async () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "j@x.com" });
    const res = await POST(req(), params(token));
    expect(res.status).toBe(200);
    expect(H.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-a", channel: "email", address: "j@x.com", reason: "unsubscribe" })
    );
  });

  it("rejects a tampered token without writing", async () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "j@x.com" });
    const bad = token.slice(0, -3) + "AAA";
    const res = await POST(req(), params(bad));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("no longer valid");
    expect(H.addSuppression).not.toHaveBeenCalled();
  });

  it("derives the rate-limit IP from the platform header / rightmost XFF, not the attacker-prepended first entry (Gate-4 #4)", async () => {
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "j@x.com" });

    // Platform-set header wins over a spoofable X-Forwarded-For.
    const withVercel = new Request("https://app.example/x", {
      method: "POST",
      headers: { "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });
    await POST(withVercel, params(token));
    expect(H.rateLimit).toHaveBeenLastCalledWith("9.9.9.9");

    // Without the platform header, take the RIGHTMOST XFF entry (the hop the
    // trusted proxy saw), never the attacker-prepended first one.
    H.rateLimit.mockClear();
    const xffOnly = new Request("https://app.example/x", {
      method: "POST",
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });
    await POST(xffOnly, params(token));
    expect(H.rateLimit).toHaveBeenLastCalledWith("2.2.2.2");
  });

  it("is rate-limited per IP (429 when the limiter says no)", async () => {
    H.rateLimit.mockResolvedValue(false);
    const token = signUnsubToken({ workspaceId: "ws-a", channel: "email", address: "j@x.com" });
    const res = await POST(req(), params(token));
    expect(res.status).toBe(429);
    expect(H.addSuppression).not.toHaveBeenCalled();
  });
});
