import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  results: [] as Array<{ data?: unknown; count?: number; error?: unknown }>,
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  // eq args recorded on an UPDATE chain (to prove workspace-scoped writes)
  updateScopes: [] as Array<{ table: string; args: unknown[] }>,
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
      if (m === "eq" && isUpdate) H.updateScopes.push({ table, args });
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

import { sendConversationMessage } from "@/lib/messaging/send-message";
import { setConversationEmailProvider } from "@/lib/messaging/conversation-email";

let capturedHtml = "";

beforeEach(() => {
  vi.clearAllMocks();
  H.results.length = 0;
  H.inserts.length = 0;
  H.updateScopes.length = 0;
  H.mockFrom.mockImplementation((t: string) => makeQuery(t));
  capturedHtml = "";
  setConversationEmailProvider({
    send: async (input) => {
      capturedHtml = input.html;
      return { id: "re_1", success: true };
    },
  });
});

describe("sendConversationMessage — 1:1 email body rendering (MEDIUM #1)", () => {
  it("escapes plain-text body into HTML, keeps raw as body_text, and workspace-scopes the bump", async () => {
    // Queue results for each insforge.from() call, in order:
    H.results.push(
      { data: { id: "k1", workspace_id: "ws-1", email: "bob@x.com", phone: null, first_name: "Bob", last_name: "Lee" } }, // loadContact
      { data: [{ id: "c1", reply_token: "tok", subject: null }] }, // ensureConversation select
      { data: { id: "m1" } }, // queued messages insert → select().single()
      { data: [{ config: { from_name: "Aki", from_local_part: "team" } }] }, // loadChannelConfig
      { data: [] }, // lastInboundEmailId
      { error: null }, // markSent update
      { error: null }, // bumpConversation update
      { data: { id: "m1", body_html: "x" } } // final fresh read
    );

    await sendConversationMessage({
      workspaceId: "ws-1",
      contactId: "k1",
      channel: "email",
      subject: "Hi",
      body: "profit < cost\nline2",
    });

    const messageInsert = H.inserts.find((i) => i.table === "messages");
    expect(messageInsert).toBeTruthy();
    const html = messageInsert!.payload.body_html as string;
    expect(html).toContain("&lt;"); // "<" escaped, not raw markup
    expect(html).not.toContain("< cost"); // raw "<" gone
    expect(html).toContain("<br>"); // newline → <br>
    expect(messageInsert!.payload.body_text).toBe("profit < cost\nline2"); // raw retained

    // The provider received the escaped HTML, not the raw text.
    expect(capturedHtml).toContain("&lt;");
    expect(capturedHtml).toContain("<br>");

    // bumpConversation update is workspace-scoped (LOW #6).
    expect(H.updateScopes).toContainEqual({
      table: "conversations",
      args: ["workspace_id", "ws-1"],
    });
  });
});
