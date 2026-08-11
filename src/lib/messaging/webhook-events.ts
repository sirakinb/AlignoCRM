import { insforge } from "@/lib/insforge/server";

export type WebhookProvider = "resend" | "twilio";

/**
 * Event-level idempotency (REQ-SEC-04, T9). Attempts to record a provider event
 * id; returns true if this is the first time we've seen it (caller should
 * process), false if it's a replay/duplicate (caller must no-op and 200).
 *
 * The plan's UNIQUE (provider, provider_id) on `messages` dedupes MESSAGES, not
 * EVENTS: a Resend `bounced` and a later `complained` share a message; a
 * replayed Twilio status callback (its signature carries no timestamp, so replay
 * is unbounded) reuses a message but is a distinct event. This table is the
 * event-level guard.
 *
 * Insert-first. On error, re-select by (provider, event_id): if the row exists
 * it was a genuine conflict (duplicate → false); otherwise the insert failed for
 * a real reason and we rethrow so the handler's try/catch can 200-and-log
 * (REQ-SEC-05) rather than silently swallowing the event.
 */
export async function claimWebhookEvent(
  provider: WebhookProvider,
  eventId: string,
  eventType?: string | null
): Promise<boolean> {
  const { error } = await insforge.database
    .from("messaging_webhook_events")
    .insert({ provider, event_id: eventId, event_type: eventType ?? null });

  if (!error) return true;

  const { data: existing } = await insforge.database
    .from("messaging_webhook_events")
    .select("id")
    .eq("provider", provider)
    .eq("event_id", eventId)
    .limit(1);

  if (existing && existing.length > 0) return false; // already processed
  throw error; // a real failure, not a uniqueness conflict
}
