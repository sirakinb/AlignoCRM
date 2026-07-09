import { NextResponse } from "next/server";
import {
  exportOptions,
  exportCorsHeaders,
  requireExportTenant,
} from "@/lib/api/export-api";
import { getContacts } from "@/lib/data/contacts";

export const OPTIONS = exportOptions;

export async function GET(request: Request) {
  try {
    const { tenant, response } = await requireExportTenant(request);
    if (response) return response;

    const contacts = await getContacts(tenant.workspaceId);
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        count: contacts.length,
        contacts,
      },
      { headers: exportCorsHeaders }
    );
  } catch (error) {
    console.error("GET /api/export/contacts error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: exportCorsHeaders }
    );
  }
}
