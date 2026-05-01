import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getContact } from "@/lib/data/contacts";
import { addTagToContact, getTag, removeTagFromContact } from "@/lib/data/tags";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const body = await request.json();
    const tagId = typeof body.tagId === "string" ? body.tagId : "";

    if (!tagId) {
      return NextResponse.json(
        { error: "Missing required field: tagId" },
        { status: 400 }
      );
    }

    const [contact, tag] = await Promise.all([getContact(id), getTag(tagId)]);
    if (
      contact.workspace_id !== tenant.workspaceId ||
      tag.workspace_id !== tenant.workspaceId
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const contactTag = await addTagToContact(id, tagId, tenant.workspaceId);
    return NextResponse.json({ contactTag }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/contacts/[id]/tags error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get("tagId") ?? "";

    if (!tagId) {
      return NextResponse.json(
        { error: "Missing required parameter: tagId" },
        { status: 400 }
      );
    }

    const [contact, tag] = await Promise.all([getContact(id), getTag(tagId)]);
    if (
      contact.workspace_id !== tenant.workspaceId ||
      tag.workspace_id !== tenant.workspaceId
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await removeTagFromContact(id, tagId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("DELETE /api/contacts/[id]/tags error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

