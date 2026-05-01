import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createApiKeyForUser,
  getActiveApiKeyForUser,
  maskApiKey,
  revokeActiveApiKeyForUser,
} from "@/lib/data/api-keys";

interface AuthenticatedUser {
  id: string;
  email: string;
}

function getUserFromCookie(cookieValue?: string): AuthenticatedUser | null {
  if (!cookieValue) return null;

  try {
    const user = JSON.parse(cookieValue) as {
      id?: string;
      email?: string;
    };

    if (typeof user.id !== "string" || typeof user.email !== "string") return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("insforge-session")?.value;
  const user = getUserFromCookie(cookieStore.get("insforge-user")?.value);

  if (!token || !user) return null;
  return user;
}

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

    const record = await getActiveApiKeyForUser(user.id);
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

    const { apiKey, record } = await createApiKeyForUser({
      userId: user.id,
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

    await revokeActiveApiKeyForUser(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/settings/api-key error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
