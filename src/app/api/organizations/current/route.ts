import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getOrganizationMembers,
  updateOrganizationName,
} from "@/lib/data/organizations";

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

export async function PATCH(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!tenant.organizationId) {
      return NextResponse.json(
        { error: "No organization for this account" },
        { status: 400 }
      );
    }

    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json(
        { error: "Only owners and admins can rename the business" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: "Business name must be 2-100 characters" },
        { status: 400 }
      );
    }

    const organization = await updateOrganizationName(
      tenant.organizationId,
      name
    );

    return NextResponse.json({ organization });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("PATCH /api/organizations/current error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

