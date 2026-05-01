import { NextResponse } from "next/server";
import { getContacts, createContact } from "@/lib/data/contacts";
import {
  addTagToContact,
  createTag,
  getTags,
} from "@/lib/data/tags";
import {
  isInternalApiRequestAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/api/internal-auth";
import { getStringPurpleColor } from "@/lib/design/aligno-theme";
import type { Tag } from "@/types/crm";

const DEFAULT_WORKSPACE_ID = "default";

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ") || "-";

  return { firstName, lastName };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeSourceTagName(source: string) {
  return `source:${source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

async function getOrCreateSourceTag(workspaceId: string, source: string) {
  const tagName = normalizeSourceTagName(source);
  const tags = await getTags(workspaceId);
  const existingTag = tags.find(
    (tag) => tag.name.toLowerCase() === tagName.toLowerCase()
  );

  if (existingTag) return existingTag;

  return createTag({
    workspace_id: workspaceId,
    name: tagName,
    color: getStringPurpleColor(tagName),
  });
}

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

export async function POST(request: Request) {
  try {
    if (!(await isInternalApiRequestAuthorized(request))) {
      return unauthorizedInternalApiResponse();
    }

    const body = await request.json();
    const name = normalizeString(body.name);
    const email = normalizeString(body.email);
    const phone = normalizeString(body.phone);
    const source = normalizeString(body.source);
    const workspaceId = normalizeString(body.workspace_id) || DEFAULT_WORKSPACE_ID;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Provide at least one contact method: email or phone" },
        { status: 400 }
      );
    }

    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (!source) {
      return NextResponse.json(
        { error: "Missing required field: source" },
        { status: 400 }
      );
    }

    const { firstName, lastName } = splitName(name);
    const contact = await createContact({
      workspace_id: workspaceId,
      first_name: firstName,
      last_name: lastName,
      email: email || undefined,
      phone: phone || undefined,
      status: "active",
    });

    let sourceTag: Tag | null = null;
    try {
      sourceTag = await getOrCreateSourceTag(workspaceId, source);
      await addTagToContact(contact.id, sourceTag.id, workspaceId);
    } catch (tagError) {
      console.error("POST /api/contacts source tag error:", tagError);
    }

    return NextResponse.json(
      {
        contactId: contact.id,
        sourceTagId: sourceTag?.id ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/contacts error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
