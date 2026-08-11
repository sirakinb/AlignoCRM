import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { requireTenantContext, tenantErrorResponse } from "@/lib/auth/tenant";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { MICROSOFT_GRAPH_SCOPE_STRING } from "@/lib/messaging/email-providers/microsoft-scopes";

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

    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    const msTenant = process.env.MICROSOFT_OAUTH_TENANT ?? "common";
    const redirectUri = process.env.MICROSOFT_OAUTH_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "Microsoft OAuth is not configured." },
        { status: 500 }
      );
    }

    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    const authority = `https://login.microsoftonline.com/${msTenant}`;
    const authUrl = new URL(`${authority}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("scope", MICROSOFT_GRAPH_SCOPE_STRING);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("prompt", "consent");

    const cookiePayload = JSON.stringify({
      state,
      code_verifier: codeVerifier,
      workspace_id: tenant.workspaceId,
      user_id: user.id,
      provider: "microsoft",
    });

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_COOKIE, cookiePayload, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    const authResponse = tenantErrorResponse(error);
    if (authResponse) return authResponse;
    console.error("GET /api/messaging/email/oauth/microsoft/start error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
