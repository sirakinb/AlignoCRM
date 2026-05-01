import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { acceptOrganizationInvite } from "@/lib/data/organizations";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing required field: token" },
        { status: 400 }
      );
    }

    const member = await acceptOrganizationInvite({ token, user });
    return NextResponse.json({ member });
  } catch (error) {
    console.error("POST /api/organizations/invites/accept error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

