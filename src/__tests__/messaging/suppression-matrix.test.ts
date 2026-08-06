import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P5-14 — the suppression asymmetry matrix, exercised through the transport layer
 * itself (§1.5, P1-28..P1-30). The block/warn DECISION lives in send-message.ts,
 * not in suppressions.ts, so it must be tested where it is made: driving
 * sendConversationMessage() (the 1:1 path) and sendCampaignMessageRow() (the bulk
 * path) with findSuppression mocked to each (channel, reason) and asserting
 * whether a provider call happens.
 *
 * The single most important row is bounce-blocks-1:1 (P1-30): the one case where
 * email behaves like SMS. It is asserted on its own so a regression that collapses
 * it back into the unsubscribe/complaint warn-allow branch is caught.
 */

const H = vi.hoisted(() => ({
  from: vi.fn(),
  findSuppression: vi.fn(),
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

// A table-dispatch DB mock: every chain method returns the chain; `.single()`
// resolves a per-table row and the chain itself is thenable to a per-table list.
// This is order-independent, unlike a results queue, so the matrix cases don't
// have to each re-declare the exact call sequence.
function tableMock(table: string) {
  const singleData: Record<string, unknown> = {
    contacts: {
      id: "k1",
      workspace_id: "ws-1",
      email: "bob@x.com",
      phone: "+13105551234",
      first_name: "Bob",
      last_name: "Lee",
    },
    conversations: { id: "c1", reply_token: "tok", subject: null },
    messages: { id: "m1" },
  };
  const listData: Record<string, unknown[]> = {
    conversations: [{ id: "c1", reply_token: "tok", subject: null }],
    workspace_channels: [{ config: { from_name: "Aki", from_local_part: "team" } }],
    messages: [],
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "limit", "update", "delete", "upsert"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.insert = vi.fn((payload: Record<string, unknown>) => {
    H.inserts.push({ table, payload });
    return chain;
  });
  chain.single = vi.fn(async () => ({ data: singleData[table] ?? null, error: null }));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: listData[table] ?? [], error: null });
  return chain;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.from } },
}));
vi.mock("@/lib/messaging/suppressions", () => ({
  findSuppression: H.findSuppression,
  normalizeSuppressionAddress: (c: string, a: string) =>
    c === "email" ? a.trim().toLowerCase() : a.trim(),
}));

import {
  sendConversationMessage,
  sendCampaignMessageRow,
  SendMessageError,
  type CampaignMessageRow,
} from "@/lib/messaging/send-message";
import { setConversationEmailProvider } from "@/lib/messaging/conversation-email";
import { setSmsProvider } from "@/lib/messaging/sms-service";

const emailSend = vi.fn(async () => ({ id: "re_1", success: true }));
const smsSend = vi.fn(async () => ({ id: "SM1", success: true }));

beforeEach(() => {
  vi.clearAllMocks();
  H.inserts.length = 0;
  H.from.mockImplementation((t: string) => tableMock(t));
  H.findSuppression.mockResolvedValue(null);
  setConversationEmailProvider({ send: emailSend });
  setSmsProvider({ send: smsSend });
});

// ── 1:1 path (sendConversationMessage) ────────────────────────────────────────

describe("suppression matrix — 1:1 send path (P1-28/29/30)", () => {
  async function send1to1(channel: "email" | "sms") {
    return sendConversationMessage({
      workspaceId: "ws-1",
      contactId: "k1",
      channel,
      subject: channel === "email" ? "Hi" : undefined,
      body: "hello",
    });
  }

  it("SMS stop → BLOCKED on 1:1, no provider call, failed audit row (P1-28)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "stop" });
    await expect(send1to1("sms")).rejects.toMatchObject({ code: "suppressed" });
    expect(smsSend).not.toHaveBeenCalled();
    const failed = H.inserts.find(
      (i) => i.table === "messages" && i.payload.status === "failed"
    );
    expect(failed?.payload.error).toBe("suppressed:stop");
  });

  it("email bounce → BLOCKED on 1:1, no provider call (P1-30, the distinct case)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "bounce" });
    await expect(send1to1("email")).rejects.toBeInstanceOf(SendMessageError);
    expect(emailSend).not.toHaveBeenCalled();
    const failed = H.inserts.find(
      (i) => i.table === "messages" && i.payload.status === "failed"
    );
    expect(failed?.payload.error).toBe("suppressed:bounce");
  });

  it("email manual → BLOCKED on 1:1, no provider call (matrix)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "manual" });
    await expect(send1to1("email")).rejects.toBeInstanceOf(SendMessageError);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("email unsubscribe → ALLOWED on 1:1 (warn-allow), provider IS called (P1-29)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "unsubscribe" });
    await send1to1("email");
    expect(emailSend).toHaveBeenCalledTimes(1);
    // no failed audit row was written — the send proceeded
    expect(
      H.inserts.some((i) => i.table === "messages" && i.payload.status === "failed")
    ).toBe(false);
  });

  it("email complaint → ALLOWED on 1:1 (warn-allow), provider IS called (P1-29)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "complaint" });
    await send1to1("email");
    expect(emailSend).toHaveBeenCalledTimes(1);
  });
});

// ── campaign path (sendCampaignMessageRow) ────────────────────────────────────

describe("suppression matrix — campaign send path (P1-28/29/30 campaign column)", () => {
  function campaignRow(channel: "email" | "sms"): CampaignMessageRow {
    return {
      id: "row1",
      workspace_id: "ws-1",
      contact_id: "k1",
      channel,
      subject: channel === "email" ? "Promo" : null,
      body_text: "hi",
      body_html: "<p>hi</p>",
      to_address: channel === "email" ? "bob@x.com" : "+13105551234",
      campaign_id: "camp1",
    };
  }

  it.each([
    ["email", "unsubscribe"],
    ["email", "complaint"],
    ["email", "bounce"],
    ["email", "manual"],
    ["sms", "stop"],
  ] as const)(
    "%s %s → campaign row marked failed, no provider call",
    async (channel, reason) => {
      H.findSuppression.mockResolvedValue({ reason });
      const status = await sendCampaignMessageRow(campaignRow(channel));
      expect(status).toBe("failed");
      expect(emailSend).not.toHaveBeenCalled();
      expect(smsSend).not.toHaveBeenCalled();
    }
  );

  it("no suppression → campaign email sends", async () => {
    H.findSuppression.mockResolvedValue(null);
    const status = await sendCampaignMessageRow(campaignRow("email"));
    expect(status).toBe("sent");
    expect(emailSend).toHaveBeenCalledTimes(1);
  });
});
