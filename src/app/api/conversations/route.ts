import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { listConversations } from "@/lib/data/conversations";
import type { MessageChannel } from "@/types/messaging";

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantContext();
    const url = new URL(request.url);

    const channelParam = url.searchParams.get("channel");
    const channel: MessageChannel | undefined =
      channelParam === "email" || channelParam === "sms" ? channelParam : undefined;
    const unread = url.searchParams.get("unread") === "true";
    const q = url.searchParams.get("q") ?? undefined;

    const conversations = await listConversations(tenant.workspaceId, {
      channel,
      unread,
      q,
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("GET /api/conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
