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
      ...(contact.organization_id ? { organization_id: contact.organization_id } : {}),
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
  // Delete related records that may block deletion
  await insforge.database.from("contact_tags").delete().eq("contact_id", id);
  await insforge.database.from("message_logs").delete().eq("contact_id", id);
  await insforge.database.from("activity_logs").delete().eq("contact_id", id);
  await insforge.database.from("cal_booking_events").delete().eq("contact_id", id);
  await insforge.database.from("testimonial_requests").delete().eq("contact_id", id);
  await insforge.database.from("business_events").delete().eq("record_id", id).eq("record_type", "contact");

  // Clean up workflow enrollments and their cascading records
  const { data: enrollments } = await insforge.database
    .from("workflow_enrollments")
    .select("id")
    .eq("record_id", id)
    .eq("record_type", "contact");

  if (enrollments && enrollments.length > 0) {
    const enrollmentIds = enrollments.map((e: { id: string }) => e.id);
    // Clean up approval records for these enrollments
    const { data: approvalRequests } = await insforge.database
      .from("approval_requests")
      .select("id")
      .in("enrollment_id", enrollmentIds);
    if (approvalRequests && approvalRequests.length > 0) {
      const requestIds = approvalRequests.map((r: { id: string }) => r.id);
      await insforge.database.from("approval_actions").delete().in("request_id", requestIds);
      await insforge.database.from("approval_requests").delete().in("id", requestIds);
    }
    await insforge.database.from("execution_steps").delete().in("enrollment_id", enrollmentIds);
    await insforge.database.from("ai_outputs").delete().in("enrollment_id", enrollmentIds);
    await insforge.database.from("workflow_enrollments").delete().eq("record_id", id).eq("record_type", "contact");
  }

  // Keep these records but unlink them from the deleted contact
  await insforge.database.from("deals").update({ contact_id: null }).eq("contact_id", id);
  await insforge.database.from("tasks").update({ contact_id: null }).eq("contact_id", id);
  await insforge.database.from("testimonials").update({ contact_id: null }).eq("contact_id", id);

  const { error } = await insforge.database
    .from("contacts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`[deleteContact] Failed to delete contact ${id}:`, error);
    throw error;
  }
}

export async function deleteContacts(ids: string[]) {
  for (const id of ids) {
    await deleteContact(id);
  }
}
