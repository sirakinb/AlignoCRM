import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getTemplates, createTemplate } from "@/lib/data/templates";
import { extractVariables } from "@/lib/messaging/interpolation";
import type { MessageChannel } from "@/types/messaging";

const MAX_NAME = 200;
const MAX_SUBJECT = 512;
const MAX_BODY = 100_000;

/** GET /api/templates?channel=email|sms — list workspace templates (P4-01/P4-02). */
export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel");

    let templates = await getTemplates(tenant.workspaceId);
    if (channel === "email" || channel === "sms") {
      templates = templates.filter((t) => t.channel === channel);
    }
    return NextResponse.json({ templates });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/templates error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/templates — create a template in the caller's workspace (P4-02). */
export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json().catch(() => ({}));

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME) {
      return NextResponse.json(
        { error: "name is required (max 200 chars).", field: "name" },
        { status: 400 }
      );
    }
    if (typeof body.body !== "string" || body.body.length === 0) {
      return NextResponse.json(
        { error: "body is required.", field: "body" },
        { status: 400 }
      );
    }
    if (body.body.length > MAX_BODY) {
      return NextResponse.json(
        { error: "body is too long.", field: "body" },
        { status: 400 }
      );
    }
    const channel: MessageChannel = body.channel === "sms" ? "sms" : "email";
    let subject: string | null = null;
    if (channel === "email") {
      if (body.subject != null && typeof body.subject !== "string") {
        return NextResponse.json(
          { error: "subject must be a string.", field: "subject" },
          { status: 400 }
        );
      }
      subject = typeof body.subject === "string" ? body.subject : null;
      if (subject && subject.length > MAX_SUBJECT) {
        return NextResponse.json(
          { error: "subject is too long.", field: "subject" },
          { status: 400 }
        );
      }
    }

    const template = await createTemplate({
      workspace_id: tenant.workspaceId,
      name,
      body: body.body,
      subject,
      channel,
      variables: extractVariables(body.body),
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/templates error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
