import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => {
  // Minimal chainable stub for insforge.database.from(...).select/insert chains.
  const state = {
    selectResults: [] as unknown[][],
    insertErrors: [] as (null | { message: string })[],
  };
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn(self);
    chain.limit = vi.fn(async () => ({ data: state.selectResults.shift() ?? [] }));
    chain.insert = vi.fn(async () => ({ error: state.insertErrors.shift() ?? null }));
    return chain;
  };
  return { db: { state, from: vi.fn(builder) } };
});

vi.mock("@/lib/insforge/server", () => ({ insforge: { database: db } }));

import {
  slugifyAlias,
  findWorkspaceByEmailAlias,
  ensureWorkspaceReplyAlias,
} from "@/lib/messaging/reply-alias";

describe("slugifyAlias", () => {
  it("slugifies a business name", () => {
    expect(slugifyAlias("Pentridge Media")).toBe("pentridge-media");
  });

  it("strips accents and punctuation", () => {
    expect(slugifyAlias("Café & Co.")).toBe("cafe-co");
  });

  it("caps length and never ends with a hyphen", () => {
    const slug = slugifyAlias("A".repeat(80) + " " + "B".repeat(80));
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to a random inbox-* slug for reserved words", () => {
    expect(slugifyAlias("noreply")).toMatch(/^inbox-[0-9a-f]{6}$/);
    expect(slugifyAlias("Postmaster")).toMatch(/^inbox-[0-9a-f]{6}$/);
  });

  it("falls back for empty or unusable input", () => {
    expect(slugifyAlias("")).toMatch(/^inbox-[0-9a-f]{6}$/);
    expect(slugifyAlias("!!!")).toMatch(/^inbox-[0-9a-f]{6}$/);
    expect(slugifyAlias("大阪支店")).toMatch(/^inbox-[0-9a-f]{6}$/);
  });
});

describe("findWorkspaceByEmailAlias", () => {
  beforeEach(() => {
    db.state.selectResults = [];
    db.state.insertErrors = [];
    vi.clearAllMocks();
  });

  it("rejects invalid alias shapes without touching the database", async () => {
    expect(await findWorkspaceByEmailAlias("r+token-looking")).toBeNull();
    expect(await findWorkspaceByEmailAlias("-starts-with-hyphen")).toBeNull();
    expect(await findWorkspaceByEmailAlias("has space")).toBeNull();
    expect(await findWorkspaceByEmailAlias("")).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("returns the workspace for a known alias (case-insensitive)", async () => {
    db.state.selectResults = [[{ workspace_id: "ws-1" }]];
    expect(await findWorkspaceByEmailAlias("Pentridge-Media")).toBe("ws-1");
  });
});

describe("ensureWorkspaceReplyAlias", () => {
  beforeEach(() => {
    db.state.selectResults = [];
    db.state.insertErrors = [];
    vi.clearAllMocks();
  });

  it("returns the existing alias without inserting", async () => {
    db.state.selectResults = [[{ alias: "pentridge-media" }]];
    expect(await ensureWorkspaceReplyAlias("ws-1", "Pentridge Media")).toBe("pentridge-media");
  });

  it("creates the slug on first use", async () => {
    db.state.selectResults = [[]]; // no existing alias
    db.state.insertErrors = [null]; // insert succeeds
    expect(await ensureWorkspaceReplyAlias("ws-1", "Pentridge Media")).toBe("pentridge-media");
  });

  it("suffixes on collision with another workspace", async () => {
    db.state.selectResults = [[], []]; // no existing; race re-read also empty
    db.state.insertErrors = [{ message: "duplicate key" }, null]; // first taken, second ok
    const alias = await ensureWorkspaceReplyAlias("ws-2", "Pentridge Media");
    expect(alias).toMatch(/^pentridge-media-[0-9a-f]{4}$/);
  });

  it("returns the racing winner instead of a duplicate", async () => {
    db.state.selectResults = [[], [{ alias: "pentridge-media" }]]; // insert race lost
    db.state.insertErrors = [{ message: "duplicate key" }];
    expect(await ensureWorkspaceReplyAlias("ws-1", "Pentridge Media")).toBe("pentridge-media");
  });

  it("returns null (token fallback) when everything fails", async () => {
    db.state.selectResults = [[], [], [], []];
    db.state.insertErrors = [
      { message: "dup" },
      { message: "dup" },
      { message: "dup" },
    ];
    expect(await ensureWorkspaceReplyAlias("ws-1", "Pentridge Media")).toBeNull();
  });
});
