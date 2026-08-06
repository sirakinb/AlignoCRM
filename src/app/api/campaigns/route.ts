import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { listCampaigns, createCampaign } from "@/lib/data/campaigns";
import { getTemplate } from "@/lib/data/templates";
import { validateAudience, AudienceError } from "@/lib/messaging/campaign-audience";
import type { MessageChannel } from "@/types/messaging";

const MAX_NAME = 200;
const MAX_SUBJECT = 512;
const MAX_BODY = 100_000;

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const campaigns = await listCampaigns(tenant.workspaceId);
    return NextResponse.json({ campaigns });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/campaigns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/campaigns — create a draft campaign (P4-05). */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const tenant = await requireTenantContext();
    const body = await request.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME) {
      return NextResponse.json(
        { error: "name is required (max 200 chars).", field: "name" },
        { status: 400 }
      );
    }
    const channel: MessageChannel = body.channel === "sms" ? "sms" : "email";

    let subject: string | null = null;
    if (channel === "email" && body.subject != null) {
      if (typeof body.subject !== "string" || body.subject.length > MAX_SUBJECT) {
        return NextResponse.json(
          { error: "subject is invalid.", field: "subject" },
          { status: 400 }
        );
      }
      subject = body.subject;
    }

    const campaignBody = typeof body.body === "string" ? body.body : "";
    if (campaignBody.length > MAX_BODY) {
      return NextResponse.json(
        { error: "body is too long.", field: "body" },
        { status: 400 }
      );
    }

    // Audience is validated even at draft time so a malformed selector is caught
    // early; `all` is exclusive (A-12b). Empty draft audiences are allowed.
    let audience;
    try {
      audience =
        body.audience && Object.keys(body.audience).length > 0
          ? validateAudience(body.audience)
          : {};
    } catch (err) {
      if (err instanceof AudienceError) {
        return NextResponse.json({ error: err.message, field: "audience" }, { status: 400 });
      }
      throw err;
    }

    // template_id, when supplied, MUST belong to the workspace (REQ-SEC-15.5).
    let templateId: string | null = null;
    if (body.template_id != null) {
      if (typeof body.template_id !== "string") {
        return NextResponse.json(
          { error: "template_id must be a string.", field: "template_id" },
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
      templateId = body.template_id;
    }

    const campaign = await createCampaign({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      channel,
      name,
      subject,
      body: campaignBody,
      template_id: templateId,
      audience,
      created_by: user?.id ?? null,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/campaigns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
