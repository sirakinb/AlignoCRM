import { NextResponse } from "next/server";
import { getContact, updateContact } from "@/lib/data/contacts";
import { createActivityLog } from "@/lib/data/activity-logs";
import {
  getInternalApiAuthContext,
  unauthorizedInternalApiResponse,
} from "@/lib/api/internal-auth";
import {
  requireTenantContext,
  tenantErrorResponse,
} from "@/lib/auth/tenant";

export async function POST(request: Request) {
  try {
    const authContext = await getInternalApiAuthContext(request);
    const tenant = authContext.authorized
      ? authContext.tenant
      : await requireTenantContext();

    const body = await request.json();
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!contactId || !note) {
      return NextResponse.json(
        { error: "Missing required fields: contactId, note" },
        { status: 400 }
      );
    }

    const contact = await getContact(contactId);
    if (contact.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const entry = `[${stamp} · Agent] ${note}`;
    const combined = contact.notes ? `${contact.notes}\n\n${entry}` : entry;

    const updated = await updateContact(contactId, { notes: combined });

    await createActivityLog({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      entity_type: "contact",
      entity_id: contactId,
      action: "agent_note_added",
      metadata: { note },
    }).catch((error) => {
      console.error("POST /api/agent/notes activity log error:", error);
    });

    return NextResponse.json({ contact: updated }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return unauthorizedInternalApiResponse();

    console.error("POST /api/agent/notes error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
