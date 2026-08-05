import { Resend } from "resend";
import { insforge } from "@/lib/insforge/server";
import { getSiteUrl } from "@/lib/seo/site-url";
import type { Testimonial, TestimonialRequest } from "@/types/crm";

// Testimonial content is public input headed into an owner's inbox — escape it.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getRecipientEmails(request: TestimonialRequest) {
  if (!request.organization_id) return [];

  const { data, error } = await insforge.database
    .from("organization_members")
    .select("user_id, email, role")
    .eq("organization_id", request.organization_id)
    .eq("status", "active");

  if (error || !data) return [];

  const members = data as { user_id: string; email: string; role: string }[];

  // Prefer whoever sent the request; otherwise notify owners/admins.
  const creator = request.created_by
    ? members.find((m) => m.user_id === request.created_by)
    : undefined;
  const recipients = creator
    ? [creator]
    : members.filter((m) => ["owner", "admin"].includes(m.role));

  return [...new Set(recipients.map((m) => m.email).filter(Boolean))];
}

export async function sendTestimonialNotification(
  testimonial: Testimonial,
  request: TestimonialRequest
) {
  if (!process.env.RESEND_API_KEY) return;

  const recipients = await getRecipientEmails(request);
  if (recipients.length === 0) return;

  const name = escapeHtml(testimonial.name);
  const attribution = escapeHtml(
    [testimonial.role, testimonial.company].filter(Boolean).join(", ")
  );
  const quote = escapeHtml(testimonial.result);
  const testimonialsUrl = `${getSiteUrl()}/testimonials`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "AlignoCRM <aki.b@pentridgemedia.com>",
    to: recipients,
    subject: `New testimonial from ${testimonial.name}`,
    html: `
      <div style="background-color: #f7f7f8; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;">
        <div style="max-width: 440px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: #17171c;">AlignoCRM</span>
          </div>
          <div style="background-color: #ffffff; border: 1px solid #e7e7ea; border-radius: 12px; padding: 32px 28px;">
            <p style="margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa;">
              New testimonial
            </p>
            <h1 style="margin: 10px 0 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: #17171c; line-height: 1.35;">
              ${name} just shared a testimonial
            </h1>
            <blockquote style="margin: 18px 0 0; padding: 14px 16px; background-color: #fafafa; border-left: 3px solid #6c2bd9; border-radius: 0 8px 8px 0; font-size: 14px; color: #3f3f46; line-height: 1.6;">
              &ldquo;${quote}&rdquo;
            </blockquote>
            <p style="margin: 12px 0 0; font-size: 13px; color: #71717a;">
              — ${name}${attribution ? `, ${attribution}` : ""}
            </p>
            <div style="margin: 26px 0 0;">
              <a href="${testimonialsUrl}" style="display: block; text-align: center; background-color: #6c2bd9; color: #ffffff; font-size: 14px; font-weight: 500; padding: 11px 24px; border-radius: 8px; text-decoration: none;">
                View in AlignoCRM
              </a>
            </div>
          </div>
          <p style="margin: 18px 0 0; text-align: center; font-size: 12px; color: #a1a1aa; line-height: 1.5;">
            You received this because a testimonial request you sent was completed.
          </p>
        </div>
      </div>
    `,
  });
}
