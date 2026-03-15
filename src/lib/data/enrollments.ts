import { insforge } from "@/lib/insforge/client";
import type {
  WorkflowEnrollment,
  ExecutionStep,
  CreateEnrollmentInput,
} from "@/types/enrollment";
import { EnrollmentStatus, StepOutcome } from "@/types/enrollment";

export interface EnrollmentFilters {
  workflow_id?: string;
  status?: EnrollmentStatus;
  record_id?: string;
}

export async function getEnrollments(
  workspaceId: string,
  filters?: EnrollmentFilters
): Promise<WorkflowEnrollment[]> {
  let query = insforge.database
    .from("workflow_enrollments")
    .select()
    .eq("workspace_id", workspaceId);

  if (filters?.workflow_id) {
    query = query.eq("workflow_id", filters.workflow_id);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.record_id) {
    query = query.eq("record_id", filters.record_id);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) throw error;
  return data as WorkflowEnrollment[];
}

export async function getEnrollment(
  id: string
): Promise<WorkflowEnrollment> {
  const { data, error } = await insforge.database
    .from("workflow_enrollments")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as WorkflowEnrollment;
}

export async function createEnrollment(
  input: CreateEnrollmentInput
): Promise<WorkflowEnrollment> {
  const { data, error } = await insforge.database
    .from("workflow_enrollments")
    .insert({
      workspace_id: input.workspace_id,
      workflow_id: input.workflow_id,
      workflow_version_id: input.workflow_version_id,
      record_id: input.record_id,
      record_type: input.record_type,
      status: EnrollmentStatus.Active,
    })
    .select()
    .single();

  if (error) throw error;
  return data as WorkflowEnrollment;
}

export async function updateEnrollment(
  id: string,
  data: Partial<
    Pick<
      WorkflowEnrollment,
      "current_node_id" | "status" | "completed_at" | "resume_at"
    >
  >
): Promise<WorkflowEnrollment> {
  const { data: updated, error } = await insforge.database
    .from("workflow_enrollments")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return updated as WorkflowEnrollment;
}

export async function getExecutionSteps(
  enrollmentId: string
): Promise<ExecutionStep[]> {
  const { data, error } = await insforge.database
    .from("execution_steps")
    .select()
    .eq("enrollment_id", enrollmentId)
    .order("started_at", { ascending: true });

  if (error) throw error;
  return data as ExecutionStep[];
}

export async function getEnrollmentsForWorkflow(workflowId: string) {
  const enrollments = await getEnrollments("default", {
    workflow_id: workflowId,
  });
  const enriched = await Promise.all(
    enrollments.map(async (e) => ({
      ...e,
      steps: await getExecutionSteps(e.id),
    }))
  );
  return enriched;
}

export async function getResumableEnrollments(): Promise<WorkflowEnrollment[]> {
  const { data, error } = await insforge.database
    .from("workflow_enrollments")
    .select()
    .eq("status", EnrollmentStatus.Paused)
    .not("resume_at", "is", null)
    .lte("resume_at", new Date().toISOString());

  if (error) throw error;
  return data as WorkflowEnrollment[];
}

/**
 * Atomically claim a paused enrollment for resume.
 * Returns the updated enrollment if it was still paused (i.e., we won the race),
 * or null if another caller already claimed it.
 */
export async function claimEnrollmentForResume(
  id: string
): Promise<WorkflowEnrollment | null> {
  const { data, error } = await insforge.database
    .from("workflow_enrollments")
    .update({ status: EnrollmentStatus.Active, resume_at: null })
    .eq("id", id)
    .eq("status", EnrollmentStatus.Paused)
    .select()
    .single();

  if (error) {
    // No row matched — another caller already claimed it
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as WorkflowEnrollment;
}

export async function createExecutionStep(
  input: Pick<
    ExecutionStep,
    "enrollment_id" | "node_id" | "node_type" | "outcome"
  > &
    Partial<
      Pick<
        ExecutionStep,
        "error_message" | "provider_response" | "metadata" | "completed_at"
      >
    >
): Promise<ExecutionStep> {
  const { data, error } = await insforge.database
    .from("execution_steps")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as ExecutionStep;
}
