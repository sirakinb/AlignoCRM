import "server-only";
import { randomBytes } from "crypto";
import { insforge } from "@/lib/insforge/server";

/**
 * Human-readable Reply-To aliases (pretty replacement for r+<token> addresses).
 * One stable alias per workspace, globally unique, generated from the
 * workspace's sending display name on first outbound email.
 */

const ALIAS_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

// Local parts that must never become a workspace alias: operational addresses
// and anything a mail system treats specially.
const RESERVED = new Set([
  "abuse", "admin", "administrator", "billing", "bounce", "bounces", "contact",
  "help", "hostmaster", "info", "mail", "mailer-daemon", "marketing", "news",
  "noreply", "no-reply", "postmaster", "root", "sales", "security", "support",
  "team", "webmaster",
]);

/** Slugify a display name into an alias candidate ("Pentridge Media" → "pentridge-media"). */
export function slugifyAlias(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 30)
    .replace(/-+$/, "");
  if (!slug || slug.length < 2 || RESERVED.has(slug) || !ALIAS_RE.test(slug)) {
    return `inbox-${randomBytes(3).toString("hex")}`;
  }
  return slug;
}

/** The workspace's alias, or null if none has been assigned yet. */
export async function getWorkspaceReplyAlias(workspaceId: string): Promise<string | null> {
  const { data } = await insforge.database
    .from("workspace_email_aliases")
    .select("alias")
    .eq("workspace_id", workspaceId)
    .limit(1);
  return (data?.[0] as { alias: string } | undefined)?.alias ?? null;
}

/** Reverse lookup for inbound routing: alias local part → workspace id. */
export async function findWorkspaceByEmailAlias(alias: string): Promise<string | null> {
  const normalized = alias.trim().toLowerCase();
  if (!ALIAS_RE.test(normalized)) return null;
  const { data } = await insforge.database
    .from("workspace_email_aliases")
    .select("workspace_id")
    .eq("alias", normalized)
    .limit(1);
  return (data?.[0] as { workspace_id: string } | undefined)?.workspace_id ?? null;
}

/**
 * Get the workspace's alias, creating one from `baseName` on first use.
 * Collisions with other workspaces get a short random suffix. Returns null on
 * persistent failure — callers fall back to the legacy r+<token> address, so
 * an alias problem can never block an outbound send.
 */
export async function ensureWorkspaceReplyAlias(
  workspaceId: string,
  baseName: string
): Promise<string | null> {
  try {
    const existing = await getWorkspaceReplyAlias(workspaceId);
    if (existing) return existing;

    const base = slugifyAlias(baseName);
    const candidates = [
      base,
      `${base}-${randomBytes(2).toString("hex")}`,
      `${base}-${randomBytes(3).toString("hex")}`,
    ];

    for (const candidate of candidates) {
      const { error } = await insforge.database
        .from("workspace_email_aliases")
        .insert({ workspace_id: workspaceId, alias: candidate });
      if (!error) return candidate;
      // Insert race on workspace_id (another request won): use the winner.
      const raced = await getWorkspaceReplyAlias(workspaceId);
      if (raced) return raced;
      // Otherwise the alias itself was taken — try the next candidate.
    }
    return null;
  } catch {
    return null;
  }
}
