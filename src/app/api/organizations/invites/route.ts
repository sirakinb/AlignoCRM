import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { createOrganizationInvite } from "@/lib/data/organizations";
import { escapeHtml } from "@/lib/html";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const tenant = await requireTenantContext();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!tenant.organizationId || !["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role === "admin" ? "admin" : "member";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Provide a valid teammate email" },
        { status: 400 }
      );
    }

    const { invite, token } = await createOrganizationInvite({
      organizationId: tenant.organizationId,
      email,
      role,
      invitedBy: user.id,
    });

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${token}`;
    // Raw values for the plain-text subject; escaped values for HTML body (IR-5).
    const orgName = tenant.organization?.name ?? "AlignoCRM";
    const orgNameHtml = escapeHtml(orgName);
    const inviterNameHtml = escapeHtml(user.email);
    const roleHtml = escapeHtml(role);
    const inviteUrlHtml = escapeHtml(inviteUrl);

    // Send invite email via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "AlignoCRM <aki.b@pentridgemedia.com>",
          to: email,
          subject: `You've been invited to join ${orgName} on AlignoCRM`,
          html: `
            <div style="background-color: #f7f7f8; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;">
              <div style="max-width: 440px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <span style="font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: #17171c;">AlignoCRM</span>
                </div>
                <div style="background-color: #ffffff; border: 1px solid #e7e7ea; border-radius: 12px; padding: 32px 28px;">
                  <p style="margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa;">
                    Team invitation
                  </p>
                  <h1 style="margin: 10px 0 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; color: #17171c; line-height: 1.35;">
                    Join ${orgNameHtml} on AlignoCRM
                  </h1>
                  <p style="margin: 14px 0 0; font-size: 14px; color: #3f3f46; line-height: 1.6;">
                    <strong style="color: #17171c;">${inviterNameHtml}</strong> has invited you to join
                    <strong style="color: #17171c;">${orgNameHtml}</strong> as a <strong style="color: #17171c;">${roleHtml}</strong>.
                  </p>
                  <div style="margin: 26px 0 0;">
                    <a href="${inviteUrlHtml}" style="display: block; text-align: center; background-color: #6c2bd9; color: #ffffff; font-size: 14px; font-weight: 500; padding: 11px 24px; border-radius: 8px; text-decoration: none;">
                      Accept invite
                    </a>
                  </div>
                  <p style="margin: 22px 0 0; font-size: 12px; color: #71717a; line-height: 1.6; border-top: 1px solid #f0f0f2; padding-top: 16px;">
                    This invite expires in 14 days. If the button doesn't work, copy this link into your browser:<br />
                    <a href="${inviteUrlHtml}" style="color: #6c2bd9; word-break: break-all; text-decoration: none;">${inviteUrlHtml}</a>
                  </p>
                </div>
                <p style="margin: 18px 0 0; text-align: center; font-size: 12px; color: #a1a1aa; line-height: 1.5;">
                  You received this because someone invited you to their AlignoCRM workspace.<br />
                  If you didn't expect this email, you can safely ignore it.
                </p>
              </div>
            </div>
          `,
        });
      } catch (err) {
        console.error("Failed to send invite email:", err);
      }
    }

    return NextResponse.json({ invite, inviteUrl }, { status: 201 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("POST /api/organizations/invites error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

