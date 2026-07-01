import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { createOrganizationInvite } from "@/lib/data/organizations";

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
    const orgName = tenant.organization?.name ?? "AlignoCRM";
    const inviterName = user.email;

    // Send invite email via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "AlignoCRM <aki.b@pentridgemedia.com>",
          to: email,
          subject: `You've been invited to join ${orgName} on AlignoCRM`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">AlignoCRM</h1>
              </div>
              <p style="font-size: 15px; color: #374151; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on AlignoCRM as a <strong>${role}</strong>.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #7C3AED, #6D28D9); color: #fff; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
                  Accept Invite
                </a>
              </div>
              <p style="font-size: 13px; color: #6B7280; line-height: 1.5;">
                This invite expires in 14 days. If you didn't expect this email, you can safely ignore it.
              </p>
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

