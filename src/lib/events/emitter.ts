import { insforge } from "@/lib/insforge/client";
import type {
  BusinessEvent,
  CreateBusinessEventInput,
} from "@/types/events";

function generateIdempotencyKey(
  eventType: string,
  recordId: string
): string {
  return `${eventType}:${recordId}:${Date.now()}`;
}

export async function emitEvent(
  input: CreateBusinessEventInput
): Promise<BusinessEvent | null> {
  const idempotency_key = generateIdempotencyKey(
    input.event_type,
    input.record_id
  );

  const { data, error } = await insforge.database
    .from("business_events")
    .insert({
      workspace_id: input.workspace_id,
      event_type: input.event_type,
      record_id: input.record_id,
      record_type: input.record_type,
      payload: input.payload,
      idempotency_key,
    })
    .select()
    .single();

  if (error) {
    // Duplicate idempotency key - event already exists
    if (error.code === "23505") {
      return null;
    }
    throw error;
  }

  const event = data as BusinessEvent;

  // Process the event via API route so it runs fully server-side
  // (email sending needs RESEND_API_KEY which is only available server-side)
  try {
    const baseUrl = typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      : "";
    await fetch(`${baseUrl}/api/events/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (processError) {
    console.error("[emitEvent] Event processing failed:", processError);
  }

  return event;
}

export async function getUnprocessedEvents(
  workspaceId: string,
  limit: number = 50
): Promise<BusinessEvent[]> {
  const { data, error } = await insforge.database
    .from("business_events")
    .select()
    .eq("workspace_id", workspaceId)
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data as BusinessEvent[];
}

export async function markEventProcessed(eventId: string): Promise<void> {
  const { error } = await insforge.database
    .from("business_events")
    .update({ processed: true })
    .eq("id", eventId);

  if (error) throw error;
}
