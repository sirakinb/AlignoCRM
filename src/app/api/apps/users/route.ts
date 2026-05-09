import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";

interface ProjectConfig {
  key: string;
  region: string;
}

function getProjectConfig(appkey: string): ProjectConfig | null {
  try {
    const config = JSON.parse(process.env.INSFORGE_PROJECTS_CONFIG || "{}");
    return config[appkey] ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    await requireTenantContext();

    const { searchParams } = new URL(request.url);
    const appkey = searchParams.get("appkey");
    const search = searchParams.get("search") ?? "";

    if (!appkey) {
      return NextResponse.json({ error: "Missing appkey parameter" }, { status: 400 });
    }

    const project = getProjectConfig(appkey);
    if (!project) {
      return NextResponse.json({
        users: [],
        stats: { total: 0 },
        error: "Project not configured",
      });
    }

    const params = new URLSearchParams({ limit: "200" });
    if (search) params.set("search", search);

    const res = await fetch(
      `https://${appkey}.${project.region}.insforge.app/api/auth/users?${params.toString()}`,
      {
        headers: {
          apikey: project.key,
          Authorization: `Bearer ${project.key}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`Failed to fetch users for ${appkey}:`, text);
      return NextResponse.json({ users: [], stats: { total: 0 }, error: text });
    }

    const data = await res.json();
    const users = (data.data ?? []).filter(
      (u: { email: string }) =>
        u.email !== "admin@example.com" && u.email !== "anon@example.com"
    );

    return NextResponse.json({
      users,
      stats: {
        total: Math.max((data.pagination?.total ?? users.length) - 2, 0),
      },
    });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/apps/users error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
