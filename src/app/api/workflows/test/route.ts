import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/client";
import { createEnrollment } from "@/lib/data/enrollments";
import { advanceWorkflow } from "@/lib/workflows/executor";
import type { WorkflowVersion } from "@/types/workflow";

export async function POST(request: Request) {
  try {
    const { workflowId, contactId } = await request.json();

    if (!workflowId || !contactId) {
      return NextResponse.json(
        { error: "Missing required fields: workflowId, contactId" },
        { status: 400 }
      );
    }

    // Get the latest published version
    const { data: version, error } = await insforge.database
      .from("workflow_versions")
      .select()
      .eq("workflow_id", workflowId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (error || !version) {
      return NextResponse.json(
        { error: "No published version found. Please publish the workflow first." },
        { status: 400 }
      );
    }

    const wfVersion = version as WorkflowVersion;

    // Create an enrollment for this contact
    const enrollment = await createEnrollment({
      workspace_id: "default",
      workflow_id: workflowId,
      workflow_version_id: wfVersion.id,
      record_id: contactId,
      record_type: "contact",
    });

    // Run the workflow
    await advanceWorkflow(enrollment.id);

    return NextResponse.json({ enrollmentId: enrollment.id });
  } catch (error) {
    console.error("POST /api/workflows/test error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
