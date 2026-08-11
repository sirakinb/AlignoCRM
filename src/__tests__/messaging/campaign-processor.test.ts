import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

// The processor pulls in server-only data modules transitively; neutralize the
// guard and the DB client (all DB access is injected via deps in these tests).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: vi.fn() } },
}));

import { processCampaignChunk } from "@/lib/messaging/campaign-processor";
import { verifyJobToken } from "@/lib/messaging/token";
import type { CampaignMessageRow } from "@/lib/messaging/send-message";
import type { Campaign } from "@/types/messaging";

/**
 * A minimal in-memory campaign store that models the atomic-claim semantics the
 * real defaultClaimChunk relies on (Postgres row-lock + `status='queued' AND
 * provider_id IS NULL` guard): a claimed row is stamped and never handed to a
 * second claimer. This lets us unit-test the processor's control flow —
 * draining, resume, ceiling, concurrency, time-budget — without a database.
 */
function makeStore(opts: {
  status?: Campaign["status"];
  total: number;
  queued: number;
  terminalizeOnSend?: boolean;
}) {
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
    status: opts.status ?? "sending",
    scheduled_at: null,
    total_count: opts.total,
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
  // First (total - queued) rows are already sent (the resume scenario).
  const alreadySent = opts.total - opts.queued;
  for (let i = 0; i < opts.total; i++) {
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
      status: i < alreadySent ? "sent" : "queued",
      claimed: false,
    });
  }

  const sentIds: string[] = [];
  const terminalize = opts.terminalizeOnSend ?? true;

  return {
    campaign,
    rows,
    sentIds,
    deps: {
      loadCampaign: async () => campaign,
      claimChunk: async (_c: string, _w: string, limit: number) => {
        const picked = rows
          .filter((r) => r.status === "queued" && !r.claimed)
          .slice(0, limit);
        for (const r of picked) r.claimed = true;
        return picked.map((r) => ({ ...r }));
      },
      releaseRows: async (ids: string[]) => {
        for (const r of rows) if (ids.includes(r.id)) r.claimed = false;
      },
      countQueued: async () => rows.filter((r) => r.status === "queued").length,
      recompute: async () => {},
      markStatus: async (_id: string, _w: string, status: Campaign["status"]) => {
        campaign.status = status;
      },
      send: async (row: CampaignMessageRow) => {
        sentIds.push(row.id);
        if (terminalize) {
          const r = rows.find((x) => x.id === row.id);
          if (r) r.status = "sent";
        }
        return "sent" as const;
      },
    },
  };
}

function token(chunk: number) {
  return { campaignId: "c1", workspaceId: "ws-a", chunk, exp: Math.floor(Date.now() / 1000) + 600 };
}

beforeEach(() => {
  process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");
});

describe("processCampaignChunk — draining (P4-14)", () => {
  it("drains 250 rows in 100-sized chunks and marks the campaign sent", async () => {
    const store = makeStore({ total: 250, queued: 250 });
    let invocations = 0;
    const reinvoke = async (_c: string, tokenStr: string) => {
      invocations++;
      const t = verifyJobToken(tokenStr)!;
      await processCampaignChunk(t, { ...store.deps, reinvoke, chunkSize: 100 });
    };
    await processCampaignChunk(token(1), { ...store.deps, reinvoke, chunkSize: 100 });

    expect(store.sentIds.length).toBe(250);
    expect(new Set(store.sentIds).size).toBe(250); // no duplicate sends
    expect(store.campaign.status).toBe("sent");
  });
});

describe("processCampaignChunk — resume after crash (P4-15)", () => {
  it("sends only the still-queued rows, not the already-sent ones", async () => {
    const store = makeStore({ total: 100, queued: 60 });
    const reinvoke = async (_c: string, tokenStr: string) => {
      const t = verifyJobToken(tokenStr)!;
      await processCampaignChunk(t, { ...store.deps, reinvoke, chunkSize: 100 });
    };
    await processCampaignChunk(token(1), { ...store.deps, reinvoke, chunkSize: 100 });

    expect(store.sentIds.length).toBe(60); // the 40 already-sent are untouched
    expect(store.campaign.status).toBe("sent");
  });
});

