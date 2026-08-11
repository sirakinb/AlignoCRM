import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  getTemplate: vi.fn(),
  getTemplates: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: vi.fn().mockResolvedValue({
    workspaceId: "ws-a",
    organizationId: null,
    role: "owner",
  }),
  tenantErrorResponse: () => null,
}));
vi.mock("@/lib/data/templates", () => ({
  getTemplate: H.getTemplate,
  getTemplates: H.getTemplates,
  createTemplate: H.createTemplate,
  updateTemplate: H.updateTemplate,
  deleteTemplate: H.deleteTemplate,
}));

import { GET as listGet, POST as listPost } from "@/app/api/templates/route";
import {
  GET as idGet,
  PATCH as idPatch,
  DELETE as idDelete,
} from "@/app/api/templates/[id]/route";

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function jsonReq(body: unknown) {
  return new Request("https://x/api/templates", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("templates route — tenant scoping (P4-02)", () => {
  it("GET /[id] returns 404 for a template not in the workspace (fetch-by-id-AND-workspace)", async () => {
    // getTemplate(id, ws) throws for a foreign id (the .single() no-row error).
    H.getTemplate.mockRejectedValue(new Error("no rows"));
    const res = await idGet(new Request("https://x"), idParams("t-foreign"));
    expect(res.status).toBe(404);
    // the workspace was passed to the data layer, not compared after fetch
    expect(H.getTemplate).toHaveBeenCalledWith("t-foreign", "ws-a");
  });

  it("GET /[id] returns the template for an owned id", async () => {
    H.getTemplate.mockResolvedValue({ id: "t1", workspace_id: "ws-a", name: "N" });
    const res = await idGet(new Request("https://x"), idParams("t1"));
    expect(res.status).toBe(200);
  });

  it("PATCH /[id] returns 404 for a foreign id and does not update", async () => {
    H.getTemplate.mockRejectedValue(new Error("no rows"));
    const res = await idPatch(jsonReq({ name: "x" }), idParams("t-foreign"));
    expect(res.status).toBe(404);
    expect(H.updateTemplate).not.toHaveBeenCalled();
  });

  it("DELETE /[id] returns 404 for a foreign id and does not delete", async () => {
    H.getTemplate.mockRejectedValue(new Error("no rows"));
    const res = await idDelete(new Request("https://x"), idParams("t-foreign"));
    expect(res.status).toBe(404);
    expect(H.deleteTemplate).not.toHaveBeenCalled();
  });
});

describe("templates route — list + create", () => {
  it("GET filters the list by channel", async () => {
    H.getTemplates.mockResolvedValue([
      { id: "t1", channel: "email", name: "E" },
      { id: "t2", channel: "sms", name: "S" },
    ]);
    const res = await listGet(new Request("https://x/api/templates?channel=sms"));
    const data = await res.json();
    expect(data.templates.map((t: { id: string }) => t.id)).toEqual(["t2"]);
  });

  it("POST creates in the caller's workspace and rejects a missing name", async () => {
    const res = await listPost(jsonReq({ body: "hi", channel: "email" }));
    expect(res.status).toBe(400);
    expect(H.createTemplate).not.toHaveBeenCalled();

    H.createTemplate.mockResolvedValue({ id: "t1" });
    const ok = await listPost(jsonReq({ name: "N", body: "hi", channel: "email" }));
    expect(ok.status).toBe(201);
    expect(H.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: "ws-a", name: "N", channel: "email" })
    );
  });
});
