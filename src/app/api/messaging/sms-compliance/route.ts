import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import {
  getSmsProfile,
  submitA2pRegistration,
  SmsComplianceError,
} from "@/lib/messaging/sms-compliance";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const profile = await getSmsProfile(tenant.workspaceId);
    return NextResponse.json({ profile });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/sms-compliance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const allowed = await checkRateLimit(
      `sms-compliance:${tenant.workspaceId}`,
      RATE_LIMITS.phoneNumberMutations.limit,
      RATE_LIMITS.phoneNumberMutations.windowMs
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const user = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));
    const profile = await submitA2pRegistration({
      workspaceId: tenant.workspaceId,
      organizationId: tenant.organizationId,
      businessInfo: body.businessInfo ?? body,
      createdBy: user?.id,
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof SmsComplianceError) {
      const status =
        error.code === "conflict" ? 409 : error.code === "provider" ? 502 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("POST /api/messaging/sms-compliance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
