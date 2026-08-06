import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireTenantContext: vi.fn(),
  tenantErrorResponse: vi.fn(),
  // data layer
  getConversationDetail: vi.fn(),
  markConversationRead: vi.fn(),
  getConversationContactId: vi.fn(),
  countUnreadConversations: vi.fn(),
  listConversations: vi.fn(),
  resolveConversationForContact: vi.fn(),
  // send helper
  performSend: vi.fn(),
}));

vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: h.requireTenantContext,
  tenantErrorResponse: h.tenantErrorResponse,
}));

vi.mock("@/lib/data/conversations", () => ({
  getConversationDetail: h.getConversationDetail,
  markConversationRead: h.markConversationRead,
  getConversationContactId: h.getConversationContactId,
  countUnreadConversations: h.countUnreadConversations,
  listConversations: h.listConversations,
  resolveConversationForContact: h.resolveConversationForContact,
}));

vi.mock("@/lib/messaging/send-request", () => ({
  performSend: h.performSend,
  // Minimal real-shaped mapper so route tests exercise the status codes.
  sendOutcomeToResponse: (outcome: { kind: string; message?: string; retryAfterSeconds?: number }) => {
    if (outcome.kind === "ok") return NextResponse.json({ message: {} }, { status: 201 });
    if (outcome.kind === "rate_limited")
      return NextResponse.json({ error: "slow down" }, {
        status: 429,
        headers: { "Retry-After": String(outcome.retryAfterSeconds ?? 60) },
      });
    if (outcome.kind === "invalid" || outcome.kind === "no_address")
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    if (outcome.kind === "blocked")
      return NextResponse.json({ error: outcome.message }, { status: 422 });
    return NextResponse.json({ error: "err" }, { status: 502 });
  },
}));

import { GET as getList } from "@/app/api/conversations/route";
import { GET as getUnread } from "@/app/api/conversations/unread-count/route";
import { GET as getThread } from "@/app/api/conversations/[id]/route";
import * as readRoute from "@/app/api/conversations/[id]/read/route";
import { POST as postThreadMessage } from "@/app/api/conversations/[id]/messages/route";
import { POST as postComposeSend } from "@/app/api/messages/send/route";

const TENANT_A = { workspaceId: "ws-a", organizationId: null, role: "owner", organization: null };

function req(url = "http://localhost/api/conversations", init?: RequestInit) {
  return new Request(url, init);
}

class FakeUnauthorized extends Error {
  __unauth = true;
}

