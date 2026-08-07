import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  listEmailConnections,
  updateEmailConnection,
  deleteEmailConnection,
  type UpdateEmailConnectionInput,
} from "@/lib/messaging/email-connections";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const connections = await listEmailConnections(tenant.workspaceId);
    return NextResponse.json({ connections });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/email/connections error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const input: UpdateEmailConnectionInput = {};
    if (typeof body.display_name === "string") input.displayName = body.display_name;
    if (typeof body.signature === "string") input.signature = body.signature;
    if (typeof body.is_default === "boolean") input.isDefault = body.is_default;

    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const connection = await updateEmailConnection(tenant.workspaceId, id, input);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({ connection });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("PATCH /api/messaging/email/connections error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    await deleteEmailConnection(tenant.workspaceId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("DELETE /api/messaging/email/connections error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
