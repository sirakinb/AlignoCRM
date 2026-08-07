import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { releasePhoneNumber, PhoneNumberError } from "@/lib/messaging/phone-numbers";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const allowed = await checkRateLimit(
      `phone-release:${tenant.workspaceId}`,
      RATE_LIMITS.phoneNumberMutations.limit,
      RATE_LIMITS.phoneNumberMutations.windowMs
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const params = await Promise.resolve(context.params);
    await releasePhoneNumber(tenant.workspaceId, params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof PhoneNumberError) {
      const status = error.code === "not_found" ? 404 : error.code === "provider" ? 502 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("DELETE /api/messaging/phone-numbers/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
