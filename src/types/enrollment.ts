export enum EnrollmentStatus {
  Active = "active",
  Paused = "paused",
  Completed = "completed",
  Failed = "failed",
  Canceled = "canceled",
}

export enum StepOutcome {
  Completed = "completed",
  Failed = "failed",
  Skipped = "skipped",
  Waiting = "waiting",
  Canceled = "canceled",
}

export interface WorkflowEnrollment {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  workflow_id: string;
  workflow_version_id: string;
  record_id: string;
  record_type: string;
  current_node_id: string | null;
  status: EnrollmentStatus;
  resume_at: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionStep {
  id: string;
  organization_id?: string | null;
  enrollment_id: string;
  node_id: string;
  node_type: string;
  outcome: StepOutcome;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  provider_response: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateEnrollmentInput {
  workspace_id: string;
  organization_id?: string | null;
  workflow_id: string;
  workflow_version_id: string;
  record_id: string;
  record_type: string;
}
