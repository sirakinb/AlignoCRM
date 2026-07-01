import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getContact } from "@/lib/data/contacts";
import { getDeal } from "@/lib/data/deals";
import { getPipeline, getStage } from "@/lib/data/pipelines";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const deal = await getDeal(id);

    if (deal.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [contact, pipeline, stage] = await Promise.all([
      deal.contact_id ? getContact(deal.contact_id) : Promise.resolve(null),
      getPipeline(deal.pipeline_id),
      getStage(deal.stage_id),
    ]);

    if (contact && contact.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ deal, contact, pipeline, stage });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/deals/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
