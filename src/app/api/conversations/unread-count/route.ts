import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { countUnreadConversations } from "@/lib/data/conversations";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const count = await countUnreadConversations(tenant.workspaceId);
    return NextResponse.json({ count });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/conversations/unread-count error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
