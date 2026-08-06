import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { resolveConversationForContact } from "@/lib/data/conversations";

/**
 * Resolve (find-or-create) the conversation for a contact, for the contact-drawer
 * "Message" deep link (P3-20). POST because it may create a row. The contact is
 * verified to belong to the workspace, so a foreign id returns 404.
 */
export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json().catch(() => ({}));
    const contactId = body.contactId ?? body.contact_id;

    if (typeof contactId !== "string" || contactId.trim().length === 0) {
      return NextResponse.json(
        { error: "contactId is required.", field: "contactId" },
        { status: 400 }
      );
    }

    const conversationId = await resolveConversationForContact(
      tenant.workspaceId,
      contactId
    );
    if (!conversationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ conversationId });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/conversations/resolve error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
