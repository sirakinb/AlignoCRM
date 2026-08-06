import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Gate 3 static control (REQ-SEC-13, contract a): no component in the messaging
 * surface may use dangerouslySetInnerHTML. Inbound HTML only ever reaches the DOM
 * through the sandboxed iframe's srcDoc.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("messaging components — rendering safety", () => {
  const dir = path.resolve(__dirname, "../../components/messaging");

  it("contain no dangerouslySetInnerHTML", () => {
    const offenders = walk(dir)
      .filter((f) => /\.(tsx?|jsx?)$/.test(f))
      .filter((f) => readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"));
    expect(offenders).toEqual([]);
  });
});
