import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { insertEmailConnection } from "@/lib/messaging/email-connections";
import { MICROSOFT_GRAPH_SCOPES } from "@/lib/messaging/email-providers/microsoft-scopes";

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
        new URL(`/settings?messaging=error&provider=microsoft&message=${encodeURIComponent(errorParam)}`, request.url)
      );
    }

    const cookie = request.cookies.get(OAUTH_COOKIE);
    if (!cookie?.value) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=microsoft&message=missing_nonce", request.url)
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
        new URL("/settings?messaging=error&provider=microsoft&message=invalid_nonce", request.url)
      );
    }

    if (nonce.provider !== "microsoft" || nonce.workspace_id !== tenant.workspaceId) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=microsoft&message=invalid_nonce", request.url)
      );
    }
    if (!state || state !== nonce.state) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=microsoft&message=invalid_state", request.url)
      );
    }
    if (!code) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=microsoft&message=missing_code", request.url)
      );
    }

    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    const msTenant = process.env.MICROSOFT_OAUTH_TENANT ?? "common";
    const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(
        new URL("/settings?messaging=error&provider=microsoft&message=not_configured", request.url)
      );
    }

    const cca = new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${msTenant}`,
      },
    });

    const tokenResponse = await cca.acquireTokenByCode({
      code,
      redirectUri,
      scopes: [...MICROSOFT_GRAPH_SCOPES],
      codeVerifier: nonce.code_verifier,
    });

    if (!tokenResponse?.accessToken) {
      throw new Error("Microsoft token exchange returned no access_token");
    }

    const meResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    });
    if (!meResponse.ok) {
      throw new Error(`Microsoft Graph /me failed: ${meResponse.status}`);
    }
    const me = (await meResponse.json()) as { mail?: string; userPrincipalName?: string };
    const emailAddress = me.mail || me.userPrincipalName;

    if (!emailAddress) {
      throw new Error("Microsoft Graph did not return an email address");
    }

    await insertEmailConnection({
      workspaceId: tenant.workspaceId,
      organizationId: tenant.organizationId,
      provider: "microsoft",
      email: emailAddress,
      displayName: emailAddress,
      accessToken: tokenResponse.accessToken,
      refreshToken:
        (tokenResponse as unknown as { refreshToken?: string }).refreshToken ?? undefined,
      expiresAt: tokenResponse.expiresOn,
      scopes: [...MICROSOFT_GRAPH_SCOPES],
      createdBy: nonce.user_id,
    });

    const response = NextResponse.redirect(
      new URL("/settings?messaging=connected&provider=microsoft", request.url)
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
        new URL("/settings?messaging=error&provider=microsoft&message=auth", request.url)
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

    console.error("GET /api/messaging/email/oauth/microsoft/callback error:", error);
    const r = NextResponse.redirect(
      new URL(
        `/settings?messaging=error&provider=microsoft&message=${encodeURIComponent(
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
