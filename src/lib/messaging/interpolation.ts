import { escapeHtml } from "@/lib/html";

const VARIABLE_PATTERN = /\{\{(.+?)\}\}/g;

/**
 * Resolves a dotted path (e.g. "contact.first_name" or "contact.tags[0]")
 * against a context object. Returns undefined if any segment is missing.
 */
function resolvePath(
  path: string,
  context: Record<string, unknown>
): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((s) => s.trim());

  let current: unknown = context;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Extracts all {{variable}} references from a template string.
 * Returns unique variable paths.
 */
export function extractVariables(template: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_PATTERN.source, "g");

  while ((match = regex.exec(template)) !== null) {
    matches.add(match[1].trim());
  }

  return Array.from(matches);
}

export interface InterpolationResult {
  text: string;
  warnings: string[];
}

export interface InterpolationOptions {
  /**
   * Output context. "html" HTML-escapes every interpolated value so
   * contact-controlled merge data (names, notes, lead fields) cannot inject
   * markup into an email body (REQ-SEC-12). Use "html" for anything rendered
   * as HTML; "text" (default) for SMS, plain-text, and subject lines.
   */
  mode?: "text" | "html";
}

/**
 * Replaces {{variable}} placeholders in a template with values from context.
 * Missing variables are rendered as empty strings and recorded as warnings.
 *
 * IMPORTANT: pass `{ mode: "html" }` whenever the result is used as HTML. The
 * merge values are frequently contact- or lead-controlled and reach email
 * bodies; unescaped interpolation is a stored-XSS vector.
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>,
  options: InterpolationOptions = {}
): InterpolationResult {
  const warnings: string[] = [];
  const escape = options.mode === "html" ? escapeHtml : (v: string) => v;

  const text = template.replace(VARIABLE_PATTERN, (_, path: string) => {
    const trimmed = path.trim();
    const value = resolvePath(trimmed, context);

    if (value === undefined || value === null) {
      warnings.push(`Missing variable: ${trimmed}`);
      return "";
    }

    return escape(String(value));
  });

  return { text, warnings };
}
