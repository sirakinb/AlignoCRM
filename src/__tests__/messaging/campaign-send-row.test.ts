import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");
process.env.MESSAGING_PUBLIC_BASE_URL = "https://app.example";

const H = vi.hoisted(() => ({
  results: [] as Array<{ data?: unknown; error?: unknown }>,
  from: vi.fn(),
}));

const METHODS = ["select", "insert", "update", "eq", "in", "not", "order", "limit", "single", "is"];
function makeQuery() {
  const result = H.results.shift() ?? { data: null, error: null };
  const q: Record<string, unknown> = {};
  for (const m of METHODS) q[m] = vi.fn(() => q);
  (q as { single: unknown }).single = vi.fn().mockResolvedValue(result);
  (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.from } },
}));

import { sendCampaignMessageRow, type CampaignMessageRow } from "@/lib/messaging/send-message";
import { setConversationEmailProvider } from "@/lib/messaging/conversation-email";
import { setSmsProvider } from "@/lib/messaging/sms-service";

function queue(...rs: Array<{ data?: unknown; error?: unknown }>) {
  H.results.push(...rs);
}

let emailSends: any[];
let smsSends: any[];

beforeEach(() => {
  vi.clearAllMocks();
  H.results.length = 0;
  H.from.mockImplementation(() => makeQuery());
  emailSends = [];
  smsSends = [];
  setConversationEmailProvider({
    async send(input) {
      emailSends.push(input);
      return { id: "re_123", success: true };
    },
  });
  setSmsProvider({
    async send(input) {
      smsSends.push(input);
      return { id: "SM_123", success: true };
    },
  });
});

const emailRow: CampaignMessageRow = {
  id: "m1",
  workspace_id: "ws-a",
  contact_id: "k1",
  channel: "email",
  subject: "Hello",
  body_text: null,
  body_html: "<p>Hi</p>",
  to_address: "bob@x.com",
  campaign_id: "c1",
};

describe("sendCampaignMessageRow — suppression gate (REQ-SEC-19)", () => {
  it("blocks a suppressed campaign recipient without a provider call", async () => {
    queue(
      { data: [{ reason: "unsubscribe" }] }, // findSuppression hit
      { data: null } // markFailed update
    );
    const status = await sendCampaignMessageRow(emailRow);
    expect(status).toBe("failed");
    expect(emailSends.length).toBe(0);
  });
});

describe("sendCampaignMessageRow — email compliance headers (P4-23)", () => {
  it("sets List-Unsubscribe + List-Unsubscribe-Post and a per-conversation Reply-To", async () => {
    queue(
      { data: [] }, // findSuppression: none
      { data: [{ id: "conv1", reply_token: "TOKEN123" }] }, // ensureConversation existing
      { data: [] }, // getDefaultEmailConnection (no active default)
      { data: [{ config: { from_name: "Aligno", from_local_part: "team" } }] }, // channel config
      { data: null } // markSent
    );
    const status = await sendCampaignMessageRow(emailRow);
    expect(status).toBe("sent");
    expect(emailSends.length).toBe(1);
    const sent = emailSends[0];
    expect(sent.extraHeaders["List-Unsubscribe"]).toMatch(/^<https:\/\/app\.example\/api\/unsubscribe\//);
    expect(sent.extraHeaders["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // Reply-To carries a friendly display name AND a pretty workspace alias
    // (inbound routes alias → workspace, sender → contact); the r+token form
    // is only the fallback when no alias can be assigned.
    expect(sent.replyTo).toBe('"Aligno" <aligno@reply.alignocrm.com>');
    // Display name is QUOTED (Gate-4 #3) so a comma/colon in from_name can't
    // smuggle a second address.
    expect(sent.from).toBe('"Aligno" <team@send.alignocrm.com>');
  });

  it("quotes the display name so a comma can't smuggle an address (Gate-4 #3)", async () => {
    queue(
      { data: [] },
      { data: [{ id: "conv1", reply_token: "TOK" }] }, // ensureConversation existing
      { data: [] }, // getDefaultEmailConnection (no active default)
      { data: [{ config: { from_name: "Aligno, billing@chase.com", from_local_part: "team" } }] },
      { data: null }
    );
    await sendCampaignMessageRow(emailRow);
    const from = emailSends[0].from as string;
    // The whole (comma-containing) display name sits inside one quoted string;
    // the only real address is our own local@domain.
    expect(from).toBe('"Aligno, billing@chase.com" <team@send.alignocrm.com>');
    expect(from.indexOf("<")).toBe(from.lastIndexOf("<")); // exactly one address
  });
});

describe("sendCampaignMessageRow — SMS path", () => {
  it("sends via the SMS provider and marks sent (no unsubscribe headers)", async () => {
    const smsRow: CampaignMessageRow = {
      ...emailRow,
      id: "m2",
      channel: "sms",
      subject: null,
      body_text: "hi there",
      body_html: null,
      to_address: "+15551234567",
    };
    queue(
      { data: [] }, // findSuppression: none
      { data: null } // markSent
    );
    const status = await sendCampaignMessageRow(smsRow);
    expect(status).toBe("sent");
    expect(smsSends.length).toBe(1);
    expect(smsSends[0].to).toBe("+15551234567");
    expect(smsSends[0].body).toBe("hi there");
  });
});
