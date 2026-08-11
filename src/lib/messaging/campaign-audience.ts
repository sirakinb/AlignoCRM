import { insforge } from "@/lib/insforge/server";
import type { MessageChannel } from "@/types/messaging";
import { normalizeSuppressionAddress } from "./suppressions";
import { normalizeSendableE164 } from "./phone";

/**
 * Campaign audience resolution (A-12) and classification into the split
 * exclusion counters (A-14). This is the SINGLE code path used by both the live
 * recipient-count preview and the actual send, so the preview can never disagree
 * with what ships (P4-11).
 *
 * SECURITY (REQ-SEC-15.5): every element of `audience.tagIds` is re-validated
 * against the caller's workspace before any contact is resolved. A tag id that
 * does not belong to the workspace is rejected outright — resolving a foreign
 * tag id would be cross-tenant contact exfiltration WITH delivery attached.
 */

export interface CampaignAudience {
  all?: boolean;
  tagIds?: string[];
  statuses?: string[];
}

export interface AudienceContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
}

export class AudienceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudienceError";
  }
}

const MAX_TAG_IDS = 100; // REQ-SEC-24

/**
 * Normalize + validate an audience payload (A-12b): `all` is exclusive; it cannot
 * be combined with tag/status selectors. Throws AudienceError (→ 400) rather than
 * silently picking a winner.
 */
export function validateAudience(raw: unknown): CampaignAudience {
  const a = (raw ?? {}) as Record<string, unknown>;
  const all = a.all === true;
  const tagIds = Array.isArray(a.tagIds)
    ? a.tagIds.filter((t): t is string => typeof t === "string")
    : [];
  const statuses = Array.isArray(a.statuses)
    ? a.statuses.filter((s): s is string => typeof s === "string")
    : [];

  if (tagIds.length > MAX_TAG_IDS) {
    throw new AudienceError("Too many tags selected.");
  }
  if (all && (tagIds.length > 0 || statuses.length > 0)) {
    throw new AudienceError(
      "'all' cannot be combined with tag or status filters."
    );
  }
  if (!all && tagIds.length === 0 && statuses.length === 0) {
    throw new AudienceError("Select an audience (all, tags, or statuses).");
  }
  return { all, tagIds, statuses };
}

/**
 * Resolve an audience to a deduped list of contacts, scoped to the workspace.
 * Semantics (A-12):
 *   - all:true                → every contact in the workspace
 *   - tagIds:[a,b]            → UNION (contacts with either tag)
 *   - statuses:[x,y]          → contacts whose status is x OR y
 *   - tagIds × statuses       → INTERSECTION across dimensions:
 *                               (tag a OR b) AND (status x OR y)
 */
