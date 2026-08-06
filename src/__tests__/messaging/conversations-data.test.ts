import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  findSuppression: vi.fn(),
  ensureConversation: vi.fn(),
  // per-query result queue + a log of every builder method call
  results: [] as Array<{ data?: unknown; count?: number; error?: unknown }>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

const METHODS = [
  "select", "eq", "not", "gt", "in", "order", "limit", "range",
  "update", "insert", "delete", "single",
];

function makeQuery(table: string) {
  const result = H.results.shift() ?? { data: [], error: null };
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = vi.fn((...args: unknown[]) => {
      H.calls.push({ table, method: m, args });
      return q;
    });
  }
  // Thenable: awaiting any chain resolves to this query's queued result.
  (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

// The data layer marks itself server-only; neutralize that guard under vitest.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.mockFrom } },
}));
vi.mock("@/lib/messaging/suppressions", () => ({
  findSuppression: H.findSuppression,
}));
vi.mock("@/lib/messaging/send-message", () => ({
  ensureConversation: H.ensureConversation,
}));

import {
  listConversations,
  countUnreadConversations,
  markConversationRead,
  getConversationDetail,
  resolveConversationForContact,
} from "@/lib/data/conversations";

function queue(...rs: Array<{ data?: unknown; count?: number; error?: unknown }>) {
  H.results.push(...rs);
}
function callArgs(table: string, method: string) {
  return H.calls.filter((c) => c.table === table && c.method === method).map((c) => c.args);
}

beforeEach(() => {
  vi.clearAllMocks();
  H.results.length = 0;
  H.calls.length = 0;
  H.mockFrom.mockImplementation((t: string) => makeQuery(t));
  H.findSuppression.mockResolvedValue(null);
});

describe("listConversations", () => {
  it("hides token-holder rows (filters last_message_at IS NOT NULL) and applies channel/unread filters", async () => {
    queue(
      { data: [{ id: "c1", contact_id: "k1", last_message_channel: "email", unread_count: 2 }] },
      { data: [{ id: "k1", first_name: "Bob", last_name: "Lee", email: "bob@x.com", phone: null }] }
    );
    await listConversations("ws-a", { channel: "email", unread: true });

    expect(callArgs("conversations", "not")).toContainEqual(["last_message_at", "is", null]);
    expect(callArgs("conversations", "eq")).toContainEqual(["workspace_id", "ws-a"]);
    expect(callArgs("conversations", "eq")).toContainEqual(["last_message_channel", "email"]);
    expect(callArgs("conversations", "gt")).toContainEqual(["unread_count", 0]);
  });

  it("search matches contact name/email/phone/preview only (A-10)", async () => {
    queue(
      {
        data: [
          { id: "c1", contact_id: "k1", last_message_preview: "hello", unread_count: 0 },
          { id: "c2", contact_id: "k2", last_message_preview: "nope", unread_count: 0 },
        ],
      },
      {
        data: [
          { id: "k1", first_name: "Bob", last_name: "Lee", email: "bob@x.com", phone: null },
          { id: "k2", first_name: "Zed", last_name: "Ray", email: "zed@x.com", phone: null },
        ],
      }
    );
    const result = await listConversations("ws-a", { q: "bob" });
    expect(result).toHaveLength(1);
    expect(result[0].contact_id).toBe("k1");
  });
});

describe("countUnreadConversations", () => {
  it("returns a conversation count for unread_count > 0", async () => {
    queue({ count: 3, error: null });
    const n = await countUnreadConversations("ws-a");
    expect(n).toBe(3);
    expect(callArgs("conversations", "gt")).toContainEqual(["unread_count", 0]);
  });
});

describe("markConversationRead", () => {
  it("returns false for a cross-workspace id and does not update", async () => {
    queue({ data: [], error: null }); // fetch-by-id-AND-workspace → empty
    const ok = await markConversationRead("ws-a", "conv-other");
    expect(ok).toBe(false);
    expect(callArgs("conversations", "update")).toHaveLength(0);
  });

  it("returns true and zeroes unread for an owned id", async () => {
    queue({ data: [{ id: "c1" }], error: null }, { error: null });
    const ok = await markConversationRead("ws-a", "c1");
    expect(ok).toBe(true);
    expect(callArgs("conversations", "update")).toContainEqual([
      expect.objectContaining({ unread_count: 0 }),
    ]);
  });
});

describe("getConversationDetail", () => {
  it("returns null for a cross-workspace id", async () => {
    queue({ data: [], error: null });
    const detail = await getConversationDetail("ws-a", "conv-other");
    expect(detail).toBeNull();
  });

  it("computes channel availability and returns messages", async () => {
    queue(
      { data: [{ id: "c1", contact_id: "k1", reply_token: "t", unread_count: 0 }] },
      { data: [{ id: "k1", first_name: "Bob", last_name: "Lee", email: "bob@x.com", phone: "+15551234567" }] },
      { data: [{ id: "m1", channel: "email", direction: "inbound" }] }
    );
    const detail = await getConversationDetail("ws-a", "c1");
    expect(detail).not.toBeNull();
    expect(detail!.channels.email.enabled).toBe(true);
    expect(detail!.channels.sms.enabled).toBe(true);
    expect(detail!.messages).toHaveLength(1);
  });

  it("disables email on a bounce but keeps sms enabled", async () => {
    queue(
      { data: [{ id: "c1", contact_id: "k1", reply_token: "t", unread_count: 0 }] },
      { data: [{ id: "k1", first_name: "Bob", last_name: "Lee", email: "bob@x.com", phone: "+15551234567" }] },
      { data: [] }
    );
    H.findSuppression.mockImplementation(async (_ws: string, channel: string) =>
      channel === "email" ? { reason: "bounce" } : null
    );
    const detail = await getConversationDetail("ws-a", "c1");
    expect(detail!.channels.email.enabled).toBe(false);
    expect(detail!.channels.email.disabledReason).toBeTruthy();
    expect(detail!.channels.sms.enabled).toBe(true);
  });

  it("enables email but warns on an unsubscribe (1:1 allowed, P1-29)", async () => {
    queue(
      { data: [{ id: "c1", contact_id: "k1", reply_token: "t", unread_count: 0 }] },
      { data: [{ id: "k1", first_name: "Bob", last_name: "Lee", email: "bob@x.com", phone: null }] },
      { data: [] }
    );
    H.findSuppression.mockImplementation(async (_ws: string, channel: string) =>
      channel === "email" ? { reason: "unsubscribe" } : null
    );
    const detail = await getConversationDetail("ws-a", "c1");
    expect(detail!.channels.email.enabled).toBe(true);
    expect(detail!.channels.email.warning).toBeTruthy();
    expect(detail!.channels.sms.enabled).toBe(false); // no phone
  });
});

describe("resolveConversationForContact", () => {
  it("returns null (no create) for a foreign contact id", async () => {
    queue({ data: [], error: null }); // contact not in workspace
    const id = await resolveConversationForContact("ws-a", "contact-other");
    expect(id).toBeNull();
    expect(H.ensureConversation).not.toHaveBeenCalled();
  });

  it("find-or-creates the conversation for an owned contact", async () => {
    queue({ data: [{ id: "contact-1" }], error: null });
    H.ensureConversation.mockResolvedValue({ id: "conv-x" });
    const id = await resolveConversationForContact("ws-a", "contact-1");
    expect(id).toBe("conv-x");
    expect(H.ensureConversation).toHaveBeenCalledWith("ws-a", "contact-1");
  });
});
