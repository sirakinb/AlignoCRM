import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getContact } from "@/lib/data/contacts";
import { getDeal, updateDeal } from "@/lib/data/deals";
import { getPipeline, getStage } from "@/lib/data/pipelines";
import type { DealStatus, UpdateDealInput } from "@/types/crm";

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

const ALLOWED_STATUSES: DealStatus[] = ["open", "won", "lost"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const existing = await getDeal(id);

    if (existing.workspace_id !== tenant.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: UpdateDealInput = {};

    if (body.value !== undefined) {
      const value = Number(body.value);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { error: "Value must be a number of 0 or more" },
          { status: 400 }
        );
      }
      updates.value = Math.round(value);
    }

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }

    if (typeof body.status === "string") {
      if (!ALLOWED_STATUSES.includes(body.status as DealStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status as DealStatus;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const deal = await updateDeal(id, updates);
    return NextResponse.json({ deal });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("PATCH /api/deals/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
