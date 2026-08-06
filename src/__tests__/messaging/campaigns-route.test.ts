import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

const H = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  setCampaignFields: vi.fn(),
  claim: vi.fn(),
  materialize: vi.fn(),
  kick: vi.fn(),
  process: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: vi.fn().mockResolvedValue({
    workspaceId: "ws-a",
    organizationId: null,
    role: "owner",
  }),
  tenantErrorResponse: () => null,
}));
vi.mock("@/lib/data/campaigns", () => ({
  getCampaign: H.getCampaign,
  updateCampaign: H.updateCampaign,
  deleteCampaign: H.deleteCampaign,
  setCampaignFields: H.setCampaignFields,
  claimCampaignForSending: H.claim,
}));
vi.mock("@/lib/data/templates", () => ({ getTemplate: vi.fn() }));
vi.mock("@/lib/messaging/campaign-processor", () => ({
  materializeCampaign: H.materialize,
  kickProcessor: H.kick,
  processCampaignChunk: H.process,
  CampaignCapError: class CampaignCapError extends Error {},
}));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkCampaignSendRateLimit: H.rate,
  checkRateLimit: vi.fn().mockResolvedValue(true),
  RATE_LIMITS: { webhookPerRoute: { limit: 600, windowMs: 60000 } },
  CAMPAIGN_CAPS: { perCampaign: 5000, perWorkspacePerDay: 10000 },
}));

import { PATCH, DELETE } from "@/app/api/campaigns/[id]/route";
import { POST as sendPost } from "@/app/api/campaigns/[id]/send/route";
import { POST as processPost } from "@/app/api/campaigns/[id]/process/route";
import { signJobToken } from "@/lib/messaging/token";

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

beforeEach(() => {
  vi.clearAllMocks();
  H.rate.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
});

describe("campaign immutability (P4-06)", () => {
  it("PATCH on a sending campaign returns 409 and does not update", async () => {
    H.getCampaign.mockResolvedValue({ id: "c1", workspace_id: "ws-a", status: "sending" });
    const res = await PATCH(jsonReq({ name: "x" }), idParams("c1"));
    expect(res.status).toBe(409);
    expect(H.updateCampaign).not.toHaveBeenCalled();
  });
  it("DELETE on a sent campaign returns 409", async () => {
    H.getCampaign.mockResolvedValue({ id: "c1", workspace_id: "ws-a", status: "sent" });
    const res = await DELETE(new Request("https://x"), idParams("c1"));
    expect(res.status).toBe(409);
    expect(H.deleteCampaign).not.toHaveBeenCalled();
  });
  it("PATCH/DELETE return 404 for a foreign campaign id", async () => {
    H.getCampaign.mockResolvedValue(null);
    expect((await PATCH(jsonReq({ name: "x" }), idParams("c-foreign"))).status).toBe(404);
    expect((await DELETE(new Request("https://x"), idParams("c-foreign"))).status).toBe(404);
  });
});

describe("campaign send — double-send guard (P4-13)", () => {
  it("returns 409 when the campaign is already sending, without materializing", async () => {
    H.getCampaign.mockResolvedValue({
      id: "c1", workspace_id: "ws-a", status: "sending", audience: { all: true },
    });
    const res = await sendPost(new Request("https://x", { method: "POST" }), idParams("c1"));
    expect(res.status).toBe(409);
    expect(H.materialize).not.toHaveBeenCalled();
  });

  it("materializes + kicks the processor for a draft", async () => {
    const draft = { id: "c1", workspace_id: "ws-a", status: "draft", audience: { all: true } };
    H.getCampaign.mockResolvedValue(draft);
    // The atomic claim succeeds (draft→sending) and returns the claimed row.
    H.claim.mockResolvedValue({ ...draft, status: "sending" });
    H.materialize.mockResolvedValue({ totalCount: 3, suppressedCount: 0, noAddressCount: 0 });
    const res = await sendPost(new Request("https://x", { method: "POST" }), idParams("c1"));
    expect(res.status).toBe(202);
    expect(H.kick).toHaveBeenCalledWith("c1", "ws-a", 1);
  });

  it("409s when the atomic claim loses the race (concurrent send)", async () => {
    H.getCampaign.mockResolvedValue({
      id: "c1", workspace_id: "ws-a", status: "draft", audience: { all: true },
    });
    H.claim.mockResolvedValue(null); // another /send already flipped draft→sending
    const res = await sendPost(new Request("https://x", { method: "POST" }), idParams("c1"));
    expect(res.status).toBe(409);
    expect(H.materialize).not.toHaveBeenCalled();
  });
});

describe("campaign processor auth (REQ-SEC-16)", () => {
  it("rejects a request with no token (401)", async () => {
    const res = await processPost(jsonReq({}), idParams("c1"));
    expect(res.status).toBe(401);
    expect(H.process).not.toHaveBeenCalled();
  });

  it("rejects a token minted for a different campaign (401)", async () => {
    const foreign = signJobToken({ campaignId: "c2", workspaceId: "ws-a", chunk: 1 });
    const res = await processPost(jsonReq({ token: foreign }), idParams("c1"));
    expect(res.status).toBe(401);
    expect(H.process).not.toHaveBeenCalled();
  });

  it("rejects an expired token (401)", async () => {
    const { createHmac } = await import("node:crypto");
    const payload = { campaignId: "c1", workspaceId: "ws-a", chunk: 1, exp: Math.floor(Date.now() / 1000) - 5 };
    const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", process.env.MESSAGING_TOKEN_SECRET!).update(`v1.${b}`).digest("base64url");
    const res = await processPost(jsonReq({ token: `v1.${b}.${sig}` }), idParams("c1"));
    expect(res.status).toBe(401);
    expect(H.process).not.toHaveBeenCalled();
  });

  it("accepts a valid matching token and runs the processor", async () => {
    H.process.mockResolvedValue({ done: false, processed: 5 });
    const token = signJobToken({ campaignId: "c1", workspaceId: "ws-a", chunk: 1 });
    const res = await processPost(jsonReq({ token }), idParams("c1"));
    expect(res.status).toBe(200);
    expect(H.process).toHaveBeenCalled();
  });
});
