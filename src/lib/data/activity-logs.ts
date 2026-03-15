import { insforge } from "@/lib/insforge/client";
import type { ActivityLog, CreateActivityLogInput } from "@/types/crm";

export async function getActivityLogs(
  workspaceId: string,
  options?: { entityType?: string; entityId?: string; limit?: number }
) {
  let query = insforge.database
    .from("activity_logs")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (options?.entityType) {
    query = query.eq("entity_type", options.entityType);
  }
  if (options?.entityId) {
    query = query.eq("entity_id", options.entityId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as ActivityLog[];
}

export async function createActivityLog(input: CreateActivityLogInput) {
  const { data, error } = await insforge.database
    .from("activity_logs")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as ActivityLog;
}
