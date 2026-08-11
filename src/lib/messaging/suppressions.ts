import { insforge } from "@/lib/insforge/server";
import type { MessageChannel } from "@/types/messaging";

export type SuppressionReason =
  | "unsubscribe"
  | "stop"
  | "bounce"
  | "complaint"
  | "manual";

export interface SuppressionHit {
  reason: SuppressionReason;
}

/** Normalize an address for suppression matching: email lowercased/trimmed, phone as-is (already E.164). */
export function normalizeSuppressionAddress(
  channel: MessageChannel,
  address: string
): string {
  return channel === "email" ? address.trim().toLowerCase() : address.trim();
}

/**
 * Look up a suppression for (workspace, channel, address). Returns the hit with
 * its reason, or null. Callers decide policy — the asymmetry (SMS stop blocks
 * everything; email unsubscribe/complaint block only campaigns; email bounce
 * blocks everywhere) lives in send-message.ts, not here.
 */
export async function findSuppression(
  workspaceId: string,
  channel: MessageChannel,
  address: string
): Promise<SuppressionHit | null> {
  const normalized = normalizeSuppressionAddress(channel, address);
  const { data, error } = await insforge.database
    .from("suppressions")
    .select("reason")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .eq("address", normalized)
    .limit(1);

  if (error) throw error;
  const row = data?.[0] as { reason: SuppressionReason } | undefined;
  return row ? { reason: row.reason } : null;
}

/**
 * Suppression-reason strength. A new suppression may UPGRADE an existing one to
 * a stronger reason but MUST NEVER downgrade it. `manual` is the operator's
 * explicit block and outranks everything; `bounce`/`stop` are hard delivery
 * facts; `complaint`/`unsubscribe` are softer (warn-allow on 1:1 email, P1-29).
 * Without this, a late `complaint` webhook would overwrite a `manual`/`bounce`
 * row and silently re-open 1:1 email that REQ-SEC-19 / P1-30 require hard-blocked.
 */
const REASON_STRENGTH: Record<SuppressionReason, number> = {
  manual: 5,
  bounce: 4,
  stop: 4,
  complaint: 2,
  unsubscribe: 1,
};

/**
 * Add a suppression. Idempotent on the unique (workspace, channel, address), and
 * precedence-aware: it only overwrites the stored reason when the new reason is
 * STRONGER (never weaker). Concurrent inserts converge via the unique index —
 * the loser re-reads and applies the same upgrade-only rule.
 */
export async function addSuppression(input: {
  workspaceId: string;
  channel: MessageChannel;
  address: string;
  reason: SuppressionReason;
  sourceMessageId?: string | null;
}): Promise<void> {
  const normalized = normalizeSuppressionAddress(input.channel, input.address);

  const existing = await findSuppression(input.workspaceId, input.channel, normalized);
  if (existing) {
    if (REASON_STRENGTH[input.reason] > REASON_STRENGTH[existing.reason]) {
      const { error } = await insforge.database
        .from("suppressions")
        .update({
          reason: input.reason,
          source_message_id: input.sourceMessageId ?? null,
        })
        .eq("workspace_id", input.workspaceId)
        .eq("channel", input.channel)
        .eq("address", normalized);
      if (error) throw error;
    }
    return; // weaker-or-equal reason on an existing row → no downgrade
  }

  const { error } = await insforge.database.from("suppressions").insert({
    workspace_id: input.workspaceId,
    channel: input.channel,
    address: normalized,
    reason: input.reason,
    source_message_id: input.sourceMessageId ?? null,
  });
  if (!error) return;

  // Lost an insert race: another writer created the row. Re-read and apply the
  // same upgrade-only rule so the outcome is order-independent.
  const now = await findSuppression(input.workspaceId, input.channel, normalized);
  if (now && REASON_STRENGTH[input.reason] > REASON_STRENGTH[now.reason]) {
    const { error: upErr } = await insforge.database
      .from("suppressions")
      .update({
        reason: input.reason,
        source_message_id: input.sourceMessageId ?? null,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("channel", input.channel)
      .eq("address", normalized);
    if (upErr) throw upErr;
    return;
  }
  if (!now) throw error; // a real insert failure, not a uniqueness conflict
}

export interface SuppressionRow {
  id: string;
  workspace_id: string;
  channel: MessageChannel;
  address: string;
  reason: SuppressionReason;
  created_at: string;
}

/** List a workspace's suppressions, optionally filtered by channel (P4-29). */
export async function listSuppressions(
  workspaceId: string,
  channel?: MessageChannel
): Promise<SuppressionRow[]> {
  let query = insforge.database
    .from("suppressions")
    .select("id, workspace_id, channel, address, reason, created_at")
    .eq("workspace_id", workspaceId);
  if (channel) query = query.eq("channel", channel);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SuppressionRow[];
}

/** Remove a suppression (e.g. inbound SMS "UNSTOP"/"START"). */
export async function removeSuppression(
  workspaceId: string,
  channel: MessageChannel,
  address: string
): Promise<void> {
  const normalized = normalizeSuppressionAddress(channel, address);
  const { error } = await insforge.database
    .from("suppressions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .eq("address", normalized);
  if (error) throw error;
}
