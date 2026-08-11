import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getOrCreateChannels,
  updateChannelConfig,
  SettingsValidationError,
} from "@/lib/data/messaging-settings";

/**
 * GET — read (and idempotently seed) the workspace's channel config (A-16,
 * P5-01b). PUT — update one channel's config; requires owner/admin (REQ-SEC-15.6)
 * and validates before writing (P5-01).
 */
export async function GET() {
  try {
    const tenant = await requireTenantContext();
    const channels = await getOrCreateChannels(
      tenant.workspaceId,
      tenant.organizationId
    );
    return NextResponse.json({ channels });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.channel !== "email" && body.channel !== "sms") {
      return NextResponse.json(
        { error: "channel must be 'email' or 'sms'.", field: "channel" },
        { status: 400 }
      );
    }
    const config =
      body.config && typeof body.config === "object" ? body.config : {};

    try {
      const channel = await updateChannelConfig(
        tenant.workspaceId,
        tenant.organizationId,
        body.channel,
        config
      );
      return NextResponse.json({ channel });
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        return NextResponse.json(
          { error: err.message, field: err.field },
          { status: 400 }
        );
      }
      throw err;
    }
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("PUT /api/messaging/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
