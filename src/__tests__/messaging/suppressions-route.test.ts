import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * P5-19 — tenant scoping + authorization on the /api/suppressions route (the one
 * messaging route with no dedicated route test). Suppressions are compliance
 * state: a cross-tenant read leaks who opted out, a cross-tenant write is a
 * denial-of-communication. Every handler derives the workspace from the session
 * (never the body) and gates mutations on owner/admin (REQ-SEC-15.6).
 */

const H = vi.hoisted(() => ({
  requireTenantContext: vi.fn(),
  listSuppressions: vi.fn(),
  addSuppression: vi.fn(),
  removeSuppression: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: H.requireTenantContext,
  tenantErrorResponse: (e: unknown) =>
    e instanceof FakeUnauthorized
      ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      : null,
}));
vi.mock("@/lib/messaging/suppressions", () => ({
  listSuppressions: H.listSuppressions,
  addSuppression: H.addSuppression,
  removeSuppression: H.removeSuppression,
}));

class FakeUnauthorized extends Error {}

import { GET, POST, DELETE } from "@/app/api/suppressions/route";

const TENANT_A = { workspaceId: "ws-a", organizationId: null, role: "owner" };

function jsonReq(body: unknown, method = "POST") {
  return new Request("https://x/api/suppressions", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.requireTenantContext.mockResolvedValue(TENANT_A);
  H.listSuppressions.mockResolvedValue([]);
  H.addSuppression.mockResolvedValue(undefined);
  H.removeSuppression.mockResolvedValue(undefined);
});

describe("GET /api/suppressions", () => {
  it("returns 401 when unauthenticated", async () => {
    H.requireTenantContext.mockRejectedValueOnce(new FakeUnauthorized());
    const res = await GET(new Request("https://x/api/suppressions"));
    expect(res.status).toBe(401);
    expect(H.listSuppressions).not.toHaveBeenCalled();
  });

  it("lists only the caller's workspace — the query is workspace-scoped", async () => {
    await GET(new Request("https://x/api/suppressions?channel=email"));
    expect(H.listSuppressions).toHaveBeenCalledWith("ws-a", "email");
  });
});

describe("POST /api/suppressions", () => {
  it("returns 403 for a non-admin member", async () => {
    H.requireTenantContext.mockResolvedValueOnce({ ...TENANT_A, role: "member" });
    const res = await POST(jsonReq({ channel: "email", address: "a@b.com" }));
    expect(res.status).toBe(403);
    expect(H.addSuppression).not.toHaveBeenCalled();
  });

  it("rejects an invalid channel with 400", async () => {
    const res = await POST(jsonReq({ channel: "carrier-pigeon", address: "a@b.com" }));
    expect(res.status).toBe(400);
    expect(H.addSuppression).not.toHaveBeenCalled();
  });

  it("rejects a malformed email with 400", async () => {
    const res = await POST(jsonReq({ channel: "email", address: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(H.addSuppression).not.toHaveBeenCalled();
  });

  it("writes under the session workspace, never a body-supplied one (REQ-SEC-15.3)", async () => {
    const res = await POST(
      jsonReq({ channel: "email", address: "A@B.com", workspace_id: "ws-victim" })
    );
    expect(res.status).toBe(201);
    expect(H.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-a", channel: "email", reason: "manual" })
    );
    // the body-supplied workspace_id was ignored
    expect(H.addSuppression).not.toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-victim" })
    );
  });
});

describe("DELETE /api/suppressions", () => {
  it("returns 403 for a non-admin member", async () => {
    H.requireTenantContext.mockResolvedValueOnce({ ...TENANT_A, role: "member" });
    const res = await DELETE(jsonReq({ channel: "sms", address: "+13105551234" }, "DELETE"));
    expect(res.status).toBe(403);
    expect(H.removeSuppression).not.toHaveBeenCalled();
  });

  it("removes scoped to the caller's workspace", async () => {
    const res = await DELETE(jsonReq({ channel: "email", address: "a@b.com" }, "DELETE"));
    expect(res.status).toBe(200);
    expect(H.removeSuppression).toHaveBeenCalledWith("ws-a", "email", "a@b.com");
  });
});
