import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getWorkflow, publishWorkflow } from "@/lib/data/workflows";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    const tenant = await requireTenantContext();
    const { id } = await params;
    const workflow = await getWorkflow(id);

    if (workflow.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await publishWorkflow(id, user?.id ?? "system");
    return NextResponse.json(result);
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/workflows/[id]/publish error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

