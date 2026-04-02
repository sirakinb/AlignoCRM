import { NextResponse } from "next/server";
import { getContacts } from "@/lib/data/contacts";
import { getContactTagsMap, getTags } from "@/lib/data/tags";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "default";

    const [contacts, tags] = await Promise.all([
      getContacts(workspaceId),
      getTags(workspaceId),
    ]);
    const contactTagsMap =
      contacts.length > 0
        ? await getContactTagsMap(contacts.map((contact) => contact.id))
        : {};

    return NextResponse.json({ contacts, tags, contactTagsMap });
  } catch (error) {
    console.error("GET /api/contacts/summary error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
