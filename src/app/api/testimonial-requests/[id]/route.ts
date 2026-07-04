import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  deleteTestimonialRequest,
  updateTestimonialRequestStatus,
} from "@/lib/data/testimonials";
import type { TestimonialRequestStatus } from "@/types/crm";

const VALID_STATUSES: TestimonialRequestStatus[] = [
  "pending",
  "completed",
  "archived",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const body = await request.json();
    const status = body.status as TestimonialRequestStatus;

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const testimonialRequest = await updateTestimonialRequestStatus(
      id,
      tenant.workspaceId,
      status
    );

    return NextResponse.json({ request: testimonialRequest });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("PATCH /api/testimonial-requests/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    await deleteTestimonialRequest(id, tenant.workspaceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("DELETE /api/testimonial-requests/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
