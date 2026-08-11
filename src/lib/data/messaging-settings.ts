import "server-only";
import { insforge } from "@/lib/insforge/server";
import type { MessageChannel } from "@/types/messaging";

/**
 * workspace_channels access (A-16). Rows are created LAZILY on first read rather
 * than seeded by the migration, so the feature is portable across environments
 * and a brand-new workspace can reach every messaging screen without a manual
 * seed step (P5-01b/P5-01c). The UNIQUE (workspace_id, channel) constraint makes
 * concurrent first-reads converge instead of surfacing a 500.
 */

export interface EmailChannelConfig {
  from_name?: string;
  from_local_part?: string;
}
export interface SmsChannelConfig {
  phone_number?: string;
  messaging_service_sid?: string;
  verification_status?: string;
}

export interface WorkspaceChannel {
  id: string;
  workspace_id: string;
  channel: MessageChannel;
  config: EmailChannelConfig & SmsChannelConfig;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
}

async function ensureChannel(
  workspaceId: string,
  organizationId: string | null,
  channel: MessageChannel
): Promise<WorkspaceChannel> {
  const { data: existing } = await insforge.database
    .from("workspace_channels")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .limit(1);
  if (existing?.[0]) return existing[0] as WorkspaceChannel;

  const { data: created, error } = await insforge.database
    .from("workspace_channels")
    .insert({
      workspace_id: workspaceId,
      ...(organizationId ? { organization_id: organizationId } : {}),
      channel,
      config: {},
    })
    .select()
    .single();
  if (error) {
    // Lost the race to a concurrent first-read — re-read the winner (P5-01b).
    const { data: retry } = await insforge.database
      .from("workspace_channels")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("channel", channel)
      .limit(1);
    if (retry?.[0]) return retry[0] as WorkspaceChannel;
    throw error;
  }
  return created as WorkspaceChannel;
}

/** Idempotently create + return both channel rows for the workspace (A-16). */
export async function getOrCreateChannels(
  workspaceId: string,
  organizationId: string | null
): Promise<{ email: WorkspaceChannel; sms: WorkspaceChannel }> {
  const email = await ensureChannel(workspaceId, organizationId, "email");
  const sms = await ensureChannel(workspaceId, organizationId, "sms");
  return { email, sms };
}

const LOCAL_PART = /^[a-z0-9][a-z0-9._-]{0,32}$/i;
const E164 = /^\+[1-9]\d{1,14}$/;

export class SettingsValidationError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "SettingsValidationError";
  }
}

/**
 * Validate + persist a channel's config, workspace-scoped. Email validates
 * from_local_part against a safe pattern and strips header-hostile chars from
 * from_name; SMS validates phone_number as E.164 (P5-01). Invalid input throws
 * SettingsValidationError (→ 400) and writes nothing.
 */
export async function updateChannelConfig(
  workspaceId: string,
  organizationId: string | null,
  channel: MessageChannel,
  raw: Record<string, unknown>
): Promise<WorkspaceChannel> {
  await ensureChannel(workspaceId, organizationId, channel);

  let config: Record<string, unknown>;
  if (channel === "email") {
    const fromName =
      typeof raw.from_name === "string"
        ? raw.from_name.replace(/[\r\n<>";]/g, "").trim().slice(0, 64)
        : "";
    const fromLocal =
      typeof raw.from_local_part === "string" ? raw.from_local_part.trim() : "";
    if (fromLocal && !LOCAL_PART.test(fromLocal)) {
      throw new SettingsValidationError(
        "from_local_part",
        "Sender local-part may only contain letters, digits, dot, underscore, and dash."
      );
    }
    config = { from_name: fromName, from_local_part: fromLocal };
  } else {
    const phone = typeof raw.phone_number === "string" ? raw.phone_number.trim() : "";
    if (phone && !E164.test(phone)) {
      throw new SettingsValidationError(
        "phone_number",
        "Phone number must be E.164 (e.g. +18005551234)."
      );
    }
    const sid =
      typeof raw.messaging_service_sid === "string"
        ? raw.messaging_service_sid.trim().slice(0, 64)
        : "";
    config = { phone_number: phone, messaging_service_sid: sid };
  }

  const { data, error } = await insforge.database
    .from("workspace_channels")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .select()
    .single();
  if (error) throw error;
  return data as WorkspaceChannel;
}
