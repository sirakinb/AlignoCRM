/**
 * Reusable mock factory for insforge.database query chains.
 * Lets tests control what the DB returns without hitting a real database.
 */

import { vi } from "vitest";

type MockResult = { data: unknown; error: unknown };

/**
 * Creates a chainable mock that mimics insforge.database.from(...).select().eq().single() etc.
 * Pass `result` to control what the final method (.single(), the implicit await, etc.) resolves to.
 */
export function createMockQueryBuilder(result: MockResult) {
  const builder: Record<string, unknown> = {};

  const chainMethods = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "not",
    "lte",
    "gte",
    "lt",
    "gt",
    "order",
    "limit",
    "range",
    "filter",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods that resolve the query
  builder.single = vi.fn().mockResolvedValue(result);

  // Make the builder itself thenable (for queries without .single())
  builder.then = vi.fn((resolve: (val: MockResult) => void) =>
    resolve(result)
  );

  return builder;
}

/**
 * Creates a mock `insforge.database` object whose `.from()` returns
 * different query builders depending on the table name.
 *
 * Usage:
 *   const db = createMockDatabase({
 *     contacts: { data: { id: "c1", first_name: "Jane" }, error: null },
 *     deals:    { data: [{ id: "d1", contact_id: "c1" }], error: null },
 *   });
 */
export function createMockDatabase(
  tableResults: Record<string, MockResult>
) {
  const builders: Record<string, ReturnType<typeof createMockQueryBuilder>> = {};

  for (const [table, result] of Object.entries(tableResults)) {
    builders[table] = createMockQueryBuilder(result);
  }

  const from = vi.fn((table: string) => {
    if (builders[table]) return builders[table];
    // Default: return empty success
    return createMockQueryBuilder({ data: null, error: null });
  });

  return { database: { from }, builders };
}