describe("conversations API — auth + tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireTenantContext.mockResolvedValue(TENANT_A);
    h.tenantErrorResponse.mockImplementation((e: unknown) =>
      e instanceof FakeUnauthorized
        ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        : null
    );
  });

  it("GET /api/conversations returns 401 when unauthenticated", async () => {
    h.requireTenantContext.mockRejectedValueOnce(new FakeUnauthorized());
    const res = await getList(req());
    expect(res.status).toBe(401);
  });

  it("GET /api/conversations passes channel/unread/q filters to the data layer", async () => {
    h.listConversations.mockResolvedValue([]);
    await getList(req("http://localhost/api/conversations?channel=email&unread=true&q=bob"));
    expect(h.listConversations).toHaveBeenCalledWith("ws-a", {
      channel: "email",
      unread: true,
      q: "bob",
    });
  });

  it("GET /api/conversations/unread-count returns the count for the workspace", async () => {
    h.countUnreadConversations.mockResolvedValue(2);
    const res = await getUnread();
    expect(await res.json()).toEqual({ count: 2 });
    expect(h.countUnreadConversations).toHaveBeenCalledWith("ws-a");
  });

  it("GET /api/conversations/[id] returns 404 for a cross-workspace id", async () => {
    // Data layer fetch-by-id-AND-workspace returns null for a foreign id.
    h.getConversationDetail.mockResolvedValue(null);
    const res = await getThread(req(), { params: Promise.resolve({ id: "conv-other" }) });
    expect(res.status).toBe(404);
    expect(h.getConversationDetail).toHaveBeenCalledWith("ws-a", "conv-other", expect.anything());
  });

  it("GET /api/conversations/[id] returns the thread for an owned id", async () => {
    h.getConversationDetail.mockResolvedValue({ conversation: { id: "c1" }, messages: [] });
    const res = await getThread(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
  });

  it("GET /api/conversations/[id] floors fractional limit/offset before .range() (LOW #5)", async () => {
    h.getConversationDetail.mockResolvedValue({ conversation: { id: "c1" }, messages: [] });
    await getThread(
      req("http://localhost/api/conversations/c1?limit=1.5&offset=1.5"),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(h.getConversationDetail).toHaveBeenCalledWith("ws-a", "c1", {
      limit: 1,
      offset: 1,
    });
  });

  it("read route is POST-only (no GET export) and mutates via POST", () => {
    expect((readRoute as Record<string, unknown>).GET).toBeUndefined();
    expect(typeof readRoute.POST).toBe("function");
  });

  it("POST /api/conversations/[id]/read returns 404 for a cross-workspace id", async () => {
    h.markConversationRead.mockResolvedValue(false);
    const res = await readRoute.POST(req(undefined, { method: "POST" }), {
      params: Promise.resolve({ id: "conv-other" }),
    });
    expect(res.status).toBe(404);
    expect(h.markConversationRead).toHaveBeenCalledWith("ws-a", "conv-other");
  });

  it("POST /api/conversations/[id]/read zeroes unread for an owned id", async () => {
    h.markConversationRead.mockResolvedValue(true);
    const res = await readRoute.POST(req(undefined, { method: "POST" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("POST /api/conversations/[id]/messages returns 404 (no send) for a cross-workspace id", async () => {
    h.getConversationContactId.mockResolvedValue(null);
    const res = await postThreadMessage(
      req(undefined, {
        method: "POST",
        body: JSON.stringify({ channel: "email", body: "hi" }),
      }),
      { params: Promise.resolve({ id: "conv-other" }) }
    );
    expect(res.status).toBe(404);
    expect(h.performSend).not.toHaveBeenCalled();
  });

  it("POST /api/conversations/[id]/messages sends for an owned thread", async () => {
    h.getConversationContactId.mockResolvedValue("contact-1");
    h.performSend.mockResolvedValue({ kind: "ok", message: {} });
    const res = await postThreadMessage(
      req(undefined, {
        method: "POST",
        body: JSON.stringify({ channel: "email", subject: "Hi", body: "Hello" }),
      }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(201);
    expect(h.performSend).toHaveBeenCalledWith("ws-a", "contact-1", {
      channel: "email",
      subject: "Hi",
      body: "Hello",
    });
  });

  it("POST /api/conversations/[id]/messages surfaces a 429 from the rate limiter", async () => {
    h.getConversationContactId.mockResolvedValue("contact-1");
    h.performSend.mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
    const res = await postThreadMessage(
      req(undefined, {
        method: "POST",
        body: JSON.stringify({ channel: "sms", body: "hi" }),
      }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("POST /api/messages/send requires a contactId", async () => {
    const res = await postComposeSend(
      req(undefined, { method: "POST", body: JSON.stringify({ channel: "email", body: "hi" }) })
    );
    expect(res.status).toBe(400);
    expect(h.performSend).not.toHaveBeenCalled();
  });

  it("POST /api/messages/send routes through the workspace-scoped send helper", async () => {
    h.performSend.mockResolvedValue({ kind: "ok", message: {} });
    const res = await postComposeSend(
      req(undefined, {
        method: "POST",
        body: JSON.stringify({ contactId: "contact-9", channel: "sms", body: "yo" }),
      })
    );
    expect(res.status).toBe(201);
    expect(h.performSend).toHaveBeenCalledWith("ws-a", "contact-9", {
      channel: "sms",
      subject: undefined,
      body: "yo",
    });
  });
});
