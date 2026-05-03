import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { removeOrganizationMember } from "@/lib/data/organizations";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { memberId } = await params;

    if (!tenant.organizationId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    await removeOrganizationMember(memberId, tenant.organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("DELETE /api/organizations/members/[memberId] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
