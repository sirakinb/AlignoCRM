import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  results: [] as Array<{ data?: unknown; error?: unknown }>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

const METHODS = ["select", "eq", "in", "not", "gt", "order", "limit", "range", "is"];

function makeQuery(table: string) {
  const result = H.results.shift() ?? { data: [], error: null };
  const q: Record<string, unknown> = {};
  for (const m of METHODS) {
    q[m] = vi.fn((...args: unknown[]) => {
      H.calls.push({ table, method: m, args });
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

import {
  resolveAudienceContacts,
  classifyAudience,
  validateAudience,
  previewAudience,
  AudienceError,
} from "@/lib/messaging/campaign-audience";

function queue(...rs: Array<{ data?: unknown; error?: unknown }>) {
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
});

describe("validateAudience (A-12b)", () => {
  it("rejects all:true combined with tagIds", () => {
    expect(() => validateAudience({ all: true, tagIds: ["t1"] })).toThrow(AudienceError);
  });
  it("rejects all:true combined with statuses", () => {
    expect(() => validateAudience({ all: true, statuses: ["active"] })).toThrow(AudienceError);
  });
  it("rejects an empty selector", () => {
    expect(() => validateAudience({})).toThrow(AudienceError);
  });
  it("accepts all:true alone", () => {
    expect(validateAudience({ all: true }).all).toBe(true);
  });
  it("caps tagIds at 100", () => {
    const many = Array.from({ length: 101 }, (_, i) => `t${i}`);
    expect(() => validateAudience({ tagIds: many })).toThrow(AudienceError);
  });
});

describe("resolveAudienceContacts — cross-tenant tag rejection (REQ-SEC-15.5)", () => {
  it("rejects a tagId that does not belong to the workspace", async () => {
    // tags ownership check returns no owned rows → the requested tag is foreign.
    queue({ data: [] });
    await expect(
      resolveAudienceContacts("ws-a", { tagIds: ["t-foreign"] })
    ).rejects.toThrow(AudienceError);
    // Must reject BEFORE resolving any contacts — only the tags table was queried.
    expect(H.calls.some((c) => c.table === "contacts")).toBe(false);
    expect(H.calls.some((c) => c.table === "contact_tags")).toBe(false);
  });

  it("re-validates every tag; a mix of owned+foreign still rejects", async () => {
    queue({ data: [{ id: "t1" }] }); // only t1 owned; t2 foreign
    await expect(
      resolveAudienceContacts("ws-a", { tagIds: ["t1", "t2"] })
    ).rejects.toThrow(AudienceError);
  });
});

describe("resolveAudienceContacts — A-12 semantics", () => {
  it("tag UNION dedupes a contact carrying two selected tags (P4-09)", async () => {
    queue(
      { data: [{ id: "t1" }, { id: "t2" }] }, // both tags owned
      { data: [{ contact_id: "c1" }, { contact_id: "c2" }, { contact_id: "c1" }] },
      { data: [
        { id: "c1", first_name: "A", email: "a@x.com" },
        { id: "c2", first_name: "B", email: "b@x.com" },
      ] }
    );
    const contacts = await resolveAudienceContacts("ws-a", { tagIds: ["t1", "t2"] });
    expect(contacts.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("tagIds × statuses applies BOTH filters (intersection across dimensions)", async () => {
    queue(
      { data: [{ id: "t1" }] },
      { data: [{ contact_id: "c1" }, { contact_id: "c2" }] },
      { data: [{ id: "c1", status: "active", email: "a@x.com" }] }
    );
    await resolveAudienceContacts("ws-a", { tagIds: ["t1"], statuses: ["active"] });
    // both an id filter (from the tag dimension) and a status filter were applied
    expect(callArgs("contacts", "in")).toContainEqual(["status", ["active"]]);
    expect(callArgs("contacts", "in").some((a) => a[0] === "id")).toBe(true);
    expect(callArgs("contacts", "eq")).toContainEqual(["workspace_id", "ws-a"]);
  });

  it("all:true loads workspace contacts with no tag/status filter", async () => {
    queue({ data: [{ id: "c1", email: "a@x.com" }] });
    await resolveAudienceContacts("ws-a", { all: true });
    expect(callArgs("contacts", "eq")).toContainEqual(["workspace_id", "ws-a"]);
    expect(callArgs("contacts", "in").length).toBe(0);
  });

  it("returns [] when no contact carries any selected tag", async () => {
    queue({ data: [{ id: "t1" }] }, { data: [] });
    const contacts = await resolveAudienceContacts("ws-a", { tagIds: ["t1"] });
    expect(contacts).toEqual([]);
  });
});

describe("classifyAudience — split counters (A-14, P4-10)", () => {
  const contacts = [
    { id: "c1", first_name: "A", last_name: null, email: "ok@x.com", phone: null, company: null, status: "active" },
    { id: "c2", first_name: "B", last_name: null, email: "stop@x.com", phone: null, company: null, status: "active" },
    { id: "c3", first_name: "C", last_name: null, email: null, phone: null, company: null, status: "active" },
  ];

  it("splits suppressed vs no-address into separate counters", async () => {
    queue({ data: [{ address: "stop@x.com" }] }); // suppressions for email
    const c = await classifyAudience("ws-a", "email", contacts);
    expect(c.totalCount).toBe(1); // only ok@x.com is sendable
    expect(c.suppressedCount).toBe(1); // stop@x.com
    expect(c.noAddressCount).toBe(1); // c3 has no email
    expect(c.sendable.map((x) => x.id)).toEqual(["c1"]);
  });

  it("E.164-normalizes a raw phone before matching an SMS suppression (P1-31)", async () => {
    queue({ data: [{ address: "+14155552671" }] }); // stored E.164 suppression
    const c = await classifyAudience("ws-a", "sms", [
      { id: "c1", first_name: "A", last_name: null, email: null, phone: "(415) 555-2671", company: null, status: "active" },
      { id: "c2", first_name: "B", last_name: null, email: null, phone: "not-a-phone", company: null, status: "active" },
    ]);
    expect(c.suppressedCount).toBe(1); // raw-format phone matched the E.164 row
    expect(c.noAddressCount).toBe(1); // unparseable phone is an address problem
    expect(c.totalCount).toBe(0);
  });

  it("normalizes email case when matching suppressions", async () => {
    queue({ data: [{ address: "ok@x.com" }] });
    const c = await classifyAudience("ws-a", "email", [
      { ...contacts[0], email: "OK@X.CoM" },
    ]);
    expect(c.suppressedCount).toBe(1);
    expect(c.totalCount).toBe(0);
  });
});

describe("previewAudience shares the resolver path (P4-11)", () => {
  it("returns total/suppressed/no_address that reconcile with the audience", async () => {
    queue(
      { data: [{ id: "c1", email: "a@x.com" }, { id: "c2", email: null }] }, // all → contacts
      { data: [] } // suppressions
    );
    const counts = await previewAudience("ws-a", "email", { all: true });
    expect(counts.audienceCount).toBe(2);
    expect(counts.totalCount).toBe(1);
    expect(counts.noAddressCount).toBe(1);
    expect(counts.suppressedCount).toBe(0);
    expect(counts.totalCount + counts.suppressedCount + counts.noAddressCount).toBe(
      counts.audienceCount
    );
  });
});
