import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  refreshA2pStatus,
  SmsComplianceError,
} from "@/lib/messaging/sms-compliance";

export async function POST() {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const profile = await refreshA2pStatus({ workspaceId: tenant.workspaceId });
    return NextResponse.json({ profile });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof SmsComplianceError) {
      const status =
        error.code === "not_found" ? 404 : error.code === "provider" ? 502 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("POST /api/messaging/sms-compliance/status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
