import { insforge } from "@/lib/insforge/server";
import type { BusinessEvent } from "@/types/events";
import type { Workflow, WorkflowVersion } from "@/types/workflow";
import { WorkflowStatus } from "@/types/workflow";
import { EnrollmentStatus } from "@/types/enrollment";
import type { WorkflowEnrollment } from "@/types/enrollment";
import { createEnrollment } from "@/lib/data/enrollments";
import { advanceWorkflow } from "@/lib/workflows/executor";

export async function matchEventToWorkflows(
  event: BusinessEvent
): Promise<Workflow[]> {
  const { data, error } = await insforge.database
    .from("workflows")
    .select()
    .eq("workspace_id", event.workspace_id)
    .eq("status", WorkflowStatus.Published)
    .eq("trigger_type", event.event_type);

  if (error) throw error;

  const workflows = (data as Workflow[]) ?? [];

  return workflows.filter((workflow) => {
    const filters = workflow.trigger_config?.filters as
      | Record<string, unknown>
      | undefined;
    if (!filters) return true;
    return matchesFilters(event.payload, filters);
  });
}

function matchesFilters(
  payload: unknown,
  filters: Record<string, unknown>
): boolean {
  const p = payload as Record<string, unknown>;
  for (const [key, expected] of Object.entries(filters)) {
    if (p[key] !== expected) {
      return false;
    }
  }
  return true;
}

export async function enrollRecord(
  workflowId: string,
  workflowVersionId: string,
  recordId: string,
  recordType: string,
  workspaceId: string
): Promise<WorkflowEnrollment | null> {
  // Check re-enrollment rules
  const { data: workflow, error: wfError } = await insforge.database
    .from("workflows")
    .select()
    .eq("id", workflowId)
    .single();

  if (wfError) throw wfError;
  const wf = workflow as Workflow;

  if (!wf.allow_re_enrollment) {
    // Check if already enrolled (active or paused) for this workflow
    const { data: existing, error: existError } = await insforge.database
      .from("workflow_enrollments")
      .select()
      .eq("workflow_id", workflowId)
      .eq("record_id", recordId)
      .in("status", [EnrollmentStatus.Active, EnrollmentStatus.Paused]);

    if (existError) throw existError;
    if (existing && (existing as WorkflowEnrollment[]).length > 0) {
      return null; // Already enrolled, skip
    }
  }

  return createEnrollment({
    workspace_id: workspaceId,
    workflow_id: workflowId,
    workflow_version_id: workflowVersionId,
    record_id: recordId,
    record_type: recordType,
  });
}

export async function processEvent(event: BusinessEvent): Promise<void> {
  const workflows = await matchEventToWorkflows(event);

  for (const workflow of workflows) {
    // Get latest published version
    const { data: version, error: vError } = await insforge.database
      .from("workflow_versions")
      .select()
      .eq("workflow_id", workflow.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (vError || !version) continue;
    const wfVersion = version as WorkflowVersion;

    // For deal events, resolve the contact_id from the deal
    let contactId = event.record_id;
    if (event.record_type === "deal") {
      const { data: deal } = await insforge.database
        .from("deals")
        .select("contact_id")
        .eq("id", event.record_id)
        .single();
      if (deal?.contact_id) {
        contactId = deal.contact_id;
      }
    }

    const enrollment = await enrollRecord(
      workflow.id,
      wfVersion.id,
      contactId,
      "contact",
      event.workspace_id
    );

    if (enrollment) {
      try {
        await advanceWorkflow(enrollment.id);
      } catch (advanceError) {
        console.error(`[processEvent] advanceWorkflow failed for enrollment ${enrollment.id}:`, advanceError);
      }
    }
  }
}
