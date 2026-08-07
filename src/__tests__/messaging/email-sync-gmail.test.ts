import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mockGetProfile,
  mockHistoryList,
  mockMessagesGet,
  mockRefreshAccessToken,
  mockUpdateSyncState,
  mockUpdateTokens,
  mockSetStatus,
  mockCheckRateLimit,
  mockProcess,
} = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockHistoryList: vi.fn(),
  mockMessagesGet: vi.fn(),
  mockRefreshAccessToken: vi.fn(),
  mockUpdateSyncState: vi.fn(),
  mockUpdateTokens: vi.fn(),
  mockSetStatus: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockProcess: vi.fn(),
}));

vi.mock("googleapis", () => {
  class OAuth2 {
    setCredentials() {}
    refreshAccessToken() {
      return mockRefreshAccessToken();
    }
  }
  return {
    google: {
      auth: { OAuth2 },
      gmail: () => ({
        users: {
          getProfile: mockGetProfile,
          history: { list: mockHistoryList },
          messages: { get: mockMessagesGet },
        },
      }),
    },
  };
});

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

import { syncGmailConnection } from "@/lib/messaging/email-sync/gmail";
import type { EmailConnection } from "@/lib/messaging/email-connections";

function connection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: "conn-1",
    workspace_id: "ws-1",
    organization_id: null,
    provider: "google",
    email: "me@gmail.com",
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

describe("syncGmailConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(true);
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://app.example/callback";
  });

  it("bootstraps historyId on first sync without processing mail", async () => {
    mockGetProfile.mockResolvedValueOnce({ data: { historyId: "999" } });

    const result = await syncGmailConnection(connection());

    expect(result.bootstrapped).toBe(true);
    expect(result.processed).toBe(0);
    expect(mockUpdateSyncState).toHaveBeenCalledWith("ws-1", "conn-1", {
      syncHistoryId: "999",
      lastSyncAt: expect.any(Date),
    });
    expect(mockHistoryList).not.toHaveBeenCalled();
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("processes messageAdded events and advances the cursor", async () => {
    mockHistoryList.mockResolvedValueOnce({
      data: {
        historyId: "1200",
        history: [
          { messagesAdded: [{ message: { id: "m1" } }] },
          { messagesAdded: [{ message: { id: "m2" } }] },
        ],
      },
    });
    mockMessagesGet
      .mockResolvedValueOnce({
        data: {
          id: "m1",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "From", value: "Lead <lead@example.com>" },
              { name: "To", value: "me@gmail.com" },
              { name: "Subject", value: "Hi" },
              { name: "Message-ID", value: "<m1@x>" },
            ],
            parts: [
              { mimeType: "text/plain", body: { data: Buffer.from("hello").toString("base64url") } },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "m2",
          labelIds: ["SENT"],
          payload: { headers: [{ name: "From", value: "me@gmail.com" }] },
        },
      });
    mockProcess.mockResolvedValueOnce("stored");

    const result = await syncGmailConnection(
      connection({ sync_history_id: "1000" })
    );

    expect(result.processed).toBe(2);
    expect(result.stored).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(mockUpdateSyncState).toHaveBeenCalledWith("ws-1", "conn-1", {
      syncHistoryId: "1200",
      lastSyncAt: expect.any(Date),
    });
  });
});
