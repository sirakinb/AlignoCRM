import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adversarial hardening for the Phase-5 manual-block fix (P1-28..P1-30, REQ-SEC-19).
 *
 * The fix made a `manual` email suppression a HARD block on the 1:1 transport
 * path (send-message.ts), not just a UI-disabled composer. These cases attack the
 * fix from angles the base matrix test (suppression-matrix.test.ts) does not:
 *   1. the `manual` block writes a failed AUDIT row (not a silent vanish),
 *   2. the SMS `manual` cell — reachable because the CHECK allows manual on sms,
 *   3. evasion via the `bodyIsHtml` campaign-preview flag: a caller must not be
 *      able to slip past `manual`/`bounce` by pre-rendering the body,
 *   4. `bodyIsHtml` on a 1:1 send must NOT flip unsubscribe/complaint from
 *      warn-allow into blocked (i.e. it is not treated as a campaign).
 *
 * Mirrors the DB table-dispatch mock from suppression-matrix.test.ts so the
 * decision is exercised where it lives — in sendConversationMessage.
 */

const H = vi.hoisted(() => ({
  from: vi.fn(),
  findSuppression: vi.fn(),
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

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
  SendMessageError,
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

function failedAuditRow() {
  return H.inserts.find(
    (i) => i.table === "messages" && i.payload.status === "failed"
  );
}

describe("manual-block fix — adversarial (P1-28..P1-30, REQ-SEC-19)", () => {
  it("email manual on 1:1 → blocked AND writes a failed audit row (not a silent drop)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "manual" });
    await expect(
      sendConversationMessage({
        workspaceId: "ws-1",
        contactId: "k1",
        channel: "email",
        subject: "Hi",
        body: "hello",
      })
    ).rejects.toBeInstanceOf(SendMessageError);
    expect(emailSend).not.toHaveBeenCalled();
    expect(failedAuditRow()?.payload.error).toBe("suppressed:manual");
  });

  it("SMS manual on 1:1 → blocked (the sms×manual matrix cell)", async () => {
    H.findSuppression.mockResolvedValue({ reason: "manual" });
    await expect(
      sendConversationMessage({
        workspaceId: "ws-1",
        contactId: "k1",
        channel: "sms",
        body: "hello",
      })
    ).rejects.toMatchObject({ code: "suppressed" });
    expect(smsSend).not.toHaveBeenCalled();
    expect(failedAuditRow()?.payload.error).toBe("suppressed:manual");
  });

  it("bodyIsHtml pre-render flag does NOT let a 1:1 email evade a manual block", async () => {
    H.findSuppression.mockResolvedValue({ reason: "manual" });
    await expect(
      sendConversationMessage({
        workspaceId: "ws-1",
        contactId: "k1",
        channel: "email",
        subject: "Hi",
        body: "<p>hello</p>",
        bodyIsHtml: true,
      })
    ).rejects.toBeInstanceOf(SendMessageError);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("bodyIsHtml pre-render flag does NOT let a 1:1 email evade a bounce block", async () => {
    H.findSuppression.mockResolvedValue({ reason: "bounce" });
    await expect(
      sendConversationMessage({
        workspaceId: "ws-1",
        contactId: "k1",
        channel: "email",
        subject: "Hi",
        body: "<p>hello</p>",
        bodyIsHtml: true,
      })
    ).rejects.toBeInstanceOf(SendMessageError);
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("bodyIsHtml on a 1:1 email does NOT downgrade unsubscribe warn-allow into a block", async () => {
    H.findSuppression.mockResolvedValue({ reason: "unsubscribe" });
    const out = await sendConversationMessage({
      workspaceId: "ws-1",
      contactId: "k1",
      channel: "email",
      subject: "Hi",
      body: "<p>hello</p>",
      bodyIsHtml: true,
    });
    expect(out).toBeTruthy();
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(failedAuditRow()).toBeUndefined();
  });
});
