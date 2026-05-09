import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getApps, createApp, updateApp, deleteApp } from "@/lib/data/apps";

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const apps = await getApps(tenant.workspaceId);
    return NextResponse.json({ apps });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/apps error:", error);
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

    if (!body.name || !body.slug) {
      return NextResponse.json(
        { error: "Missing required fields: name, slug" },
        { status: 400 }
      );
    }

    const app = await createApp({
      workspace_id: tenant.workspaceId,
      ...(tenant.organizationId ? { organization_id: tenant.organizationId } : {}),
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      url: body.url ?? null,
      icon_url: body.icon_url ?? null,
      insforge_project_url: body.insforge_project_url ?? null,
      insforge_appkey: body.insforge_appkey ?? null,
    });

    return NextResponse.json({ app }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/apps error:", error);
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
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    const apps = await getApps(tenant.workspaceId);
    if (!apps.find((a) => a.id === id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowedKeys = ["name", "slug", "description", "url", "icon_url", "insforge_project_url", "insforge_appkey", "status"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in fields) update[key] = fields[key];
    }

    const app = await updateApp(id, update);
    return NextResponse.json({ app });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("PATCH /api/apps error:", error);
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
    const appId = searchParams.get("id");

    if (!appId) {
      return NextResponse.json({ error: "Missing required parameter: id" }, { status: 400 });
    }

    const apps = await getApps(tenant.workspaceId);
    if (!apps.find((a) => a.id === appId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteApp(appId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("DELETE /api/apps error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
