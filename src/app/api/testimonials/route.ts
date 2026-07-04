import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getTestimonialRequests,
  getTestimonials,
} from "@/lib/data/testimonials";

export async function GET() {
  try {
    const tenant = await requireTenantContext();

    const [testimonials, requests] = await Promise.all([
      getTestimonials(tenant.workspaceId),
      getTestimonialRequests(tenant.workspaceId),
    ]);

    return NextResponse.json({ testimonials, requests });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/testimonials error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
