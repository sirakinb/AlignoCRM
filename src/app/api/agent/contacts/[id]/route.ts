import { NextResponse } from "next/server";
import { getContact } from "@/lib/data/contacts";
import { getContactTags } from "@/lib/data/tags";
import {
  getInternalApiAuthContext,
  unauthorizedInternalApiResponse,
} from "@/lib/api/internal-auth";
import {
  requireTenantContext,
  tenantErrorResponse,
} from "@/lib/auth/tenant";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await getInternalApiAuthContext(request);
    const tenant = authContext.authorized
      ? authContext.tenant
      : await requireTenantContext();

    const { id } = await params;
    const [contact, contactTags] = await Promise.all([
      getContact(id),
      getContactTags(id),
    ]);

    if (contact.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ contact, contactTags });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return unauthorizedInternalApiResponse();

    console.error("GET /api/agent/contacts/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
