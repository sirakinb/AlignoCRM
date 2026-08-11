import "server-only";
import { insforge } from "@/lib/insforge/server";
import type {
  Campaign,
  CampaignAudienceShape,
  CampaignRecipient,
  MessageChannel,
} from "@/types/messaging";

export type { Campaign, CampaignRecipient } from "@/types/messaging";

/**
 * Campaign CRUD + recipient/status reads (Phase 4). Workspace-scoped like every
 * other data-layer module: fetch-by-id is always fetch-by-id-AND-workspace so a
 * cross-tenant id resolves to null → 404, never a leaked row (REQ-SEC-15.2).
 */

export interface CreateCampaignInput {
  workspace_id: string;
  organization_id?: string | null;
  channel: MessageChannel;
  name: string;
  subject?: string | null;
  body?: string;
  template_id?: string | null;
  audience: CampaignAudienceShape;
  created_by?: string | null;
}

export interface UpdateCampaignInput {
  name?: string;
  subject?: string | null;
  body?: string;
  template_id?: string | null;
  audience?: CampaignAudienceShape;
  channel?: MessageChannel;
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const { data, error } = await insforge.database
    .from("campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Campaign[];
}

export async function getCampaign(
  id: string,
  workspaceId: string
): Promise<Campaign | null> {
  const { data } = await insforge.database
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .limit(1);
  return (data?.[0] as Campaign | undefined) ?? null;
}

export async function createCampaign(
  input: CreateCampaignInput
): Promise<Campaign> {
  const { data, error } = await insforge.database
    .from("campaigns")
    .insert({
      workspace_id: input.workspace_id,
      ...(input.organization_id ? { organization_id: input.organization_id } : {}),
      channel: input.channel,
      name: input.name,
      subject: input.subject ?? null,
      body: input.body ?? "",
      template_id: input.template_id ?? null,
      audience: input.audience,
      status: "draft",
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

/**
 * Patch a DRAFT campaign. The route is responsible for the status check (P4-06);
 * this still filters by workspace_id so a cross-tenant id updates nothing.
 */
export async function updateCampaign(
  id: string,
  workspaceId: string,
  input: UpdateCampaignInput
): Promise<Campaign> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.body !== undefined) patch.body = input.body;
  if (input.template_id !== undefined) patch.template_id = input.template_id;
  if (input.audience !== undefined) patch.audience = input.audience;
  if (input.channel !== undefined) patch.channel = input.channel;

  const { data, error } = await insforge.database
    .from("campaigns")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

export async function deleteCampaign(
  id: string,
  workspaceId: string
): Promise<void> {
  const { error } = await insforge.database
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw error;
}

/**
 * Atomically claim a DRAFT campaign for sending (Gate/QA HIGH #1). A conditional
 * `UPDATE ... WHERE id=? AND workspace_id=? AND status='draft'` returning the row
 * is a compare-and-set: under two concurrent /send calls, Postgres row-locking
 * lets exactly ONE update match `status='draft'` and flip it — the other matches
 * zero rows and gets null. The winner materializes; the loser 409s. This closes
 * the get→check→materialize TOCTOU that would otherwise double-send the audience.
 * Returns the claimed campaign, or null if it was not a draft (already claimed).
 */
export async function claimCampaignForSending(
  id: string,
  workspaceId: string
): Promise<Campaign | null> {
  const { data, error } = await insforge.database
    .from("campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("status", "draft")
    .select();
  if (error) throw error;
  const rows = (data ?? []) as Campaign[];
  return rows[0] ?? null;
}

/** Set the campaign status (+ optional counter fields), workspace-scoped. */
export async function setCampaignFields(
  id: string,
  workspaceId: string,
  fields: Partial<
    Pick<
      Campaign,
      | "status"
      | "total_count"
      | "sent_count"
      | "delivered_count"
      | "failed_count"
      | "suppressed_count"
      | "no_address_count"
    >
  >
): Promise<void> {
  const { error } = await insforge.database
    .from("campaigns")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  if (error) throw error;
}

async function countMessages(
  campaignId: string,
  workspaceId: string,
  status?: string
): Promise<number> {
  let query = insforge.database
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("campaign_id", campaignId);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Recompute a campaign's live counters by AGGREGATING the messages rows, never by
 * read-modify-write (which races under the self-re-invoking processor). Mirrors
 * Phase 2's recomputeCampaignCounter. `sent_count` counts every row that reached
 * the provider (sent/delivered/bounced), so the reconciliation identities in
 * P4-21 hold: sent_count + failed_count == total_count once nothing is queued,
 * and delivered_count never exceeds sent_count.
 */
export async function recomputeCampaignCounters(
  campaignId: string,
  workspaceId: string
): Promise<{ queued: number; failed: number; sent: number; delivered: number }> {
  const [sent, delivered, bounced, failed, queued] = await Promise.all([
    countMessages(campaignId, workspaceId, "sent"),
    countMessages(campaignId, workspaceId, "delivered"),
    countMessages(campaignId, workspaceId, "bounced"),
    countMessages(campaignId, workspaceId, "failed"),
    countMessages(campaignId, workspaceId, "queued"),
  ]);
  const sentCount = sent + delivered + bounced;

  await insforge.database
    .from("campaigns")
    .update({
      sent_count: sentCount,
      delivered_count: delivered,
      failed_count: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId);

  return { queued, failed, sent: sentCount, delivered };
}

/** Per-recipient status rows for the campaign detail table (P4-22), paginated. */
export async function getCampaignRecipients(
  campaignId: string,
  workspaceId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<CampaignRecipient[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const { data: msgRows, error } = await insforge.database
    .from("messages")
    .select(
      "id, contact_id, to_address, status, error, sent_at, delivered_at, created_at"
    )
    .eq("workspace_id", workspaceId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = (msgRows ?? []) as Array<{
    id: string;
    contact_id: string;
    to_address: string | null;
    status: string;
    error: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  const contactIds = Array.from(new Set(rows.map((r) => r.contact_id)));
  const { data: contactRows } = await insforge.database
    .from("contacts")
    .select("id, first_name, last_name, email, phone")
    .eq("workspace_id", workspaceId)
    .in("id", contactIds);
  const nameById = new Map<string, string>();
  for (const c of (contactRows ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }>) {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    nameById.set(c.id, name || c.email || c.phone || "Unnamed contact");
  }

  return rows.map((r) => ({
    message_id: r.id,
    contact_id: r.contact_id,
    contact_name: nameById.get(r.contact_id) ?? "Unnamed contact",
    address: r.to_address,
    status: r.status,
    error: r.error,
    sent_at: r.sent_at,
    delivered_at: r.delivered_at,
    created_at: r.created_at,
  }));
}
