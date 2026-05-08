import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getDeals, createDeal, updateDeal, deleteDeal } from "@/lib/data/deals";

export async function GET() {
  try {
    const tenant = await requireTenantContext();

    const deals = await getDeals(tenant.workspaceId);
    return NextResponse.json({ deals });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json();

    if (!body.pipeline_id || !body.stage_id || !body.title) {
      return NextResponse.json(
        { error: "Missing required fields: pipeline_id, stage_id, title" },
        { status: 400 }
      );
    }

    const deal = await createDeal({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      pipeline_id: body.pipeline_id,
      stage_id: body.stage_id,
      title: body.title,
      value: body.value ?? 0,
      contact_id: body.contact_id ?? null,
      owner_id: body.owner_id ?? null,
      status: body.status ?? "open",
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Verify deal belongs to this workspace
    const deals = await getDeals(tenant.workspaceId);
    const existing = deals.find((d) => d.id === id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowedKeys = ["title", "value", "contact_id", "owner_id", "status"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in fields) update[key] = fields[key];
    }

    const deal = await updateDeal(id, update);
    return NextResponse.json({ deal });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("PATCH /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get("id");

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const [deal] = await getDeals(tenant.workspaceId).then((deals) =>
      deals.filter((candidate) => candidate.id === dealId)
    );
    if (!deal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteDeal(dealId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("DELETE /api/deals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
