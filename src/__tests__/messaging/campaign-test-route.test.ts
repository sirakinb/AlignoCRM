import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  tenant: vi.fn(),
  getCampaign: vi.fn(),
  from: vi.fn(),
  send: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: H.tenant,
  tenantErrorResponse: () => null,
}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.from } },
}));
vi.mock("@/lib/data/campaigns", () => ({ getCampaign: H.getCampaign }));
vi.mock("@/lib/messaging/send-message", () => ({
  sendConversationMessage: H.send,
  SendMessageError: class SendMessageError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/messaging/rate-limit", () => ({ checkSendRateLimit: H.rate }));

import { POST } from "@/app/api/campaigns/[id]/test/route";

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function jsonReq(body: unknown) {
  return new Request("https://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function contactBuilder() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "limit"]) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (r: (v: unknown) => unknown) =>
    r({ data: [{ id: "k1", first_name: "Bob", last_name: "Lee", email: "bob@x.com", phone: null, company: "Acme" }] });
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  H.tenant.mockResolvedValue({ workspaceId: "ws-a", organizationId: null, role: "owner" });
  H.getCampaign.mockResolvedValue({
    id: "c1", workspace_id: "ws-a", channel: "email", status: "draft",
    subject: "Hi {{contact.first_name}}", body: "<p>Hello {{contact.first_name}}</p>",
  });
  H.from.mockImplementation(() => contactBuilder());
  H.send.mockResolvedValue({ id: "m1" });
  H.rate.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
});

describe("POST /api/campaigns/[id]/test", () => {
  it("sends ONE rendered 1:1 message (no campaignId) and returns ok", async () => {
    const res = await POST(jsonReq({ contactId: "k1" }), idParams("c1"));
    expect(res.status).toBe(200);
    expect(H.send).toHaveBeenCalledTimes(1);
    const arg = H.send.mock.calls[0][0];
    expect(arg.campaignId).toBeUndefined(); // NOT a campaign row
    expect(arg.bodyIsHtml).toBe(true); // faithful HTML render for email
    expect(arg.body).toContain("Hello Bob"); // merge tag interpolated
    expect(arg.subject).toContain("[Test]");
  });

  it("403s for a non-owner/admin", async () => {
    H.tenant.mockResolvedValue({ workspaceId: "ws-a", organizationId: null, role: "member" });
    const res = await POST(jsonReq({ contactId: "k1" }), idParams("c1"));
    expect(res.status).toBe(403);
    expect(H.send).not.toHaveBeenCalled();
  });

  it("404s for a campaign not in the workspace", async () => {
    H.getCampaign.mockResolvedValue(null);
    const res = await POST(jsonReq({ contactId: "k1" }), idParams("c-foreign"));
    expect(res.status).toBe(404);
    expect(H.send).not.toHaveBeenCalled();
  });

  it("400s when contactId is missing", async () => {
    const res = await POST(jsonReq({}), idParams("c1"));
    expect(res.status).toBe(400);
    expect(H.send).not.toHaveBeenCalled();
  });

  it("429s and does not send when the 1:1 limiter is exhausted", async () => {
    H.rate.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
    const res = await POST(jsonReq({ contactId: "k1" }), idParams("c1"));
    expect(res.status).toBe(429);
    expect(H.send).not.toHaveBeenCalled();
  });
});
