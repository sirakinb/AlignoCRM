import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getTenantContextForUser } from "@/lib/data/organizations";
import {
  createApiKeyForUser,
  getActiveApiKeyForUser,
  maskApiKey,
  revokeActiveApiKeyForUser,
} from "@/lib/data/api-keys";

function serializeApiKey(record: Awaited<ReturnType<typeof getActiveApiKeyForUser>>) {
  if (!record) return null;

  return {
    id: record.id,
    name: record.name,
    maskedKey: maskApiKey(record),
    createdAt: record.created_at,
    lastUsedAt: record.last_used_at,
  };
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tenant = await getTenantContextForUser(user);
    const record = await getActiveApiKeyForUser(user.id, tenant.organizationId);
    return NextResponse.json({ apiKey: serializeApiKey(record) });
  } catch (error) {
    console.error("GET /api/settings/api-key error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "Default API key";

    const tenant = await getTenantContextForUser(user);
    const { apiKey, record } = await createApiKeyForUser({
      userId: user.id,
      organizationId: tenant.organizationId,
      name,
    });

    return NextResponse.json(
      {
        apiKey: {
          id: record.id,
          name: record.name,
          maskedKey: maskApiKey(record),
          createdAt: record.created_at,
          lastUsedAt: record.last_used_at,
          key: apiKey,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/settings/api-key error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tenant = await getTenantContextForUser(user);
    await revokeActiveApiKeyForUser(user.id, tenant.organizationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/settings/api-key error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
