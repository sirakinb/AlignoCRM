import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adversarial QA — Phase 4 campaign SEND route (spend-critical).
 *
 * Convention (matches adversarial-qa.test.ts): a test marked `it.fails` asserts
 * the CORRECT behavior and records that the current implementation does not meet
 * it — the suite stays green while the defect is pinned for the executor. A plain
 * `it` that passes is a confirmation that the control holds.
 */

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

const H = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  setCampaignFields: vi.fn(),
  claim: vi.fn(),
  materialize: vi.fn(),
  kick: vi.fn(),
  process: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: vi
    .fn()
    .mockResolvedValue({ workspaceId: "ws-a", organizationId: null, role: "owner" }),
  tenantErrorResponse: () => null,
}));
vi.mock("@/lib/data/campaigns", () => ({
  getCampaign: H.getCampaign,
  setCampaignFields: H.setCampaignFields,
  claimCampaignForSending: H.claim,
}));
vi.mock("@/lib/messaging/campaign-processor", () => ({
  materializeCampaign: H.materialize,
  kickProcessor: H.kick,
  processCampaignChunk: H.process,
  CampaignCapError: class CampaignCapError extends Error {},
}));
vi.mock("@/lib/messaging/campaign-audience", () => ({
  validateAudience: (a: unknown) => a,
  AudienceError: class AudienceError extends Error {},
}));
vi.mock("@/lib/messaging/rate-limit", () => ({
  checkCampaignSendRateLimit: H.rate,
  checkRateLimit: vi.fn().mockResolvedValue(true),
  RATE_LIMITS: { webhookPerRoute: { limit: 600, windowMs: 60_000 } },
  CAMPAIGN_CAPS: { perCampaign: 5_000, perWorkspacePerDay: 10_000 },
}));

import { POST as sendPost } from "@/app/api/campaigns/[id]/send/route";
import { POST as processPost } from "@/app/api/campaigns/[id]/process/route";
import { signJobToken } from "@/lib/messaging/token";

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function postReq() {
  return new Request("https://app.example/x", { method: "POST" });
}
function jsonReq(body: unknown) {
  return new Request("https://app.example/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.rate.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
  H.setCampaignFields.mockResolvedValue(undefined);
  H.kick.mockResolvedValue(undefined);
});

/**
 * FIXED (Gate/QA HIGH #1) — the double-send guard is now an atomic
 * compare-and-set: `claimCampaignForSending` does `UPDATE campaigns SET
 * status='sending' WHERE id=? AND workspace_id=? AND status='draft'` returning
 * the row, so under two overlapping /send calls Postgres row-locking lets exactly
 * ONE match and flip; the loser gets null → 409. Only the claimer materializes.
 * A partial UNIQUE(campaign_id, contact_id) index is the belt-and-suspenders
 * backstop against a double-materialize. This test models that CAS over a shared
 * campaign object; the assertions (materialize once, [202,409]) are unchanged
 * from when it was pinned as `it.fails`.
 */
describe("campaign /send — concurrent double-send TOCTOU (P4-13, spend)", () => {
  it(
    "two overlapping sends must materialize the audience exactly once",
    async () => {
      const campaign = {
        id: "c1",
        workspace_id: "ws-a",
        status: "draft",
        audience: { all: true },
      };
      // getCampaign returns a live snapshot; both concurrent calls see 'draft'
      // here — the race is only closed by the atomic claim below.
      H.getCampaign.mockImplementation(async () => ({ ...campaign }));
      // Atomic CAS: the FIRST call flips draft→sending and returns the row; every
      // later call sees non-draft and returns null (the DB WHERE status='draft'
      // matched zero rows).
      H.claim.mockImplementation(async () => {
        if (campaign.status !== "draft") return null;
        campaign.status = "sending";
        return { ...campaign };
      });
      H.materialize.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 15));
        return { totalCount: 3, suppressedCount: 0, noAddressCount: 0 };
      });

      const [r1, r2] = await Promise.all([
        sendPost(postReq(), idParams("c1")),
        sendPost(postReq(), idParams("c1")),
      ]);

      // Correct behavior: exactly one materialize, and one of the two calls is
      // rejected (409).
      expect(H.materialize).toHaveBeenCalledTimes(1);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([202, 409]);
    }
  );

  it("sequential re-send is still correctly rejected (P4-13 baseline holds)", async () => {
    H.getCampaign.mockResolvedValue({
      id: "c1",
      workspace_id: "ws-a",
      status: "sending",
      audience: { all: true },
    });
    const res = await sendPost(postReq(), idParams("c1"));
    expect(res.status).toBe(409);
    expect(H.materialize).not.toHaveBeenCalled();
  });
});

/**
 * CONFIRMATION — the processor route is gated by an HMAC job token. A token with
 * a valid structure but a tampered signature must be rejected constant-time
 * before the processor runs (REQ-SEC-16). This complements the existing
 * "no token / cross-campaign / expired" cases with the forged-signature case.
 */
describe("campaign /process — forged job token is rejected (REQ-SEC-16)", () => {
  it("a token with a tampered signature returns 401 and does not process", async () => {
    const good = signJobToken({ campaignId: "c1", workspaceId: "ws-a", chunk: 1 });
    const forged = good.slice(0, -4) + (good.endsWith("A") ? "BBBB" : "AAAA");
    const res = await processPost(jsonReq({ token: forged }), idParams("c1"));
    expect(res.status).toBe(401);
    expect(H.process).not.toHaveBeenCalled();
  });

  it("a structurally-bogus token returns 401 and does not process", async () => {
    const res = await processPost(jsonReq({ token: "v1.notbase64.nope" }), idParams("c1"));
    expect(res.status).toBe(401);
    expect(H.process).not.toHaveBeenCalled();
  });
});
