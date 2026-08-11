import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { setDefaultPhoneNumber, PhoneNumberError } from "@/lib/messaging/phone-numbers";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const params = await Promise.resolve(context.params);
    const number = await setDefaultPhoneNumber(tenant.workspaceId, params.id);
    return NextResponse.json({ number });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof PhoneNumberError) {
      const status = error.code === "not_found" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("POST /api/messaging/phone-numbers/[id]/default error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
