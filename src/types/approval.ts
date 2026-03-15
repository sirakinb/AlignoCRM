// Approval system types

export enum ApprovalStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Edited = "edited",
}

export enum ApprovalAction {
  Approved = "approved",
  Rejected = "rejected",
  Edited = "edited",
}

export enum ApprovalContentType {
  EmailDraft = "email_draft",
  SmsDraft = "sms_draft",
  AiAnalysis = "ai_analysis",
  AiRoute = "ai_route",
}

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  enrollment_id: string | null;
  node_id: string | null;
  content_type: ApprovalContentType;
  content: Record<string, unknown>;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalActionRecord {
  id: string;
  request_id: string;
  actor_id: string;
  action: ApprovalAction;
  edited_content: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
}

export interface CreateApprovalInput {
  workspace_id: string;
  enrollment_id?: string | null;
  node_id?: string | null;
  content_type: ApprovalContentType;
  content: Record<string, unknown>;
  context?: Record<string, unknown>;
  assigned_to?: string | null;
}
