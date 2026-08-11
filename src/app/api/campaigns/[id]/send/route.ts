import { NextResponse } from "next/server";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import {
  getCampaign,
  setCampaignFields,
  claimCampaignForSending,
} from "@/lib/data/campaigns";
import {
  materializeCampaign,
  kickProcessor,
  CampaignCapError,
} from "@/lib/messaging/campaign-processor";
import { validateAudience, AudienceError } from "@/lib/messaging/campaign-audience";
import {
  checkCampaignSendRateLimit,
  CAMPAIGN_CAPS,
} from "@/lib/messaging/rate-limit";

/**
 * POST /api/campaigns/[id]/send — materialize recipients, then hand off to the
 * chunked processor (P4-12). Double-send is rejected: only a `draft` campaign can
 * be sent (P4-13). Requires owner/admin (REQ-SEC-15.6) and is rate-limited
 * 5/hour/workspace, NOT the 1:1 limiter (P5-07f).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantContext();
    const { id } = await params;

    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const campaign = await getCampaign(id, tenant.workspaceId);
    if (!campaign) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Fast path for the sequential re-send (P4-13): a campaign already
    // sending/sent/failed short-circuits before the rate limiter/claim.
    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Campaign has already been sent." },
        { status: 409 }
      );
    }

    // Audience must be a valid, non-empty selector before we spend anything.
    try {
      validateAudience(campaign.audience);
    } catch (err) {
      if (err instanceof AudienceError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const rate = await checkCampaignSendRateLimit(tenant.workspaceId);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many campaign sends. Try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    // Atomic compare-and-set: only ONE concurrent /send flips draft→sending and
    // proceeds to materialize (Gate/QA HIGH #1). The loser of the race sees null
    // and 409s, so two overlapping sends can never both materialize (double-spend).
    const claimed = await claimCampaignForSending(id, tenant.workspaceId);
    if (!claimed) {
      return NextResponse.json(
        { error: "Campaign has already been sent." },
        { status: 409 }
      );
    }

    let result;
    try {
      result = await materializeCampaign(claimed, {
        maxRecipients: CAMPAIGN_CAPS.perCampaign,
      });
    } catch (err) {
      // We already flipped to 'sending' via the claim; on a pre-send failure put
      // the campaign back to 'draft' so the operator can fix the audience/cap and
      // retry, rather than leaving it wedged in 'sending'.
      if (err instanceof CampaignCapError || err instanceof AudienceError) {
        await setCampaignFields(id, tenant.workspaceId, { status: "draft" }).catch(
          () => {}
        );
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      await setCampaignFields(id, tenant.workspaceId, { status: "draft" }).catch(
        () => {}
      );
      throw err;
    }

    // No sendable recipients — nothing was materialized; mark done immediately so
    // the campaign doesn't sit in `sending` forever.
    if (result.totalCount === 0) {
      await setCampaignFields(campaign.id, tenant.workspaceId, { status: "sent" });
      return NextResponse.json(
        { status: "sent", ...result },
        { status: 202 }
      );
    }

    // Kick the processor (fire-and-forget). Returns promptly (P4-12).
    await kickProcessor(campaign.id, tenant.workspaceId, 1);

    return NextResponse.json({ status: "sending", ...result }, { status: 202 });
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("POST /api/campaigns/[id]/send error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
