import { NextResponse } from "next/server";
import { verifyJobToken } from "@/lib/messaging/token";
import { processCampaignChunk } from "@/lib/messaging/campaign-processor";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";

/**
 * POST /api/campaigns/[id]/process — the chunked bulk-send processor.
 *
 * Auth is a per-campaign HMAC job token (REQ-SEC-16), NOT requireTenantContext
 * and NOT ALIGNO_API_KEY/internal-auth (which resolves to the fallback "default"
 * workspace — silent mis-tenanting, IR-4). The token carries {campaignId,
 * workspaceId, chunk, exp}; it is verified constant-time, must match this route's
 * [id], and must not be expired. The processor then loads the campaign by id AND
 * token.workspaceId and re-asserts the match, so a forged or cross-campaign token
 * cannot touch another tenant's rows.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Coarse flood guard on this spend-driving endpoint (the token is the real
    // gate). Fails CLOSED (failOpen=false) — a counter outage must cap runaway
    // self-invocation, not uncap it (Gate-4 #7).
    const allowed = await checkRateLimit(
      `process:${id}`,
      RATE_LIMITS.webhookPerRoute.limit,
      RATE_LIMITS.webhookPerRoute.windowMs,
      false
    );
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const tokenStr =
      typeof body.token === "string"
        ? body.token
        : request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";

    const token = verifyJobToken(tokenStr);
    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    // The token must be for THIS campaign — a valid token minted for campaign A
    // cannot be replayed against campaign B's URL (REQ-SEC-16).
    if (token.campaignId !== id) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 401 });
    }

    const outcome = await processCampaignChunk(token);
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("POST /api/campaigns/[id]/process error:", error);
    // Return 200 on internal error so a transient fault does not wedge the chain
    // with retries; the ceiling + status checks bound re-invocation.
    return NextResponse.json({ error: "processing_error" }, { status: 200 });
  }
}
