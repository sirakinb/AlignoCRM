import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { listTollfreeVerifications } from "@/lib/messaging/sms-compliance";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const verifications = await listTollfreeVerifications(tenant.workspaceId);
    return NextResponse.json({ verifications });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/sms-compliance/tollfree error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
