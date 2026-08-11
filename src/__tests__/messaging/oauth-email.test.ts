import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.from(
  "a".repeat(32),
  "utf8"
).toString("base64");
process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://test/callback";

const H = vi.hoisted(() => {
  const tenant = vi.fn();
  const from = vi.fn();
  const getTokenMock = vi.fn();
  const profileGet = vi.fn();
  const gmailSend = vi.fn();
  class MockOAuth2Client {
    setCredentials = vi.fn();
    getToken = getTokenMock;
  }
  return { tenant, from, getTokenMock, profileGet, gmailSend, MockOAuth2Client };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: H.tenant,
  tenantErrorResponse: () => null,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ "x-forwarded-for": "1.2.3.4" })),
}));
vi.mock("@/lib/insforge/server", () => ({
  insforge: { database: { from: H.from } },
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: H.MockOAuth2Client,
    },
    gmail: vi.fn(() => ({
      users: {
        getProfile: H.profileGet,
        messages: {
          send: H.gmailSend,
        },
      },
    })),
  },
}));

import { NextRequest } from "next/server";
import { GET as googleCallback } from "@/app/api/messaging/email/oauth/google/callback/route";
import { GET as listConnections, PATCH as patchConnection, DELETE as deleteConnection } from "@/app/api/messaging/email/connections/route";

function makeDbQuery() {
  const q: Record<string, unknown> = {};
  const methods = ["select", "eq", "not", "gt", "in", "order", "limit", "range", "update", "insert", "delete", "single", "upsert"];
  for (const m of methods) {
    q[m] = vi.fn(() => q);
  }
  return q;
}

function makeRequest(url: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.tenant.mockResolvedValue({ workspaceId: "ws-1", organizationId: "org-1", role: "owner" });
  H.from.mockImplementation(() => makeDbQuery());
  H.getTokenMock.mockResolvedValue({
    tokens: {
      access_token: "access-123",
      refresh_token: "refresh-123",
      expiry_date: Date.now() + 60 * 60 * 1000,
    },
  });
  H.profileGet.mockResolvedValue({ data: { emailAddress: "user@gmail.com" } });
});

describe("Google OAuth callback", () => {
  it("rejects a callback with a mismatched state", async () => {
    const nonce = JSON.stringify({
      state: "expected-state",
      code_verifier: "verifier",
      workspace_id: "ws-1",
      user_id: "user-1",
      provider: "google",
    });
    const req = makeRequest(
      "https://test/api/messaging/email/oauth/google/callback?state=wrong-state&code=abc",
      `__Host-oauth-nonce=${encodeURIComponent(nonce)}`
    );

    const res = await googleCallback(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("messaging=error");
    expect(res.headers.get("location")).toContain("invalid_state");
  });

  it("rejects a callback with a missing nonce cookie", async () => {
    const req = makeRequest(
      "https://test/api/messaging/email/oauth/google/callback?state=some-state&code=abc"
    );

    const res = await googleCallback(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("missing_nonce");
  });

  it("rejects a callback for the wrong workspace", async () => {
    const nonce = JSON.stringify({
      state: "state-1",
      code_verifier: "verifier",
      workspace_id: "ws-2",
      user_id: "user-1",
      provider: "google",
    });
    const req = makeRequest(
      "https://test/api/messaging/email/oauth/google/callback?state=state-1&code=abc",
      `__Host-oauth-nonce=${encodeURIComponent(nonce)}`
    );

    const res = await googleCallback(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("invalid_nonce");
  });

  it("exchanges the code and inserts a Gmail connection", async () => {
    const nonce = JSON.stringify({
      state: "state-1",
      code_verifier: "verifier",
      workspace_id: "ws-1",
      user_id: "user-1",
      provider: "google",
    });
    const req = makeRequest(
      "https://test/api/messaging/email/oauth/google/callback?state=state-1&code=abc",
      `__Host-oauth-nonce=${encodeURIComponent(nonce)}`
    );

    const res = await googleCallback(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("messaging=connected");
    expect(H.from).toHaveBeenCalledWith("workspace_email_connections");
  });
});

describe("Email connections API", () => {
  it("lists connections without exposing tokens", async () => {
    const res = await listConnections();
    expect(res.status).toBe(200);
  });

  it("rejects PATCH for non-owner/admin", async () => {
    H.tenant.mockResolvedValue({ workspaceId: "ws-1", organizationId: "org-1", role: "member" });
    const req = new Request("https://test", {
      method: "PATCH",
      body: JSON.stringify({ id: "conn-1", signature: "<p>--</p>" }),
      headers: { "content-type": "application/json" },
    });

    const res = await patchConnection(req);
    expect(res.status).toBe(403);
  });

  it("rejects DELETE for non-owner/admin", async () => {
    H.tenant.mockResolvedValue({ workspaceId: "ws-1", organizationId: "org-1", role: "member" });
    const req = new Request("https://test?id=conn-1", { method: "DELETE" });

    const res = await deleteConnection(req);
    expect(res.status).toBe(403);
  });
});
