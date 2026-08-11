import "server-only";
import { insforge } from "@/lib/insforge/server";
import { encryptTokenToString, decryptToken } from "@/lib/crypto/tokens";

export type EmailConnectionProvider = "google" | "microsoft" | "smtp";
export type EmailConnectionStatus = "active" | "expired" | "revoked";

export interface EmailConnection {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  provider: EmailConnectionProvider;
  email: string;
  display_name: string | null;
  signature: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  status: EmailConnectionStatus;
  is_default: boolean;
  last_sync_at: string | null;
  sync_history_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Public-safe fields returned by the API (no tokens). */
export interface EmailConnectionPublic {
  id: string;
  provider: EmailConnectionProvider;
  email: string;
  display_name: string | null;
  signature: string | null;
  status: EmailConnectionStatus;
  is_default: boolean;
  expires_at: string | null;
  created_at: string;
}

interface DbConnectionRow {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  provider: EmailConnectionProvider;
  email: string;
  display_name: string | null;
  signature: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  scopes: string[];
  status: EmailConnectionStatus;
  is_default: boolean;
  last_sync_at: string | null;
  sync_history_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toPublic(row: DbConnectionRow): EmailConnectionPublic {
  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    display_name: row.display_name,
    signature: row.signature,
    status: row.status,
    is_default: row.is_default,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

function toFull(row: DbConnectionRow): EmailConnection {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    organization_id: row.organization_id,
    provider: row.provider,
    email: row.email,
    display_name: row.display_name,
    signature: row.signature,
    access_token: decryptToken(row.access_token_encrypted),
    refresh_token: row.refresh_token_encrypted
      ? decryptToken(row.refresh_token_encrypted)
      : null,
    expires_at: row.expires_at,
    scopes: row.scopes,
    status: row.status,
    is_default: row.is_default,
    last_sync_at: row.last_sync_at,
    sync_history_id: row.sync_history_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface InsertEmailConnectionInput {
  workspaceId: string;
  organizationId: string | null;
  provider: EmailConnectionProvider;
  email: string;
  displayName?: string;
  signature?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | string | null;
  scopes: string[];
  status?: EmailConnectionStatus;
  createdBy?: string;
  syncHistoryId?: string | null;
}

export async function listEmailConnections(
  workspaceId: string
): Promise<EmailConnectionPublic[]> {
  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .select(
      "id, provider, email, display_name, signature, status, is_default, expires_at, created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as EmailConnectionPublic[]).map((r) => r);
}

export async function getDefaultEmailConnection(
  workspaceId: string
): Promise<EmailConnection | null> {
  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .eq("status", "active")
    .limit(1);

  if (error) throw error;
  const row = (data?.[0] as DbConnectionRow | undefined) ?? null;
  return row ? toFull(row) : null;
}

export async function getEmailConnectionById(
  workspaceId: string,
  id: string
): Promise<EmailConnection | null> {
  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return toFull(data as DbConnectionRow);
}

export async function insertEmailConnection(
  input: InsertEmailConnectionInput
): Promise<EmailConnectionPublic> {
  const isFirst = await isFirstActiveConnection(input.workspaceId);

  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .insert({
      workspace_id: input.workspaceId,
      ...(input.organizationId ? { organization_id: input.organizationId } : {}),
      provider: input.provider,
      email: input.email.toLowerCase().trim(),
      display_name: input.displayName?.trim() ?? null,
      signature: input.signature?.trim() ?? null,
      access_token_encrypted: encryptTokenToString(input.accessToken),
      refresh_token_encrypted: input.refreshToken
        ? encryptTokenToString(input.refreshToken)
        : null,
      expires_at: input.expiresAt
        ? typeof input.expiresAt === "string"
          ? input.expiresAt
          : input.expiresAt.toISOString()
        : null,
      scopes: input.scopes,
      status: input.status ?? "active",
      is_default: isFirst,
      sync_history_id: input.syncHistoryId ?? null,
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
    })
    .select(
      "id, provider, email, display_name, signature, status, is_default, expires_at, created_at"
    )
    .single();

  if (error) throw error;
  return data as unknown as EmailConnectionPublic;
}

export interface UpdateEmailConnectionInput {
  displayName?: string;
  signature?: string;
  isDefault?: boolean;
}

export async function updateEmailConnection(
  workspaceId: string,
  id: string,
  input: UpdateEmailConnectionInput
): Promise<EmailConnectionPublic | null> {
  const updates: Record<string, unknown> = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName.trim();
  if (input.signature !== undefined) updates.signature = input.signature.trim();
  if (input.isDefault !== undefined) updates.is_default = input.isDefault;

  if (Object.keys(updates).length === 0) {
    const existing = await getEmailConnectionById(workspaceId, id);
    return existing ? toPublic(existing as unknown as DbConnectionRow) : null;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select(
      "id, provider, email, display_name, signature, status, is_default, expires_at, created_at"
    )
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  if (input.isDefault) {
    await clearOtherDefaults(workspaceId, id);
  }

  return data as unknown as EmailConnectionPublic;
}

export async function deleteEmailConnection(
  workspaceId: string,
  id: string
): Promise<boolean> {
  const { error } = await insforge.database
    .from("workspace_email_connections")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return true;
}

export async function setEmailConnectionStatus(
  workspaceId: string,
  id: string,
  status: EmailConnectionStatus
): Promise<void> {
  const { error } = await insforge.database
    .from("workspace_email_connections")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

export async function updateEmailConnectionTokens(
  workspaceId: string,
  id: string,
  tokens: { accessToken: string; refreshToken?: string | null; expiresAt?: Date | string | null }
): Promise<void> {
  const updates: Record<string, unknown> = {
    access_token_encrypted: encryptTokenToString(tokens.accessToken),
    updated_at: new Date().toISOString(),
  };

  if (tokens.refreshToken !== undefined) {
    updates.refresh_token_encrypted = tokens.refreshToken
      ? encryptTokenToString(tokens.refreshToken)
      : null;
  }
  if (tokens.expiresAt !== undefined) {
    updates.expires_at = tokens.expiresAt
      ? typeof tokens.expiresAt === "string"
        ? tokens.expiresAt
        : tokens.expiresAt.toISOString()
      : null;
  }

  const { error } = await insforge.database
    .from("workspace_email_connections")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

/** Active connections eligible for inbound mailbox sync (server-only). */
export async function listActiveEmailConnectionsForSync(): Promise<EmailConnection[]> {
  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .select("*")
    .eq("status", "active")
    .in("provider", ["google", "microsoft"])
    .order("last_sync_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return ((data ?? []) as DbConnectionRow[]).map(toFull);
}

export async function updateEmailConnectionSyncState(
  workspaceId: string,
  id: string,
  state: { syncHistoryId?: string | null; lastSyncAt?: Date | string }
): Promise<void> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (state.syncHistoryId !== undefined) {
    updates.sync_history_id = state.syncHistoryId;
  }
  if (state.lastSyncAt !== undefined) {
    updates.last_sync_at =
      typeof state.lastSyncAt === "string"
        ? state.lastSyncAt
        : state.lastSyncAt.toISOString();
  }

  const { error } = await insforge.database
    .from("workspace_email_connections")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}

async function isFirstActiveConnection(workspaceId: string): Promise<boolean> {
  const { data, error } = await insforge.database
    .from("workspace_email_connections")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) === 0;
}

async function clearOtherDefaults(workspaceId: string, keepId: string): Promise<void> {
  await insforge.database
    .from("workspace_email_connections")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .neq("id", keepId);
}
