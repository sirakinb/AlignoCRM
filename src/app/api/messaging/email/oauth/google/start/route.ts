import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { google } from "googleapis";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";

const OAUTH_COOKIE = "__Host-oauth-nonce";
const COOKIE_MAX_AGE = 600; // 10 minutes

export async function GET() {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = await checkRateLimit(
      `oauth:start:${ip}`,
      RATE_LIMITS.oauthPerIp.limit,
      RATE_LIMITS.oauthPerIp.windowMs,
      true
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Google OAuth is not configured." },
        { status: 500 }
      );
    }

    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      state,
      code_challenge_method: "S256" as unknown as never,
      code_challenge: codeChallenge,
    } as Parameters<typeof oauth2Client.generateAuthUrl>[0]);

    const cookiePayload = JSON.stringify({
      state,
      code_verifier: codeVerifier,
      workspace_id: tenant.workspaceId,
      user_id: user.id,
      provider: "google",
    });

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_COOKIE, cookiePayload, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/email/oauth/google/start error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
