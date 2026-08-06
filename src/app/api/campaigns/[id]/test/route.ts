import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { insforge } from "@/lib/insforge/server";
import { getCampaign } from "@/lib/data/campaigns";
import {
  sendConversationMessage,
  SendMessageError,
} from "@/lib/messaging/send-message";
import { interpolateTemplate } from "@/lib/messaging/interpolation";
import { sanitizeOutboundHtml } from "@/lib/messaging/sanitize-html";
import { sanitizeHeaderValue, HEADER_LIMITS } from "@/lib/messaging/header-safety";
import { checkSendRateLimit } from "@/lib/messaging/rate-limit";

/**
 * POST /api/campaigns/[id]/test — send a test copy of the campaign to ONE
 * workspace contact, rendered with that contact's data exactly as the real
 * campaign would (merge tags + sanitized body). It goes out as a normal 1:1 send
 * via sendConversationMessage — NO campaign row, NO audience materialize — and is
 * governed by the 1:1 send rate limiter (REQ-SEC-17). Requires owner/admin, since
 * it spends.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const { id } = await params;

    const campaign = await getCampaign(id, tenant.workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required.", field: "contactId" },
        { status: 400 }
      );
    }

    // Workspace-scoped contact fetch → a foreign id is "not found" (no leak).
    const { data: rows } = await insforge.database
      .from("contacts")
      .select("id, first_name, last_name, email, phone, company")
      .eq("id", contactId)
      .eq("workspace_id", tenant.workspaceId)
      .limit(1);
    const contact = rows?.[0] as
      | {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          company: string | null;
        }
      | undefined;
    if (!contact) {
      return NextResponse.json({ error: "Test contact not found." }, { status: 404 });
    }

    const rate = await checkSendRateLimit(tenant.workspaceId);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many messages. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const ctx = {
      contact: {
        first_name: contact.first_name ?? "",
        last_name: contact.last_name ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        company: contact.company ?? "",
      },
    };

    const isEmail = campaign.channel === "email";
    const subject = isEmail
      ? sanitizeHeaderValue(
          interpolateTemplate(campaign.subject ?? "", ctx, { mode: "text" }).text,
          HEADER_LIMITS.subject
        ) ?? undefined
      : undefined;
    const renderedBody = isEmail
      ? interpolateTemplate(sanitizeOutboundHtml(campaign.body), ctx, { mode: "html" }).text
      : interpolateTemplate(campaign.body, ctx, { mode: "text" }).text;

    try {
      await sendConversationMessage({
        workspaceId: tenant.workspaceId,
        contactId,
        channel: campaign.channel,
        subject: subject ? `[Test] ${subject}` : undefined,
        body: renderedBody,
        bodyIsHtml: isEmail,
      });
    } catch (err) {
      if (err instanceof SendMessageError) {
        const status = err.code === "no_address" ? 400 : 422;
        return NextResponse.json({ error: err.message }, { status });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/campaigns/[id]/test error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
