import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/data/templates";
import { extractVariables } from "@/lib/messaging/interpolation";

const MAX_NAME = 200;
const MAX_SUBJECT = 512;
const MAX_BODY = 100_000;

/**
 * All three handlers are fetch-by-id-AND-workspace via the data layer (which
 * takes workspaceId), so another workspace's template id resolves to "not found"
 * → 404, never a leaked or mutated row (REQ-SEC-15.2, P4-02).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;
    const template = await getTemplate(id, tenant.workspaceId).catch(() => null);
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/templates/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    const existing = await getTemplate(id, tenant.workspaceId).catch(() => null);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const patch: {
      name?: string;
      subject?: string | null;
      body?: string;
      channel?: "email" | "sms";
      variables?: string[];
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > MAX_NAME) {
        return NextResponse.json(
          { error: "name is invalid.", field: "name" },
          { status: 400 }
        );
      }
      patch.name = name;
    }
    if (body.subject !== undefined) {
      if (body.subject !== null && typeof body.subject !== "string") {
        return NextResponse.json(
          { error: "subject must be a string or null.", field: "subject" },
          { status: 400 }
        );
      }
      if (typeof body.subject === "string" && body.subject.length > MAX_SUBJECT) {
        return NextResponse.json(
          { error: "subject is too long.", field: "subject" },
          { status: 400 }
        );
      }
      patch.subject = body.subject;
    }
    if (body.body !== undefined) {
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
      patch.body = body.body;
      patch.variables = extractVariables(body.body);
    }
    if (body.channel !== undefined) {
      if (body.channel !== "email" && body.channel !== "sms") {
        return NextResponse.json(
          { error: "channel must be 'email' or 'sms'.", field: "channel" },
          { status: 400 }
        );
      }
      patch.channel = body.channel;
    }

    const template = await updateTemplate(id, tenant.workspaceId, patch);
    return NextResponse.json({ template });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("PATCH /api/templates/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    const existing = await getTemplate(id, tenant.workspaceId).catch(() => null);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await deleteTemplate(id, tenant.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("DELETE /api/templates/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
