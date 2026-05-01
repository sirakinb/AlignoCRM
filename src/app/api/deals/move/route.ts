import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getDeal, moveDealStage } from "@/lib/data/deals";
import { getStage } from "@/lib/data/pipelines";

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json();

    if (!body.dealId || !body.stageId) {
      return NextResponse.json(
        { error: "Missing required fields: dealId, stageId" },
        { status: 400 }
      );
    }

    const [existingDeal, stage] = await Promise.all([
      getDeal(body.dealId),
      getStage(body.stageId),
    ]);

    if (existingDeal.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (stage.organization_id && tenant.organizationId) {
      if (stage.organization_id !== tenant.organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const updatedDeal = await moveDealStage(
      body.dealId,
      body.stageId,
      body.userId ?? undefined
    );

    return NextResponse.json({ deal: updatedDeal });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/deals/move error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
