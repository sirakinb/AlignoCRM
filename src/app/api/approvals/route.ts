import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getApprovalRequests } from "@/lib/data/approvals";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const approvals = await getApprovalRequests(tenant.workspaceId);
    return NextResponse.json({ approvals });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/approvals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

