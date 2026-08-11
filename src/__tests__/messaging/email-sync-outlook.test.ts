import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockUpdateSyncState,
  mockUpdateTokens,
  mockSetStatus,
  mockCheckRateLimit,
  mockProcess,
  mockFetch,
} = vi.hoisted(() => ({
  mockUpdateSyncState: vi.fn(),
  mockUpdateTokens: vi.fn(),
  mockSetStatus: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockProcess: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: vi.fn().mockImplementation(() => ({
    acquireTokenByRefreshToken: vi.fn(),
  })),
}));

vi.mock("@/lib/messaging/email-connections", () => ({
  updateEmailConnectionSyncState: mockUpdateSyncState,
  updateEmailConnectionTokens: mockUpdateTokens,
  setEmailConnectionStatus: mockSetStatus,
}));

vi.mock("@/lib/messaging/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RATE_LIMITS: { emailSyncPerConnection: { limit: 30, windowMs: 60_000 } },
}));

vi.mock("@/lib/messaging/email-sync/processor", () => ({
  processSyncedInboundEmail: mockProcess,
}));

import { syncOutlookConnection } from "@/lib/messaging/email-sync/outlook";
import type { EmailConnection } from "@/lib/messaging/email-connections";

function connection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: "conn-ms",
    workspace_id: "ws-1",
    organization_id: null,
    provider: "microsoft",
    email: "me@outlook.com",
    display_name: "Me",
    signature: null,
    access_token: "access",
    refresh_token: "refresh",
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    scopes: [],
    status: "active",
    is_default: true,
    last_sync_at: null,
    sync_history_id: null,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("syncOutlookConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true);
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "id";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "secret";
  });

  it("bootstraps a delta link without importing historical mail", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [{ id: "old-1", subject: "should not process" }],
        "@odata.deltaLink": "https://graph.microsoft.com/delta?token=abc",
      }),
    });

    const result = await syncOutlookConnection(connection(), { fetch: mockFetch });

    expect(result.bootstrapped).toBe(true);
    expect(result.processed).toBe(0);
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockUpdateSyncState).toHaveBeenCalledWith("ws-1", "conn-ms", {
      syncHistoryId: "https://graph.microsoft.com/delta?token=abc",
      lastSyncAt: expect.any(Date),
    });
  });

  it("processes new delta messages and stores the next delta link", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            id: "msg-1",
            subject: "Hello",
            body: { contentType: "HTML", content: "<p>Hi</p>" },
            from: { emailAddress: { address: "lead@example.com" } },
            toRecipients: [{ emailAddress: { address: "me@outlook.com" } }],
            internetMessageId: "<m1@x>",
            isDraft: false,
          },
          {
            id: "msg-2",
            "@removed": { reason: "deleted" },
          },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/delta?token=next",
      }),
    });
    mockProcess.mockResolvedValueOnce("stored");

    const result = await syncOutlookConnection(
      connection({
        sync_history_id: "https://graph.microsoft.com/delta?token=prev",
      }),
      { fetch: mockFetch }
    );

    expect(result.processed).toBe(1);
    expect(result.stored).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft",
        providerMessageId: "msg-1",
        fromAddress: "lead@example.com",
      })
    );
    expect(mockUpdateSyncState).toHaveBeenCalledWith("ws-1", "conn-ms", {
      syncHistoryId: "https://graph.microsoft.com/delta?token=next",
      lastSyncAt: expect.any(Date),
    });
  });
});
