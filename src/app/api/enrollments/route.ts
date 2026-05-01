import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getEnrollments } from "@/lib/data/enrollments";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const enrollments = await getEnrollments(tenant.workspaceId);
    return NextResponse.json({ enrollments });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/enrollments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

