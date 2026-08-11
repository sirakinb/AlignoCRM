import { NextResponse } from "next/server";
import { tenantErrorResponse } from "@/lib/auth/tenant";
import { requireTenantContextFromRequest } from "@/lib/api/internal-auth";
import { getConversationDetail } from "@/lib/data/conversations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContextFromRequest(request);
    const { id } = await params;
    const url = new URL(request.url);

    // Floor + bound both — a fractional value (e.g. ?offset=1.5) reaches
    // PostgREST's .range() and 500s, and an unbounded offset is a DoS lever (LOW #5).
    const limitRaw = Math.floor(Number(url.searchParams.get("limit")));
    const offsetRaw = Math.floor(Number(url.searchParams.get("offset")));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.min(offsetRaw, 100_000) : 0;

    const detail = await getConversationDetail(tenant.workspaceId, id, {
      limit,
      offset,
    });
    // fetch-by-id-AND-workspace: a cross-tenant id resolves to null → 404, never
    // a leaked row (REQ-SEC-15.2, P3-02).
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/conversations/[id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
