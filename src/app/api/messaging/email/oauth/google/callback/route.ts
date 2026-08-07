import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { google } from "googleapis";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { insertEmailConnection } from "@/lib/messaging/email-connections";

const OAUTH_COOKIE = "__Host-oauth-nonce";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantContext();
    if (!["owner", "admin"].includes(tenant.role ?? "")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = await checkRateLimit(
      `oauth:callback:${ip}`,
      RATE_LIMITS.oauthPerIp.limit,
      RATE_LIMITS.oauthPerIp.windowMs,
      true
    );
    if (!allowed) {
      return NextResponse.json({ error: "Rate limited. Try again later." }, { status: 429 });
    }

    const searchParams = new URL(request.url).searchParams;
    const state = searchParams.get("state");
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      return NextResponse.redirect(
        new URL(`/settings?messaging=error&provider=google&message=${encodeURIComponent(errorParam)}`, request.url)
      );
    }

    const cookie = request.cookies.get(OAUTH_COOKIE);
    if (!cookie?.value) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=missing_nonce", request.url)
      );
    }

    let nonce: {
      state: string;
      code_verifier: string;
      workspace_id: string;
      user_id: string;
      provider: string;
    };
    try {
      nonce = JSON.parse(cookie.value);
    } catch {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=invalid_nonce", request.url)
      );
    }

    if (nonce.provider !== "google" || nonce.workspace_id !== tenant.workspaceId) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=invalid_nonce", request.url)
      );
    }
    if (!state || state !== nonce.state) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=invalid_state", request.url)
      );
    }
    if (!code) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=missing_code", request.url)
      );
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=not_configured", request.url)
      );
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier: nonce.code_verifier,
    });

    if (!tokens.access_token) {
      throw new Error("Google token exchange returned no access_token");
    }

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const emailAddress = profile.data.emailAddress;

    if (!emailAddress) {
      throw new Error("Gmail profile did not return an email address");
    }

    await insertEmailConnection({
      workspaceId: tenant.workspaceId,
      organizationId: tenant.organizationId,
      provider: "google",
      email: emailAddress,
      displayName: emailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      createdBy: nonce.user_id,
    });

    const response = NextResponse.redirect(
      new URL("/settings?messaging=connected&provider=google", request.url)
    );
    response.cookies.set(OAUTH_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) {
      const r = NextResponse.redirect(
        new URL("/settings?messaging=error&provider=google&message=auth", request.url)
      );
      r.cookies.set(OAUTH_COOKIE, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      return r;
    }

    console.error("GET /api/messaging/email/oauth/google/callback error:", error);
    const r = NextResponse.redirect(
      new URL(
        `/settings?messaging=error&provider=google&message=${encodeURIComponent(
          error instanceof Error ? error.message : "unknown"
        )}`,
        request.url
      )
    );
    r.cookies.set(OAUTH_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return r;
  }
}
