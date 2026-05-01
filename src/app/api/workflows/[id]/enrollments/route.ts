import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getEnrollments, getExecutionSteps } from "@/lib/data/enrollments";
import { getWorkflow } from "@/lib/data/workflows";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const workflow = await getWorkflow(id);

    if (workflow.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const enrollments = await getEnrollments(tenant.workspaceId, {
      workflow_id: id,
    });
    const enriched = await Promise.all(
      enrollments.map(async (enrollment) => ({
        ...enrollment,
        steps: await getExecutionSteps(enrollment.id),
      }))
    );

    return NextResponse.json({ enrollments: enriched });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/workflows/[id]/enrollments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

