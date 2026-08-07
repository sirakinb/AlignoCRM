import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import {
  submitTollfreeVerification,
  refreshTollfreeVerification,
  listTollfreeVerifications,
  SmsComplianceError,
} from "@/lib/messaging/sms-compliance";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const tenant = await requireTenantContext();
    const params = await Promise.resolve(context.params);
    const all = await listTollfreeVerifications(tenant.workspaceId);
    const verifications = all.filter((v) => v.phone_number_id === params.id);
    return NextResponse.json({ verifications });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/phone-numbers/[id]/verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const allowed = await checkRateLimit(
      `tfv-submit:${tenant.workspaceId}`,
      RATE_LIMITS.phoneNumberMutations.limit,
      RATE_LIMITS.phoneNumberMutations.windowMs
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const params = await Promise.resolve(context.params);
    const user = await getAuthenticatedUser();
    const body = await request.json().catch(() => ({}));

    const verification = await submitTollfreeVerification({
      workspaceId: tenant.workspaceId,
      organizationId: tenant.organizationId,
      payload: { ...body, phoneNumberId: params.id },
      createdBy: user?.id,
    });

    return NextResponse.json({ verification }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof SmsComplianceError) {
      const status =
        error.code === "not_found"
          ? 404
          : error.code === "conflict"
            ? 409
            : error.code === "provider"
              ? 502
              : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("POST /api/messaging/phone-numbers/[id]/verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const params = await Promise.resolve(context.params);
    const body = await request.json().catch(() => ({}));
    const verificationId =
      typeof body.verificationId === "string" ? body.verificationId : null;
    if (!verificationId) {
      return NextResponse.json({ error: "verificationId is required" }, { status: 400 });
    }

    // Ensure the verification belongs to this phone number + workspace.
    const listed = await listTollfreeVerifications(tenant.workspaceId);
    const match = listed.find(
      (v) => v.id === verificationId && v.phone_number_id === params.id
    );
    if (!match) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 });
    }

    const verification = await refreshTollfreeVerification({
      workspaceId: tenant.workspaceId,
      id: verificationId,
    });
    return NextResponse.json({ verification });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof SmsComplianceError) {
      const status =
        error.code === "not_found" ? 404 : error.code === "provider" ? 502 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("PATCH /api/messaging/phone-numbers/[id]/verify error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
