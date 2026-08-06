import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
} from "@/lib/data/campaigns";
import { getTemplate } from "@/lib/data/templates";
import { validateAudience, AudienceError } from "@/lib/messaging/campaign-audience";

const MAX_NAME = 200;
const MAX_SUBJECT = 512;
const MAX_BODY = 100_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const campaign = await getCampaign(id, tenant.workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH — draft editing only. A sending/sent campaign is immutable (P4-06). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    const campaign = await getCampaign(id, tenant.workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft campaigns can be edited." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > MAX_NAME) {
        return NextResponse.json({ error: "name is invalid.", field: "name" }, { status: 400 });
      }
      patch.name = name;
    }
    if (body.subject !== undefined) {
      if (body.subject !== null && typeof body.subject !== "string") {
        return NextResponse.json({ error: "subject invalid.", field: "subject" }, { status: 400 });
      }
      if (typeof body.subject === "string" && body.subject.length > MAX_SUBJECT) {
        return NextResponse.json({ error: "subject too long.", field: "subject" }, { status: 400 });
      }
      patch.subject = body.subject;
    }
    if (body.body !== undefined) {
      if (typeof body.body !== "string" || body.body.length > MAX_BODY) {
        return NextResponse.json({ error: "body invalid.", field: "body" }, { status: 400 });
      }
      patch.body = body.body;
    }
    if (body.channel !== undefined) {
      if (body.channel !== "email" && body.channel !== "sms") {
        return NextResponse.json({ error: "channel invalid.", field: "channel" }, { status: 400 });
      }
      patch.channel = body.channel;
    }
    if (body.audience !== undefined) {
      try {
        patch.audience = validateAudience(body.audience);
      } catch (err) {
        if (err instanceof AudienceError) {
          return NextResponse.json({ error: err.message, field: "audience" }, { status: 400 });
        }
        throw err;
      }
    }
    if (body.template_id !== undefined) {
      if (body.template_id === null) {
        patch.template_id = null;
      } else {
        if (typeof body.template_id !== "string") {
          return NextResponse.json(
            { error: "template_id invalid.", field: "template_id" },
            { status: 400 }
          );
        }
        const template = await getTemplate(body.template_id, tenant.workspaceId).catch(
          () => null
        );
        if (!template) {
          return NextResponse.json(
            { error: "template not found.", field: "template_id" },
            { status: 400 }
          );
        }
        patch.template_id = body.template_id;
      }
    }

    const updated = await updateCampaign(id, tenant.workspaceId, patch);
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("PATCH /api/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE — draft only (P4-06). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    const campaign = await getCampaign(id, tenant.workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft campaigns can be deleted." },
        { status: 409 }
      );
    }
    await deleteCampaign(id, tenant.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("DELETE /api/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
