import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getConversationContactId } from "@/lib/data/conversations";
import { performSend, sendOutcomeToResponse } from "@/lib/messaging/send-request";

/**
 * Send a message within an existing thread. The contact is resolved from the
 * conversation row (fetch-by-id-AND-workspace), never from the request body, so
 * a cross-tenant conversation id returns 404 (P3-02). Rate-limited 60/min/workspace,
 * shared with /api/messages/send (REQ-SEC-17).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    const contactId = await getConversationContactId(tenant.workspaceId, id);
    if (!contactId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const outcome = await performSend(tenant.workspaceId, contactId, {
      channel: body.channel,
      subject: body.subject,
      body: body.body,
    });

    return sendOutcomeToResponse(outcome, "POST /api/conversations/[id]/messages");
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/conversations/[id]/messages error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
