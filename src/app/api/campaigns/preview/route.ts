import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { previewAudience, AudienceError } from "@/lib/messaging/campaign-audience";
import type { MessageChannel } from "@/types/messaging";

/**
 * POST /api/campaigns/preview — live recipient-count preview for the composer.
 * Shares the resolver/classifier with the actual send (P4-11), so `total +
 * suppressed + no_address` equals what ships. Re-validates every tagId against
 * the workspace inside the resolver (REQ-SEC-15.5).
 */
export async function POST(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const body = await request.json().catch(() => ({}));

    const channel: MessageChannel = body.channel === "sms" ? "sms" : "email";

    try {
      const counts = await previewAudience(
        tenant.workspaceId,
        channel,
        body.audience ?? {}
      );
      return NextResponse.json(counts);
    } catch (err) {
      if (err instanceof AudienceError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/campaigns/preview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
