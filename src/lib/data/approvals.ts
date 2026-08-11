import { insforge } from "@/lib/insforge/server";
import type {
  ApprovalRequest,
  ApprovalActionRecord,
  CreateApprovalInput,
} from "@/types/approval";
import { ApprovalStatus, ApprovalAction } from "@/types/approval";

export interface ApprovalFilters {
  status?: ApprovalStatus;
  content_type?: string;
  assigned_to?: string;
}

export async function getApprovalRequests(
  workspaceId: string,
  filters?: ApprovalFilters
) {
  let query = insforge.database
    .from("approval_requests")
    .select()
    .eq("workspace_id", workspaceId);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.content_type) {
    query = query.eq("content_type", filters.content_type);
  }
  if (filters?.assigned_to) {
    query = query.eq("assigned_to", filters.assigned_to);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) throw error;
  return data as ApprovalRequest[];
}

export async function getApprovalRequest(id: string) {
  const { data, error } = await insforge.database
    .from("approval_requests")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as ApprovalRequest;
}

export async function createApprovalRequest(input: CreateApprovalInput) {
  const { data, error } = await insforge.database
    .from("approval_requests")
    .insert({
      workspace_id: input.workspace_id,
      enrollment_id: input.enrollment_id ?? null,
      node_id: input.node_id ?? null,
      content_type: input.content_type,
      content: input.content,
      context: input.context ?? {},
      assigned_to: input.assigned_to ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ApprovalRequest;
}

export async function approveRequest(
  requestId: string,
  actorId: string,
  notes?: string
) {
  const { error: updateError } = await insforge.database
    .from("approval_requests")
    .update({
      status: ApprovalStatus.Approved,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) throw updateError;

  const { data, error } = await insforge.database
    .from("approval_actions")
    .insert({
      request_id: requestId,
      actor_id: actorId,
      action: ApprovalAction.Approved,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ApprovalActionRecord;
}

export async function rejectRequest(
  requestId: string,
  actorId: string,
  notes?: string
) {
  const { error: updateError } = await insforge.database
    .from("approval_requests")
    .update({
      status: ApprovalStatus.Rejected,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) throw updateError;

  const { data, error } = await insforge.database
    .from("approval_actions")
    .insert({
      request_id: requestId,
      actor_id: actorId,
      action: ApprovalAction.Rejected,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ApprovalActionRecord;
}

export async function editAndApproveRequest(
  requestId: string,
  actorId: string,
  editedContent: Record<string, unknown>,
  notes?: string
) {
  const { error: updateError } = await insforge.database
    .from("approval_requests")
    .update({
      status: ApprovalStatus.Edited,
      content: editedContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) throw updateError;

  const { data, error } = await insforge.database
    .from("approval_actions")
    .insert({
      request_id: requestId,
      actor_id: actorId,
      action: ApprovalAction.Edited,
      edited_content: editedContent,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ApprovalActionRecord;
}
