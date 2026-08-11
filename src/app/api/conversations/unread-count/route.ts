import { NextResponse } from "next/server";
import { tenantErrorResponse } from "@/lib/auth/tenant";
import { requireTenantContextFromRequest } from "@/lib/api/internal-auth";
import { countUnreadConversations } from "@/lib/data/conversations";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContextFromRequest(request);
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
