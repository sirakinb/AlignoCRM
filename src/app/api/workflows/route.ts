import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { createWorkflow, getWorkflows } from "@/lib/data/workflows";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const workflows = await getWorkflows(tenant.workspaceId);
    return NextResponse.json({ workflows });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/workflows error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const tenant = await requireTenantContext();
    const body = await request.json().catch(() => ({}));
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "Untitled Workflow";

    const workflow = await createWorkflow({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      name,
      description:
        typeof body.description === "string" ? body.description : undefined,
      created_by: user?.id ?? "system",
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/workflows error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

