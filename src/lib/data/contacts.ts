"use server";

import { insforge } from "@/lib/insforge/client";
import type {
  Contact,
  CreateContactInput,
  UpdateContactInput,
} from "@/types/crm";
import { emitEvent } from "@/lib/events/emitter";
import { BusinessEventType } from "@/types/events";

export async function getContacts(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("contacts")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Contact[];
}

export async function getContact(id: string) {
  const { data, error } = await insforge.database
    .from("contacts")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Contact;
}

export async function createContact(input: CreateContactInput) {
  const { data, error } = await insforge.database
    .from("contacts")
    .insert({ id: crypto.randomUUID(), ...input })
    .select()
    .single();

  if (error) throw error;
  const contact = data as Contact;

  // Await event emission so it completes within the server action context
  try {
    await emitEvent({
      workspace_id: contact.workspace_id,
      event_type: BusinessEventType.ContactCreated,
      record_id: contact.id,
      record_type: "contact",
      payload: {
        contactId: contact.id,
        email: contact.email,
        firstName: contact.first_name,
        lastName: contact.last_name,
      },
    });
  } catch (err) {
    console.error("[createContact] Event emission failed:", err);
  }

  return contact;
}

export async function updateContact(id: string, input: UpdateContactInput) {
  const { data, error } = await insforge.database
    .from("contacts")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Contact;
}

export async function archiveContact(id: string) {
  return updateContact(id, { status: "archived" });
}

export async function deleteContact(id: string) {
  // Delete related records first
  await insforge.database.from("contact_tags").delete().eq("contact_id", id);

  const { error } = await insforge.database
    .from("contacts")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
