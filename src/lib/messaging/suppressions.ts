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

/** Add a suppression (idempotent on the unique (workspace, channel, address)). */
export async function addSuppression(input: {
  workspaceId: string;
  channel: MessageChannel;
  address: string;
  reason: SuppressionReason;
  sourceMessageId?: string | null;
}): Promise<void> {
  const normalized = normalizeSuppressionAddress(input.channel, input.address);
  const { error } = await insforge.database.from("suppressions").upsert(
    {
      workspace_id: input.workspaceId,
      channel: input.channel,
      address: normalized,
      reason: input.reason,
      source_message_id: input.sourceMessageId ?? null,
    },
    { onConflict: "workspace_id,channel,address" }
  );
  if (error) throw error;
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
