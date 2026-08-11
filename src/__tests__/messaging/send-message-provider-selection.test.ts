import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.from(
  "a".repeat(32),
  "utf8"
).toString("base64");

const H = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  results: [] as Array<{ data?: unknown; count?: number; error?: unknown }>,
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  defaultConnection: null as import("@/lib/messaging/email-connections").EmailConnection | null,
  mockProviderSend: vi.fn(),
  resendSend: vi.fn(),
}));

const METHODS = [
  "select", "eq", "not", "gt", "in", "order", "limit", "range",
  "update", "insert", "delete", "single", "upsert",
];

function makeQuery(table: string) {
  const result = H.results.shift() ?? { data: [], error: null };
  let isUpdate = false;
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = vi.fn((...args: unknown[]) => {
      if (m === "insert") {
        H.inserts.push({ table, payload: args[0] as Record<string, unknown> });
      }
      if (m === "update") isUpdate = true;
      return q;
    });
  }
  (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.mockFrom } },
}));
vi.mock("@/lib/messaging/suppressions", () => ({
  findSuppression: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/messaging/email-connections", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messaging/email-connections")>(
    "@/lib/messaging/email-connections"
  );
  return {
    ...actual,
    getDefaultEmailConnection: vi.fn(() => Promise.resolve(H.defaultConnection)),
  };
});
vi.mock("@/lib/messaging/email-providers", () => ({
  getEmailProviderForConnection: vi.fn(() => ({
    send: H.mockProviderSend,
  })),
}));

import { sendConversationMessage } from "@/lib/messaging/send-message";
import { setConversationEmailProvider } from "@/lib/messaging/conversation-email";
import { getDefaultEmailConnection } from "@/lib/messaging/email-connections";
import { getEmailProviderForConnection } from "@/lib/messaging/email-providers";

function makeConnection(
  provider: "google" | "microsoft"
): import("@/lib/messaging/email-connections").EmailConnection {
  return {
    id: "conn-1",
    workspace_id: "ws-1",
    organization_id: null,
    provider,
    email: provider === "google" ? "user@gmail.com" : "user@outlook.com",
    display_name: "User",
    signature: null,
    access_token: "access-123",
    refresh_token: "refresh-123",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scopes: [],
    status: "active",
    is_default: true,
    last_sync_at: null,
    sync_history_id: null,
    created_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.results.length = 0;
  H.inserts.length = 0;
  H.defaultConnection = null;
  H.mockProviderSend.mockResolvedValue({ id: "conn-msg-1", success: true });
  H.resendSend.mockResolvedValue({ id: "resend-msg-1", success: true });
  H.mockFrom.mockImplementation((t: string) => makeQuery(t));
  setConversationEmailProvider({
    send: H.resendSend,
  });
});

describe("sendConversationMessage — provider selection", () => {
  it("uses the connected Gmail provider when a default active connection exists", async () => {
    H.defaultConnection = makeConnection("google");
    H.results.push(
      { data: { id: "k1", workspace_id: "ws-1", email: "bob@x.com", phone: null, first_name: "Bob", last_name: "Lee" } },
      { data: [{ id: "c1", reply_token: "tok", subject: null }] },
      { data: { id: "m1" } },
      { data: [] },
      { error: null },
      { error: null },
      { data: { id: "m1", body_html: "x" } }
    );

    await sendConversationMessage({
      workspaceId: "ws-1",
      contactId: "k1",
      channel: "email",
      subject: "Hi",
      body: "Hello",
    });

    expect(getDefaultEmailConnection).toHaveBeenCalledWith("ws-1");
    expect(getEmailProviderForConnection).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", email: "user@gmail.com" })
    );
    expect(H.mockProviderSend).toHaveBeenCalledTimes(1);
    expect(H.resendSend).not.toHaveBeenCalled();

    const call = H.mockProviderSend.mock.calls[0][0];
    expect(call.from).toBe('"User" <user@gmail.com>');
    expect(call.replyTo).toBe('"User" <user@reply.alignocrm.com>');
  });

  it("falls back to the Resend provider when no default connection exists", async () => {
    H.defaultConnection = null;
    H.results.push(
      { data: { id: "k1", workspace_id: "ws-1", email: "bob@x.com", phone: null, first_name: "Bob", last_name: "Lee" } },
      { data: [{ id: "c1", reply_token: "tok", subject: null }] },
      { data: { id: "m1" } },
      { data: [{ config: { from_name: "Aki", from_local_part: "team" } }] },
      { data: [] },
      { error: null },
      { error: null },
      { data: { id: "m1", body_html: "x" } }
    );

    await sendConversationMessage({
      workspaceId: "ws-1",
      contactId: "k1",
      channel: "email",
      subject: "Hi",
      body: "Hello",
    });

    expect(getDefaultEmailConnection).toHaveBeenCalledWith("ws-1");
    expect(H.resendSend).toHaveBeenCalledTimes(1);
    expect(H.mockProviderSend).not.toHaveBeenCalled();

    const call = H.resendSend.mock.calls[0][0];
    expect(call.from).toContain("@send.alignocrm.com");
    expect(call.replyTo).toBe('"Aki" <aki@reply.alignocrm.com>');
  });

  it("does not use an expired connection and falls back to Resend", async () => {
    H.defaultConnection = { ...makeConnection("google"), status: "expired" };
    H.results.push(
      { data: { id: "k1", workspace_id: "ws-1", email: "bob@x.com", phone: null, first_name: "Bob", last_name: "Lee" } },
      { data: [{ id: "c1", reply_token: "tok", subject: null }] },
      { data: { id: "m1" } },
      { data: [{ config: { from_name: "Aki", from_local_part: "team" } }] },
      { data: [] },
      { error: null },
      { error: null },
      { data: { id: "m1", body_html: "x" } }
    );

    await sendConversationMessage({
      workspaceId: "ws-1",
      contactId: "k1",
      channel: "email",
      subject: "Hi",
      body: "Hello",
    });

    expect(H.resendSend).toHaveBeenCalledTimes(1);
    expect(H.mockProviderSend).not.toHaveBeenCalled();
  });
});
