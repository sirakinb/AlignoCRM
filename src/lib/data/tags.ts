import { insforge } from "@/lib/insforge/client";
import type { Tag, ContactTag, CreateTagInput } from "@/types/crm";
import { emitEvent } from "@/lib/events/emitter";
import { BusinessEventType } from "@/types/events";

export async function getContactTags(contactId: string): Promise<Tag[]> {
  const { data, error } = await insforge.database
    .from("contact_tags")
    .select("tag_id, tags(*)")
    .eq("contact_id", contactId);

  if (error) throw error;
  return (data ?? []).map((row: any) => row.tags as Tag);
}

export async function getContactTagsMap(
  contactIds: string[]
): Promise<Record<string, Tag[]>> {
  if (contactIds.length === 0) return {};

  const { data, error } = await insforge.database
    .from("contact_tags")
    .select("contact_id, tag_id, tags(*)")
    .in("contact_id", contactIds);

  if (error) throw error;

  const map: Record<string, Tag[]> = {};
  for (const row of data ?? []) {
    const r = row as any;
    if (!map[r.contact_id]) map[r.contact_id] = [];
    if (r.tags) map[r.contact_id].push(r.tags as Tag);
  }
  return map;
}

export async function getTags(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("tags")
    .select()
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data as Tag[];
}

export async function getTag(id: string) {
  const { data, error } = await insforge.database
    .from("tags")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Tag;
}

export async function createTag(input: CreateTagInput) {
  const { data, error } = await insforge.database
    .from("tags")
    .insert({ id: crypto.randomUUID(), ...input })
    .select()
    .single();

  if (error) throw error;
  return data as Tag;
}

export async function addTagToContact(
  contactId: string,
  tagId: string,
  workspaceId?: string
) {
  const { data, error } = await insforge.database
    .from("contact_tags")
    .insert({ contact_id: contactId, tag_id: tagId })
    .select()
    .single();

  if (error) throw error;
  const contactTag = data as ContactTag;

  if (workspaceId) {
    const { data: tagData } = await insforge.database
      .from("tags")
      .select()
      .eq("id", tagId)
      .single();

    await emitEvent({
      workspace_id: workspaceId,
      event_type: BusinessEventType.TagAdded,
      record_id: contactId,
      record_type: "contact",
      payload: {
        contactId,
        tagId,
        tagName: tagData?.name ?? "",
      },
    });
  }

  return contactTag;
}

export async function deleteTag(tagId: string) {
  // Remove all contact associations first
  await insforge.database
    .from("contact_tags")
    .delete()
    .eq("tag_id", tagId);

  const { error } = await insforge.database
    .from("tags")
    .delete()
    .eq("id", tagId);

  if (error) throw error;
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const { error } = await insforge.database
    .from("contact_tags")
    .delete()
    .eq("contact_id", contactId)
    .eq("tag_id", tagId);

  if (error) throw error;
}
