"use server";

import { insforge } from "@/lib/insforge/server";
import { createEnrollment } from "@/lib/data/enrollments";
import { advanceWorkflow } from "@/lib/workflows/executor";
import type { WorkflowVersion } from "@/types/workflow";

export async function testWorkflow(
  workflowId: string,
  contactId: string
): Promise<{ enrollmentId: string }> {
  // 1. Get the latest published version
  const { data: version, error } = await insforge.database
    .from("workflow_versions")
    .select()
    .eq("workflow_id", workflowId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (error || !version) {
    throw new Error("No published version found. Please publish the workflow first.");
  }

  const wfVersion = version as WorkflowVersion;

  // 2. Create an enrollment for this contact
  const enrollment = await createEnrollment({
    workspace_id: "default",
    workflow_id: workflowId,
    workflow_version_id: wfVersion.id,
    record_id: contactId,
    record_type: "contact",
  });

  // 3. Run the workflow
  await advanceWorkflow(enrollment.id);

  return { enrollmentId: enrollment.id };
}
