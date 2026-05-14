import type { Resend } from "resend";

// Shared Pentridge audience. Source is stored in first_name so all signups
// across pentridgemedia.com, AlignoCRM, AlignoPM, etc. live in one list
// filterable by where they signed up.
export const PENTRIDGE_AUDIENCE_ID = "b61490b3-e4a6-4eb8-b2c3-6dc8b8799480";

export type ContactSource =
  | "waitlist"
  | "newsletter"
  | "roi-calculator"
  | "alignocrm"
  | "alignopm";

export async function addContact(
  resend: Resend,
  { email, source }: { email: string; source: ContactSource }
) {
  const trimmed = email.trim();
  try {
    const create = await resend.contacts.create({
      email: trimmed,
      firstName: source,
      unsubscribed: false,
      audienceId: PENTRIDGE_AUDIENCE_ID,
    });
    if (create.error) {
      console.warn("addContact create warning:", create.error);
    }
    const update = await resend.contacts.update({
      email: trimmed,
      firstName: source,
      unsubscribed: false,
      audienceId: PENTRIDGE_AUDIENCE_ID,
    });
    if (update.error) {
      console.warn("addContact update warning:", update.error);
      return { ok: false as const, error: update.error };
    }
    return { ok: true as const, id: update.data?.id || create.data?.id };
  } catch (err) {
    console.warn("addContact threw:", err);
    return { ok: false as const, error: err };
  }
}
