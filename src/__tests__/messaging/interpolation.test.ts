import { describe, it, expect } from "vitest";
import {
  interpolateTemplate,
  extractVariables,
} from "@/lib/messaging/interpolation";

describe("interpolateTemplate", () => {
  it("replaces basic variables", () => {
    const result = interpolateTemplate("Hello {{name}}!", { name: "Alice" });
    expect(result.text).toBe("Hello Alice!");
    expect(result.warnings).toHaveLength(0);
  });

  it("replaces nested variables via dot notation", () => {
    const result = interpolateTemplate(
      "Hi {{contact.first_name}} {{contact.last_name}}",
      { contact: { first_name: "Bob", last_name: "Jones" } }
    );
    expect(result.text).toBe("Hi Bob Jones");
    expect(result.warnings).toHaveLength(0);
  });

  it("handles array bracket access", () => {
    const result = interpolateTemplate("Tag: {{contact.tags[0]}}", {
      contact: { tags: ["vip", "enterprise"] },
    });
    expect(result.text).toBe("Tag: vip");
    expect(result.warnings).toHaveLength(0);
  });

  it("renders missing variables as empty string with warning", () => {
    const result = interpolateTemplate(
      "Hello {{contact.first_name}}, your deal is {{deal.value}}",
      { contact: { first_name: "Alice" } }
    );
    expect(result.text).toBe("Hello Alice, your deal is ");
    expect(result.warnings).toEqual(["Missing variable: deal.value"]);
  });

  it("handles completely missing top-level variable", () => {
    const result = interpolateTemplate("Value: {{missing}}", {});
    expect(result.text).toBe("Value: ");
    expect(result.warnings).toEqual(["Missing variable: missing"]);
  });

  it("handles multiple missing variables", () => {
    const result = interpolateTemplate("{{a}} and {{b}}", {});
    expect(result.text).toBe(" and ");
    expect(result.warnings).toEqual([
      "Missing variable: a",
      "Missing variable: b",
    ]);
  });

  it("handles null values as missing", () => {
    const result = interpolateTemplate("Value: {{val}}", { val: null });
    expect(result.text).toBe("Value: ");
    expect(result.warnings).toEqual(["Missing variable: val"]);
  });

  it("converts numbers to strings", () => {
    const result = interpolateTemplate("Amount: {{deal.value}}", {
      deal: { value: 5000 },
    });
    expect(result.text).toBe("Amount: 5000");
  });

  it("handles template with no variables", () => {
    const result = interpolateTemplate("Plain text", {});
    expect(result.text).toBe("Plain text");
    expect(result.warnings).toHaveLength(0);
  });

  it("handles variables with whitespace around path", () => {
    const result = interpolateTemplate("{{ name }}", { name: "Alice" });
    expect(result.text).toBe("Alice");
  });
});

describe("extractVariables", () => {
  it("extracts simple variables", () => {
    expect(extractVariables("Hello {{name}}")).toEqual(["name"]);
  });

  it("extracts multiple variables", () => {
    const vars = extractVariables("{{first}} and {{last}}");
    expect(vars).toEqual(["first", "last"]);
  });

  it("extracts nested variables", () => {
    const vars = extractVariables("{{contact.first_name}} {{contact.email}}");
    expect(vars).toEqual(["contact.first_name", "contact.email"]);
  });

  it("deduplicates variables", () => {
    const vars = extractVariables("{{name}} is {{name}}");
    expect(vars).toEqual(["name"]);
  });

  it("returns empty array for no variables", () => {
    expect(extractVariables("No variables here")).toEqual([]);
  });

  it("extracts variables with array access", () => {
    const vars = extractVariables("{{contact.tags[0]}}");
    expect(vars).toEqual(["contact.tags[0]"]);
  });
});
