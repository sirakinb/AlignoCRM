import { NextResponse } from "next/server";
import { getContacts } from "@/lib/data/contacts";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "default";

    const contacts = await getContacts(workspaceId);
    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("GET /api/contacts error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
