import { NextResponse } from "next/server";
import { createTask } from "@/lib/data/tasks";
import { getContact } from "@/lib/data/contacts";
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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const contactId =
      typeof body.contactId === "string" && body.contactId ? body.contactId : null;
    const dueDate =
      typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;

    if (!title) {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }

    if (contactId) {
      const contact = await getContact(contactId);
      if (contact.workspace_id !== tenant.workspaceId) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
    }

    const task = await createTask({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      title,
      description: description || null,
      contact_id: contactId,
      due_date: dueDate,
      status: "pending",
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return unauthorizedInternalApiResponse();

    console.error("POST /api/agent/tasks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
