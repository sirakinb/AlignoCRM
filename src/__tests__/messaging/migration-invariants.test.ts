import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins two schema fixes to the migration text (the migration is unapplied, so
 * these are content assertions, not DB checks):
 *  - Security #5: messages.sender_verified DEFAULTs true (outbound rows never set
 *    it and must not read as "unverified").
 *  - Security #14: a partial unique index guards concurrent inbound-SMS contact
 *    auto-create.
 */
const sql = readFileSync(
  join(process.cwd(), "migrations", "20260805120000_messaging-center.sql"),
  "utf8"
);

describe("messaging migration invariants", () => {
  it("sender_verified defaults to true, not false (Security #5)", () => {
    expect(sql).toMatch(/sender_verified\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+true/i);
    expect(sql).not.toMatch(/sender_verified\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false/i);
  });

  it("adds the partial unique index guarding inbound-SMS contact auto-create (Security #14)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*contacts\(workspace_id, phone\)\s*WHERE phone IS NOT NULL/i);
  });
});
