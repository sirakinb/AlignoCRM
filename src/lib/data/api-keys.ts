import { createHash, randomBytes } from "crypto";
import { insforge } from "@/lib/insforge/server";

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  organization_id: string | null;
  name: string;
  key_hash: string;
  key_prefix: string;
  last_four: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const API_KEY_PREFIX = "algn";

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function generateApiKey() {
  return `${API_KEY_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function maskApiKey(record: Pick<ApiKeyRecord, "key_prefix" | "last_four">) {
  return `${record.key_prefix}_••••••••••••${record.last_four}`;
}

export async function getActiveApiKeyForUser(
  userId: string,
  organizationId?: string | null
) {
  let query = insforge.database
    .from("api_keys")
    .select()
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.single();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST116") return null;
    throw error;
  }

  return data as ApiKeyRecord;
}

export async function createApiKeyForUser({
  userId,
  organizationId,
  name,
}: {
  userId: string;
  organizationId?: string | null;
  name: string;
}) {
  const apiKey = generateApiKey();
  const now = new Date().toISOString();

  let revokeQuery = insforge.database
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (organizationId) {
    revokeQuery = revokeQuery.eq("organization_id", organizationId);
  }

  await revokeQuery;

  const insertPayload: Record<string, string> = {
    user_id: userId,
    name,
    key_hash: hashApiKey(apiKey),
    key_prefix: API_KEY_PREFIX,
    last_four: apiKey.slice(-4),
  };

  if (organizationId) {
    insertPayload.organization_id = organizationId;
  }

  const { data, error } = await insforge.database
    .from("api_keys")
    .insert(insertPayload)
    .select()
    .single();

  if (error) throw error;

  return {
    apiKey,
    record: data as ApiKeyRecord,
  };
}

export async function revokeActiveApiKeyForUser(
  userId: string,
  organizationId?: string | null
) {
  let query = insforge.database
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { error } = await query;

  if (error) throw error;
}

export async function findActiveApiKey(apiKey: string) {
  const { data, error } = await insforge.database
    .from("api_keys")
    .select()
    .eq("key_hash", hashApiKey(apiKey))
    .is("revoked_at", null)
    .single();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST116") return null;
    throw error;
  }

  return data as ApiKeyRecord;
}

export async function markApiKeyUsed(id: string) {
  const { error } = await insforge.database
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
