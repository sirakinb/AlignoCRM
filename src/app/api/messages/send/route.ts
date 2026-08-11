import { NextResponse } from "next/server";
import { tenantErrorResponse } from "@/lib/auth/tenant";
import { requireTenantContextFromRequest } from "@/lib/api/internal-auth";
import { performSend, sendOutcomeToResponse } from "@/lib/messaging/send-request";

/**
 * Compose-new send: find or create the contact's conversation, then send. The
 * conversation is found-or-created inside sendConversationMessage(), guarded by
 * UNIQUE (workspace_id, contact_id), so a duplicate is a re-read, not a 500
 * (P3-17). The contact is loaded scoped to the workspace inside the transport
 * layer, so a foreign contactId short-circuits with a "no address" error rather
 * than reaching across tenants (REQ-SEC-15.5). Rate-limited 60/min/workspace,
 * shared with the in-thread route (REQ-SEC-17).
 */
export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContextFromRequest(request);
    const body = await request.json().catch(() => ({}));

    const contactId = body.contactId ?? body.contact_id;
    if (typeof contactId !== "string" || contactId.trim().length === 0) {
      return NextResponse.json(
        { error: "contactId is required.", field: "contactId" },
        { status: 400 }
      );
    }

    const outcome = await performSend(tenant.workspaceId, contactId, {
      channel: body.channel,
      subject: body.subject,
      body: body.body,
    });

    return sendOutcomeToResponse(outcome, "POST /api/messages/send");
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/messages/send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
