import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

import {
  validateSessionToken,
  getAuthenticatedUser,
  clearSessionCache,
} from "@/lib/auth/session";

const BASE = "https://example.insforge.app";

function sessionResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const VALID_USER = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "real@example.com",
  metadata: { plan: "pro" },
  profile: { name: "Real User" },
};

describe("validateSessionToken", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = BASE;
    clearSessionCache();
    cookieStore.get.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearSessionCache();
  });

  it("derives identity from the validated response, not from any input", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(sessionResponse({ user: VALID_USER }));

    const user = await validateSessionToken("a-token");

    expect(user).toEqual({
      id: VALID_USER.id,
      email: VALID_USER.email,
      metadata: { plan: "pro" },
      profile: { plan: "pro", name: "Real User" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/auth/sessions/current`);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer a-token",
    });
  });

  it("rejects a token InsForge does not recognise", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sessionResponse({ error: "AUTH_UNAUTHORIZED" }, 401)
    );

    expect(await validateSessionToken("forged")).toBeNull();
  });

  it("fails closed when InsForge is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await validateSessionToken("a-token")).toBeNull();
  });

  it("fails closed on a 5xx and does not cache it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(sessionResponse({}, 503));

    expect(await validateSessionToken("a-token")).toBeNull();
    expect(await validateSessionToken("a-token")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a 200 whose body is missing id or email", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sessionResponse({ user: { id: 12345, email: "x@y.z" } })
    );

    expect(await validateSessionToken("a-token")).toBeNull();
  });

  it("caches a positive result instead of re-validating every call", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(sessionResponse({ user: VALID_USER }));

    await validateSessionToken("a-token");
    await validateSessionToken("a-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not let one token's result satisfy another token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(sessionResponse({ user: VALID_USER }));

    await validateSessionToken("token-a");
    await validateSessionToken("token-b");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_INSFORGE_URL = BASE;
    clearSessionCache();
    cookieStore.get.mockReset();
    vi.restoreAllMocks();
  });

  it("returns null when no session cookie is present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    cookieStore.get.mockReturnValue(undefined);

    expect(await getAuthenticatedUser()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a forged insforge-user cookie and uses the validated identity", async () => {
    // The IR-1 exploit: attacker supplies both cookies and expects to be trusted.
    cookieStore.get.mockImplementation((name: string) =>
      name === "insforge-session"
        ? { value: "attacker-supplied-token" }
        : {
            value: JSON.stringify({
              id: "00000000-0000-0000-0000-000000000000",
              email: "victim@example.com",
            }),
          }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sessionResponse({ user: VALID_USER })
    );

    const user = await getAuthenticatedUser();

    expect(user?.id).toBe(VALID_USER.id);
    expect(user?.email).toBe(VALID_USER.email);
  });

  it("returns null when the cookie pair is forged and the token is invalid", async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === "insforge-session"
        ? { value: "x" }
        : {
            value: JSON.stringify({
              id: "00000000-0000-0000-0000-000000000000",
              email: "victim@example.com",
            }),
          }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(sessionResponse({}, 401));

    expect(await getAuthenticatedUser()).toBeNull();
  });
});
