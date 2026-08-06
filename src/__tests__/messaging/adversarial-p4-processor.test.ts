import { describe, it, expect } from "vitest";
import { vi } from "vitest";

/**
 * Adversarial QA — Phase 4 chunked processor crash-mid-send handling.
 *
 * The executor flagged crash-mid-send orphan handling as a risk. The default
 * `send` (sendCampaignMessageRow) catches PROVIDER errors and returns "failed",
 * but its pre-send steps are not all inside that try: `findSuppression` runs
 * BEFORE the try, and the catch itself calls `markFailed` (another DB write). A
 * transient DB error in either THROWS out of `send`. `processCampaignChunk`'s
 * send loop is not wrapped in try/catch, so a thrown `send`:
 *   - aborts the whole chunk,
 *   - never reaches `recompute` or `reinvoke` (no successor is scheduled),
 *   - leaves the already-claimed rows stamped provider_id='claim:…', status
 *     'queued' — and `releaseRows` only releases the CURRENT invocation's claim,
 *     which never runs, so those rows can never be reclaimed by a successor.
 * Net effect: the campaign wedges in 'sending' forever, and /send then returns
 * 409 to every retry (P4-13), so it can neither finish nor be re-sent.
 */

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: vi.fn() } },
}));

import { processCampaignChunk } from "@/lib/messaging/campaign-processor";
import type { CampaignMessageRow } from "@/lib/messaging/send-message";
import type { Campaign } from "@/types/messaging";

function makeStore(total: number) {
  const campaign: Campaign = {
    id: "c1",
    workspace_id: "ws-a",
    organization_id: null,
    channel: "email",
    name: "T",
    subject: "S",
    body: "B",
    template_id: null,
    audience: { all: true },
    status: "sending",
    scheduled_at: null,
    total_count: total,
    sent_count: 0,
    delivered_count: 0,
    failed_count: 0,
    suppressed_count: 0,
    no_address_count: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
  type Row = CampaignMessageRow & { status: string; claimed: boolean };
  const rows: Row[] = [];
  for (let i = 0; i < total; i++) {
    rows.push({
      id: `m${i}`,
      workspace_id: "ws-a",
      contact_id: `k${i}`,
      channel: "email",
      subject: "S",
      body_text: null,
      body_html: "<p>hi</p>",
      to_address: `p${i}@x.com`,
      campaign_id: "c1",
      status: "queued",
      claimed: false,
    });
  }
  return { campaign, rows };
}

function token(chunk: number) {
  return {
    campaignId: "c1",
    workspaceId: "ws-a",
    chunk,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
}

describe("processCampaignChunk — crash-mid-send orphan/wedge", () => {
  it(
    "a transient send error must not wedge the campaign (successor scheduled, rows recoverable)",
    async () => {
      const { campaign, rows } = makeStore(10);
      let reinvokes = 0;
      const released: string[] = [];

      const deps = {
        chunkSize: 100,
        loadCampaign: async () => campaign,
        claimChunk: async (_c: string, _w: string, limit: number) => {
          const picked = rows.filter((r) => r.status === "queued" && !r.claimed).slice(0, limit);
          for (const r of picked) r.claimed = true;
          return picked.map((r) => ({ ...r }));
        },
        releaseRows: async (ids: string[]) => {
          released.push(...ids);
          for (const r of rows) if (ids.includes(r.id)) r.claimed = false;
        },
        countQueued: async () => rows.filter((r) => r.status === "queued").length,
        recompute: async () => {},
        markStatus: async (_id: string, _w: string, status: Campaign["status"]) => {
          campaign.status = status;
        },
        // Model a transient failure on one row: it THROWS rather than returning
        // "failed" (as findSuppression / markFailed can under a DB blip).
        send: async (row: CampaignMessageRow) => {
          if (row.id === "m3") throw new Error("transient DB error");
          const r = rows.find((x) => x.id === row.id);
          if (r) r.status = "sent";
          return "sent" as const;
        },
        reinvoke: async () => {
          reinvokes++;
        },
      };

      // Correct behavior: one bad recipient must not abort the run — the chunk
      // should settle what it can, release/leave the rest reclaimable, and hand
      // off to a successor so the campaign eventually reaches a terminal state.
      await expect(processCampaignChunk(token(1), deps)).resolves.toBeDefined();
      expect(reinvokes).toBeGreaterThan(0);
      // No row should be left permanently claimed-but-unsent (orphaned).
      const orphaned = rows.filter((r) => r.claimed && r.status === "queued");
      expect(orphaned).toHaveLength(0);
    }
  );

  it("baseline: when every send resolves, the chunk drains and schedules a successor", async () => {
    const { campaign, rows } = makeStore(5);
    let reinvokes = 0;
    const deps = {
      chunkSize: 100,
      loadCampaign: async () => campaign,
      claimChunk: async (_c: string, _w: string, limit: number) => {
        const picked = rows.filter((r) => r.status === "queued" && !r.claimed).slice(0, limit);
        for (const r of picked) r.claimed = true;
        return picked.map((r) => ({ ...r }));
      },
      releaseRows: async () => {},
      countQueued: async () => rows.filter((r) => r.status === "queued").length,
      recompute: async () => {},
      markStatus: async (_id: string, _w: string, status: Campaign["status"]) => {
        campaign.status = status;
      },
      send: async (row: CampaignMessageRow) => {
        const r = rows.find((x) => x.id === row.id);
        if (r) r.status = "sent";
        return "sent" as const;
      },
      reinvoke: async () => {
        reinvokes++;
      },
    };
    const outcome = await processCampaignChunk(token(1), deps);
    expect(outcome.processed).toBe(5);
    expect(reinvokes).toBe(1);
  });
});