export async function resolveAudienceContacts(
  workspaceId: string,
  audience: CampaignAudience
): Promise<AudienceContact[]> {
  const normalized = validateAudience(audience);

  // ── tag dimension: re-validate every id belongs to the workspace ───────────
  let tagContactIds: Set<string> | null = null;
  if (normalized.tagIds && normalized.tagIds.length > 0) {
    const { data: ownedTags, error: tagErr } = await insforge.database
      .from("tags")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", normalized.tagIds);
    if (tagErr) throw tagErr;
    const ownedIds = new Set(
      ((ownedTags ?? []) as Array<{ id: string }>).map((t) => t.id)
    );
    // Any requested tag not owned by this workspace → reject (REQ-SEC-15.5).
    for (const requested of normalized.tagIds) {
      if (!ownedIds.has(requested)) {
        throw new AudienceError("One or more tags are not in this workspace.");
      }
    }

    // Gate-4 #9: `contact_tags` has no workspace_id column (PK is
    // (contact_id, tag_id)), so it cannot be filtered by workspace directly. Two
    // controls make that safe: (a) every tag_id here was just confirmed to belong
    // to this workspace above, and (b) the resulting contact_ids are only ever
    // loaded through the workspace-scoped contacts query below (.eq workspace_id),
    // which drops any id that isn't in this workspace. A cross-tenant contact can
    // never survive both gates.
    const { data: links, error: linkErr } = await insforge.database
      .from("contact_tags")
      .select("contact_id, tag_id")
      .in("tag_id", normalized.tagIds);
    if (linkErr) throw linkErr;
    tagContactIds = new Set(
      ((links ?? []) as Array<{ contact_id: string }>).map((l) => l.contact_id)
    );
    // No contact carries any selected tag → empty audience.
    if (tagContactIds.size === 0) return [];
  }

  // ── load candidate contacts, always workspace-scoped ───────────────────────
  let query = insforge.database
    .from("contacts")
    .select("id, first_name, last_name, email, phone, company, status")
    .eq("workspace_id", workspaceId);

  if (normalized.statuses && normalized.statuses.length > 0) {
    query = query.in("status", normalized.statuses);
  }
  // When resolving by tag, constrain to the tagged ids (and thus the union).
  if (tagContactIds) {
    query = query.in("id", Array.from(tagContactIds));
  }

  const { data, error } = await query;
  if (error) throw error;

  // Dedup by id (a contact carrying two selected tags appears once — P4-09).
  const byId = new Map<string, AudienceContact>();
  for (const row of (data ?? []) as AudienceContact[]) {
    byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

export interface AudienceClassification {
  /** contacts that will actually be sent to. */
  sendable: AudienceContact[];
  /** total recipients that will be materialized (== sendable.length). */
  totalCount: number;
  /** dropped: on the suppression list for this channel (A-14). */
  suppressedCount: number;
  /** dropped: no email/phone for this channel (A-14). */
  noAddressCount: number;
  /** preview headline: everyone the audience resolved to, before drops. */
  audienceCount: number;
}

/**
 * Classify resolved contacts for a channel into sendable / suppressed /
 * no-address (A-14, P4-10). For campaigns, ANY suppression row on the channel is
 * a hard block (email: unsubscribe/complaint/bounce/manual all block campaigns;
 * sms: stop/manual). One suppression query, matched in-memory on the normalized
 * address, so a large audience is a single round-trip not N.
 */
export async function classifyAudience(
  workspaceId: string,
  channel: MessageChannel,
  contacts: AudienceContact[]
): Promise<AudienceClassification> {
  const { data: supRows, error } = await insforge.database
    .from("suppressions")
    .select("address")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel);
  if (error) throw error;
  const suppressed = new Set(
    ((supRows ?? []) as Array<{ address: string }>).map((r) => r.address)
  );

  const sendable: AudienceContact[] = [];
  let suppressedCount = 0;
  let noAddressCount = 0;

  for (const contact of contacts) {
    const raw = channel === "email" ? contact.email : contact.phone;
    if (!raw || raw.trim().length === 0) {
      noAddressCount++;
      continue;
    }
    // Match materialize's address handling so the preview equals the send
    // (P4-11): SMS goes through the same E.164 + allowlist normalization, and an
    // un-sendable number is an address problem, not a silent drop.
    let normalized: string;
    if (channel === "sms") {
      try {
        normalized = normalizeSuppressionAddress("sms", normalizeSendableE164(raw));
      } catch {
        noAddressCount++;
        continue;
      }
    } else {
      normalized = normalizeSuppressionAddress("email", raw);
    }
    if (suppressed.has(normalized)) {
      suppressedCount++;
      continue;
    }
    sendable.push(contact);
  }

  return {
    sendable,
    totalCount: sendable.length,
    suppressedCount,
    noAddressCount,
    audienceCount: contacts.length,
  };
}

/**
 * The preview: resolve + classify in one call, returning only the counts the
 * composer needs. Shares the resolver/classifier with the send (P4-11), so the
 * "N recipients" preview equals `total + suppressed + no_address` at send time.
 */
export async function previewAudience(
  workspaceId: string,
  channel: MessageChannel,
  audience: CampaignAudience
): Promise<{
  totalCount: number;
  suppressedCount: number;
  noAddressCount: number;
  audienceCount: number;
}> {
  const contacts = await resolveAudienceContacts(workspaceId, audience);
  const c = await classifyAudience(workspaceId, channel, contacts);
  return {
    totalCount: c.totalCount,
    suppressedCount: c.suppressedCount,
    noAddressCount: c.noAddressCount,
    audienceCount: c.audienceCount,
  };
}
