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

/**
 * Replaces {{variable}} placeholders in a template with values from context.
 * Missing variables are rendered as empty strings and recorded as warnings.
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): InterpolationResult {
  const warnings: string[] = [];

  const text = template.replace(VARIABLE_PATTERN, (_, path: string) => {
    const trimmed = path.trim();
    const value = resolvePath(trimmed, context);

    if (value === undefined || value === null) {
      warnings.push(`Missing variable: ${trimmed}`);
      return "";
    }

    return String(value);
  });

  return { text, warnings };
}
