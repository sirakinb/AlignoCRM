import { NextResponse } from "next/server";
import { getContact } from "@/lib/data/contacts";
import { getContactTags, getTags } from "@/lib/data/tags";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "default";
    const { id } = await params;

    const [contact, contactTags, tags] = await Promise.all([
      getContact(id),
      getContactTags(id),
      getTags(workspaceId),
    ]);

    return NextResponse.json({ contact, contactTags, tags });
  } catch (error) {
    console.error("GET /api/contacts/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
