import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getCampaign, getCampaignRecipients } from "@/lib/data/campaigns";

/** GET /api/campaigns/[id]/recipients — per-recipient status table (P4-22). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    // fetch-by-id-AND-workspace → a cross-tenant campaign id is 404 (P4-07).
    const campaign = await getCampaign(id, tenant.workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const limitRaw = Math.floor(Number(url.searchParams.get("limit")));
    const offsetRaw = Math.floor(Number(url.searchParams.get("offset")));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.min(offsetRaw, 1_000_000) : 0;

    const recipients = await getCampaignRecipients(id, tenant.workspaceId, {
      limit,
      offset,
    });
    return NextResponse.json({ recipients, campaign });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/campaigns/[id]/recipients error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
