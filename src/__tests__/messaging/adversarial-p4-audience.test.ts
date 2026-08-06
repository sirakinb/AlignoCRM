import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adversarial QA — Phase 4 campaign audience cross-tenant isolation
 * (REQ-SEC-15.5). The lead's top-priority attack: an audience whose tagIds
 * include a tag from another workspace must be rejected BEFORE any contact read,
 * and no foreign contact may ever reach the recipient set.
 */

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

import { resolveAudienceContacts, AudienceError } from "@/lib/messaging/campaign-audience";

function queue(...rs: Array<{ data?: unknown; error?: unknown }>) {
  H.results.push(...rs);
}
function tablesTouched() {
  return new Set(H.calls.map((c) => c.table));
}

beforeEach(() => {
  vi.clearAllMocks();
  H.results.length = 0;
  H.calls.length = 0;
  H.mockFrom.mockImplementation((t: string) => makeQuery(t));
});

describe("audience cross-tenant tag rejection ordering (REQ-SEC-15.5)", () => {
  it("a mix of owned + foreign tags rejects before ANY contact_tags/contacts read", async () => {
    // Ownership check: only t1 is owned (t2 belongs to another workspace).
    queue({ data: [{ id: "t1" }] });
    await expect(
      resolveAudienceContacts("ws-a", { tagIds: ["t1", "t2"] })
    ).rejects.toThrow(AudienceError);
    // The foreign tag must be caught before we touch contact_tags or contacts —
    // otherwise a foreign tag's contacts are enumerated (exfiltration + delivery).
    const touched = tablesTouched();
    expect(touched.has("contact_tags")).toBe(false);
    expect(touched.has("contacts")).toBe(false);
    expect(touched.has("tags")).toBe(true);
  });

  it("defense in depth: a foreign contact linked to an OWNED tag is dropped by the workspace-scoped contacts query", async () => {
    // t1 is owned. contact_tags returns a link to a contact in ANOTHER workspace
    // (cFOREIGN) alongside an owned one (c1). The workspace-scoped contacts query
    // returns only c1 — cFOREIGN must never appear in the recipient set.
    queue(
      { data: [{ id: "t1" }] }, // owned tags
      { data: [{ contact_id: "c1" }, { contact_id: "cFOREIGN" }] }, // links
      { data: [{ id: "c1", first_name: "A", email: "a@x.com" }] } // ws-scoped contacts
    );
    const contacts = await resolveAudienceContacts("ws-a", { tagIds: ["t1"] });
    expect(contacts.map((c) => c.id)).toEqual(["c1"]);
    // And the contacts read was scoped to the caller's workspace.
    const wsFilter = H.calls.some(
      (c) => c.table === "contacts" && c.method === "eq" && c.args[0] === "workspace_id" && c.args[1] === "ws-a"
    );
    expect(wsFilter).toBe(true);
  });
});