describe("processCampaignChunk — double-send guard (P4-13 / REQ-SEC-16.4)", () => {
  it("no-ops when the campaign is no longer 'sending'", async () => {
    const store = makeStore({ total: 10, queued: 10, status: "sent" });
    const reinvoke = vi.fn();
    const outcome = await processCampaignChunk(token(1), { ...store.deps, reinvoke });
    expect(store.sentIds.length).toBe(0);
    expect(reinvoke).not.toHaveBeenCalled();
    expect(outcome.done).toBe(true);
  });

  it("rejects a token whose workspace does not match the campaign", async () => {
    const store = makeStore({ total: 10, queued: 10 });
    const reinvoke = vi.fn();
    const outcome = await processCampaignChunk(
      { campaignId: "c1", workspaceId: "ws-OTHER", chunk: 1, exp: Math.floor(Date.now() / 1000) + 600 },
      { ...store.deps, reinvoke }
    );
    expect(outcome.reason).toBe("not_found");
    expect(store.sentIds.length).toBe(0);
  });
});

describe("processCampaignChunk — iteration ceiling (P4-14b)", () => {
  it("stops after ceil(total/chunk)+5 and marks the campaign failed when rows never drain", async () => {
    // terminalizeOnSend:false → sent rows stay 'queued' forever (pathological).
    const store = makeStore({ total: 100, queued: 100, terminalizeOnSend: false });
    let invocations = 0;
    const reinvoke = async (_c: string, tokenStr: string) => {
      invocations++;
      if (invocations > 100) throw new Error("unbounded self-invocation");
      const t = verifyJobToken(tokenStr)!;
      await processCampaignChunk(t, { ...store.deps, reinvoke, chunkSize: 100 });
    };
    await processCampaignChunk(token(1), { ...store.deps, reinvoke, chunkSize: 100 });

    // ceil(100/100)+5 = 6 → chain terminates well under the 100 safety bound.
    expect(invocations).toBeLessThanOrEqual(10);
    expect(store.campaign.status).toBe("failed");
  });
});

describe("processCampaignChunk — concurrency (REQ-SEC-16.5)", () => {
  it("two invocations over the same queue send each row exactly once", async () => {
    const store = makeStore({ total: 10, queued: 10 });
    const noReinvoke = async () => {};
    // Two invocations, each one chunk of 5, sharing the store's atomic claim.
    await processCampaignChunk(token(1), { ...store.deps, reinvoke: noReinvoke, chunkSize: 5 });
    await processCampaignChunk(token(1), { ...store.deps, reinvoke: noReinvoke, chunkSize: 5 });

    expect(store.sentIds.length).toBe(10);
    expect(new Set(store.sentIds).size).toBe(10); // disjoint — no row sent twice
  });
});

describe("processCampaignChunk — time-budget yield (P4-14c)", () => {
  it("stops mid-chunk at the budget, releases the rest, and re-invokes", async () => {
    const store = makeStore({ total: 10, queued: 10 });
    const releaseSpy = vi.fn(store.deps.releaseRows);
    const reinvoke = vi.fn(async () => {});
    // now() sequence: start=0, first row check=0 (send), second row check=300000 (yield).
    const times = [0, 0, 300_000, 300_000, 300_000, 300_000];
    const now = () => (times.length > 1 ? times.shift()! : times[0]);

    const outcome = await processCampaignChunk(token(1), {
      ...store.deps,
      releaseRows: releaseSpy,
      reinvoke,
      now,
      chunkSize: 100,
      timeBudgetMs: 250_000,
    });

    expect(store.sentIds.length).toBe(1); // only one row sent before the budget
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy.mock.calls[0][0].length).toBe(9); // 9 remaining released
    expect(reinvoke).toHaveBeenCalledTimes(1); // successor scheduled
    expect(outcome.done).toBe(false);
  });
});
