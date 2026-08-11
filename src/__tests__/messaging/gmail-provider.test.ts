import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.from(
  "a".repeat(32),
  "utf8"
).toString("base64");
process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://test/callback";

const H = vi.hoisted(() => {
  const sendMock = vi.fn();
  const refreshAccessTokenMock = vi.fn();
  const setCredentialsMock = vi.fn();
  class MockOAuth2Client {
    setCredentials = setCredentialsMock;
    refreshAccessToken = refreshAccessTokenMock;
  }
  return { sendMock, refreshAccessTokenMock, setCredentialsMock, MockOAuth2Client };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: H.MockOAuth2Client,
    },
    gmail: vi.fn(() => ({
      users: {
        messages: {
          send: H.sendMock,
        },
      },
    })),
  },
}));

import { google } from "googleapis";
import { GmailApiEmailProvider } from "@/lib/messaging/email-providers/gmail";
import type { EmailConnection } from "@/lib/messaging/email-connections";

function makeConnection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: "conn-1",
    workspace_id: "ws-1",
    organization_id: null,
    provider: "google",
    email: "user@gmail.com",
    display_name: "User",
    signature: null,
    access_token: "access-123",
    refresh_token: "refresh-123",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    status: "active",
    is_default: true,
    last_sync_at: null,
    sync_history_id: null,
    created_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.sendMock.mockResolvedValue({ data: { id: "msg-123" } });
  H.refreshAccessTokenMock.mockResolvedValue({
    credentials: {
      access_token: "new-access-123",
      refresh_token: "new-refresh-123",
      expiry_date: Date.now() + 60 * 60 * 1000,
    },
  });
});

describe("GmailApiEmailProvider", () => {
  it("sends a message via the Gmail API and returns the message id", async () => {
    const provider = new GmailApiEmailProvider(makeConnection());
    const result = await provider.send({
      from: '"User" <user@gmail.com>',
      to: "recipient@example.com",
      replyTo: '"User" <r+token@reply.alignocrm.com>',
      subject: "Hello",
      html: "<p>Hi there</p>",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe("msg-123");
    expect(H.sendMock).toHaveBeenCalledTimes(1);
    const requestBody = H.sendMock.mock.calls[0][0].requestBody;
    expect(requestBody.raw).toBeTruthy();
  });

  it("refreshes the token when expiry is within 5 minutes and persists new tokens", async () => {
    const connection = makeConnection({
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    });
    const onRefreshed = vi.fn().mockResolvedValue(undefined);
    const provider = new GmailApiEmailProvider(connection, { onTokensRefreshed: onRefreshed });

    await provider.send({
      from: '"User" <user@gmail.com>',
      to: "recipient@example.com",
      replyTo: '"User" <r+token@reply.alignocrm.com>',
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(H.refreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-access-123",
        refreshToken: "new-refresh-123",
      })
    );
  });

  it("appends the HTML signature to the body when configured", async () => {
    const connection = makeConnection({
      signature: "<p>--<br>Jane Doe</p>",
    });
    const provider = new GmailApiEmailProvider(connection);

    await provider.send({
      from: '"User" <user@gmail.com>',
      to: "recipient@example.com",
      replyTo: '"User" <r+token@reply.alignocrm.com>',
      subject: "Hello",
      html: "<p>Body</p>",
    });

    const raw = H.sendMock.mock.calls[0][0].requestBody.raw as string;
    const mime = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    // The HTML body is itself base64-encoded inside the multipart MIME message.
    const htmlMatch = mime.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([A-Za-z0-9+/=]+)/);
    expect(htmlMatch).toBeTruthy();
    const html = Buffer.from(htmlMatch![1], "base64").toString("utf8");
    expect(html).toContain("<p>Body</p>");
    expect(html).toContain("<p>--<br>Jane Doe</p>");
  });

  it("marks the connection expired when the token refresh fails", async () => {
    const connection = makeConnection({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    H.refreshAccessTokenMock.mockRejectedValue(new Error("invalid_grant"));
    const markExpired = vi.fn().mockResolvedValue(undefined);
    const provider = new GmailApiEmailProvider(connection, { markExpired });

    await expect(
      provider.send({
        from: '"User" <user@gmail.com>',
        to: "recipient@example.com",
        replyTo: '"User" <r+token@reply.alignocrm.com>',
        subject: "Hello",
        html: "<p>Hi</p>",
      })
    ).rejects.toThrow(/token refresh failed/i);

    expect(markExpired).toHaveBeenCalledWith("ws-1", "conn-1");
  });
});
