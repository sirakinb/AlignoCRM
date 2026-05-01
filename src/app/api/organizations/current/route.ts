import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getOrganizationMembers } from "@/lib/data/organizations";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    if (!tenant.organizationId) {
      return NextResponse.json({
        organization: null,
        members: [],
        role: null,
      });
    }

    const members = await getOrganizationMembers(tenant.organizationId);
    return NextResponse.json({
      organization: tenant.organization,
      members,
      role: tenant.role,
    });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/organizations/current error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

