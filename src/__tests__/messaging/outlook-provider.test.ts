import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.from(
  "a".repeat(32),
  "utf8"
).toString("base64");
process.env.MICROSOFT_OAUTH_CLIENT_ID = "test-client-id";
process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "test-client-secret";
process.env.MICROSOFT_OAUTH_TENANT = "common";

const H = vi.hoisted(() => ({
  acquireTokenByRefreshTokenMock: vi.fn(),
  ccaConstructor: vi.fn(),
  fetchResponse: { ok: true, status: 202, text: vi.fn().mockResolvedValue("") } as unknown as Response,
  fetchMock: vi.fn(),
}));

vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: class MockConfidentialClientApplication {
    acquireTokenByRefreshToken = H.acquireTokenByRefreshTokenMock;
  },
}));

import { MicrosoftGraphEmailProvider } from "@/lib/messaging/email-providers/outlook";
import type { EmailConnection } from "@/lib/messaging/email-connections";

function makeConnection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: "conn-1",
    workspace_id: "ws-1",
    organization_id: null,
    provider: "microsoft",
    email: "user@outlook.com",
    display_name: "User",
    signature: null,
    access_token: "access-123",
    refresh_token: "refresh-123",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scopes: ["https://graph.microsoft.com/Mail.Send"],
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
  H.acquireTokenByRefreshTokenMock.mockResolvedValue({
    accessToken: "new-access-123",
    refreshToken: "new-refresh-123",
    expiresOn: new Date(Date.now() + 60 * 60 * 1000),
  });
  H.ccaConstructor.mockImplementation(() => ({
    acquireTokenByRefreshToken: H.acquireTokenByRefreshTokenMock,
  }));
  H.fetchMock.mockResolvedValue(H.fetchResponse);
});

describe("MicrosoftGraphEmailProvider", () => {
  it("sends a message via Microsoft Graph and reports success", async () => {
    const provider = new MicrosoftGraphEmailProvider(makeConnection(), {
      fetch: H.fetchMock,
    });

    const result = await provider.send({
      from: '"User" <user@outlook.com>',
      to: "recipient@example.com",
      replyTo: '"User" <r+token@reply.alignocrm.com>',
      subject: "Hello",
      html: "<p>Hi there</p>",
    });

    expect(result.success).toBe(true);
    expect(H.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = H.fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.message.subject).toBe("Hello");
    expect(body.message.from.emailAddress.address).toBe("user@outlook.com");
  });

  it("refreshes the token when expiry is within 5 minutes", async () => {
    const connection = makeConnection({
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    });
    const onRefreshed = vi.fn().mockResolvedValue(undefined);
    const provider = new MicrosoftGraphEmailProvider(connection, {
      fetch: H.fetchMock,
      onTokensRefreshed: onRefreshed,
    });

    await provider.send({
      from: '"User" <user@outlook.com>',
      to: "recipient@example.com",
      replyTo: '"User" <r+token@reply.alignocrm.com>',
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(H.acquireTokenByRefreshTokenMock).toHaveBeenCalledTimes(1);
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
    const provider = new MicrosoftGraphEmailProvider(connection, {
      fetch: H.fetchMock,
    });

    await provider.send({
      from: '"User" <user@outlook.com>',
      to: "recipient@example.com",
      replyTo: '"User" <r+token@reply.alignocrm.com>',
      subject: "Hello",
      html: "<p>Body</p>",
    });

    const body = JSON.parse(H.fetchMock.mock.calls[0][1].body as string);
    expect(body.message.body.content).toContain("<p>Body</p>");
    expect(body.message.body.content).toContain("<p>--<br>Jane Doe</p>");
  });

  it("marks the connection expired when Graph returns 401", async () => {
    const connection = makeConnection();
    H.fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("invalid token"),
    });
    const markExpired = vi.fn().mockResolvedValue(undefined);
    const provider = new MicrosoftGraphEmailProvider(connection, {
      fetch: H.fetchMock,
      markExpired,
    });

    await expect(
      provider.send({
        from: '"User" <user@outlook.com>',
        to: "recipient@example.com",
        replyTo: '"User" <r+token@reply.alignocrm.com>',
        subject: "Hello",
        html: "<p>Hi</p>",
      })
    ).rejects.toThrow(/send failed \(401\)/i);

    expect(markExpired).toHaveBeenCalledWith("ws-1", "conn-1");
  });
});
