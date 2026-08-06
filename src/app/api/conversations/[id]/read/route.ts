import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { markConversationRead } from "@/lib/data/conversations";

/**
 * Mark a thread read. POST-only by design (REQ-SEC / contract f): mail-client
 * link scanners and browser prefetch issue GETs, so a GET that mutates would
 * clear unread badges without the user reading anything. Workspace-scoped and
 * idempotent (P3-08/P3-09).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    const found = await markConversationRead(tenant.workspaceId, id);
    if (!found) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/conversations/[id]/read error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
