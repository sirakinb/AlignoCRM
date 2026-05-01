import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getContacts } from "@/lib/data/contacts";
import { getContactTagsMap, getTags } from "@/lib/data/tags";

export async function GET() {
  try {
    const tenant = await requireTenantContext();

    const [contacts, tags] = await Promise.all([
      getContacts(tenant.workspaceId),
      getTags(tenant.workspaceId),
    ]);
    const contactTagsMap =
      contacts.length > 0
        ? await getContactTagsMap(contacts.map((contact) => contact.id))
        : {};

    return NextResponse.json({ contacts, tags, contactTagsMap });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/contacts/summary error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
