import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    return NextResponse.json({
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      role: tenant.role,
      organization: tenant.organization,
    });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/tenant error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

