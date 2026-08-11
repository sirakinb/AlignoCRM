import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.MESSAGING_TOKEN_SECRET = "test-secret-".padEnd(40, "x");

const H = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>[]>,
  setFields: vi.fn(),
  resolve: vi.fn(),
  classify: vi.fn(),
  unsubUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: {
    database: {
      from: (table: string) => ({
        insert: (rows: Record<string, unknown>[]) => {
          if (table === "messages") H.inserted.push(rows);
          return { then: (r: (v: unknown) => unknown) => r({ error: null }) };
        },
      }),
    },
  },
}));
vi.mock("@/lib/messaging/campaign-audience", () => ({
  resolveAudienceContacts: H.resolve,
  classifyAudience: H.classify,
}));
vi.mock("@/lib/data/campaigns", () => ({
  setCampaignFields: H.setFields,
  getCampaign: vi.fn(),
  recomputeCampaignCounters: vi.fn(),
}));
// Keep interpolation + escapeHtml REAL (this is what P4-17 exercises); only stub
// the URL builder so we don't need env plumbing here.
vi.mock("@/lib/messaging/send-message", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/lib/messaging/send-message"
  );
  return { ...actual, campaignUnsubUrl: H.unsubUrl };
});

import { materializeCampaign } from "@/lib/messaging/campaign-processor";
import type { Campaign } from "@/types/messaging";

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    workspace_id: "ws-a",
    organization_id: null,
    channel: "email",
    name: "T",
    subject: "Hi {{contact.first_name}}",
    body: "<p>Hello {{contact.first_name}}</p>",
    template_id: null,
    audience: { all: true },
    status: "draft",
    scheduled_at: null,
    total_count: 0,
    sent_count: 0,
    delivered_count: 0,
    failed_count: 0,
    suppressed_count: 0,
    no_address_count: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.inserted.length = 0;
  H.unsubUrl.mockReturnValue("https://app.example/api/unsubscribe/tok");
});

describe("materializeCampaign — merge-tag HTML escaping (P4-17)", () => {
  it("escapes a contact-controlled name into the stored body_html", async () => {
    H.resolve.mockResolvedValue([
      { id: "k1", first_name: "Bob <script>alert(1)</script>", email: "bob@x.com", phone: null, company: null, status: "active" },
    ]);
    H.classify.mockResolvedValue({
      sendable: [
        { id: "k1", first_name: "Bob <script>alert(1)</script>", email: "bob@x.com", phone: null, company: null, status: "active" },
      ],
      suppressedCount: 0,
      noAddressCount: 0,
      audienceCount: 1,
      totalCount: 1,
    });

    await materializeCampaign(campaign());

    const row = H.inserted[0][0];
    expect(row.body_html).toContain("&lt;script&gt;");
    expect(row.body_html).not.toContain("<script>alert");
    expect(row.conversation_id).toBeNull(); // P4-19
    expect(row.campaign_id).toBe("c1");
    expect(row.status).toBe("queued");
  });
});

describe("materializeCampaign — outbound body sanitization (Gate-4 #6)", () => {
  it("strips script/onerror from the author's campaign body before it ships", async () => {
    const evil = {
      id: "k1", first_name: "A", last_name: null, email: "a@x.com", phone: null, company: null, status: "active",
    };
    H.resolve.mockResolvedValue([evil]);
    H.classify.mockResolvedValue({
      sendable: [evil], suppressedCount: 0, noAddressCount: 0, audienceCount: 1, totalCount: 1,
    });

    await materializeCampaign(
      campaign({
        body: `<p>Hi {{contact.first_name}}</p><script>alert(1)</script><img src=x onerror="alert(2)">`,
      })
    );

    const row = H.inserted[0][0];
    const html = String(row.body_html);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<p>Hi A</p>"); // legitimate markup survives
  });
});

describe("materializeCampaign — split counters (A-14, P4-10)", () => {
  it("writes suppressed_count and no_address_count separately and total_count", async () => {
    const sendable = [
      { id: "k1", first_name: "A", last_name: null, email: "a@x.com", phone: null, company: null, status: "active" },
      { id: "k2", first_name: "B", last_name: null, email: "b@x.com", phone: null, company: null, status: "active" },
    ];
    H.resolve.mockResolvedValue([...sendable]);
    H.classify.mockResolvedValue({
      sendable,
      suppressedCount: 2,
      noAddressCount: 1,
      audienceCount: 5,
      totalCount: 2,
    });

    const result = await materializeCampaign(campaign());

    expect(result.totalCount).toBe(2);
    expect(result.suppressedCount).toBe(2);
    expect(result.noAddressCount).toBe(1);
    // reconciliation: total + suppressed + no_address == audience (P4-21)
    expect(result.totalCount + result.suppressedCount + result.noAddressCount).toBe(5);

    expect(H.setFields).toHaveBeenCalledWith("c1", "ws-a", expect.objectContaining({
      status: "sending",
      total_count: 2,
      suppressed_count: 2,
      no_address_count: 1,
    }));
  });

  it("enforces the recipient cap before inserting anything", async () => {
    const sendable = Array.from({ length: 3 }, (_, i) => ({
      id: `k${i}`, first_name: "X", last_name: null, email: `k${i}@x.com`, phone: null, company: null, status: "active",
    }));
    H.resolve.mockResolvedValue([...sendable]);
    H.classify.mockResolvedValue({
      sendable, suppressedCount: 0, noAddressCount: 0, audienceCount: 3, totalCount: 3,
    });
    await expect(materializeCampaign(campaign(), { maxRecipients: 2 })).rejects.toThrow();
    expect(H.inserted.length).toBe(0); // nothing materialized
  });
});
