import "server-only";
import {
  ConfidentialClientApplication,
  type AuthenticationResult,
} from "@azure/msal-node";
import type {
  ConversationEmailInput,
  ConversationEmailProvider,
  ConversationEmailResult,
} from "@/lib/messaging/conversation-email";
import type { EmailConnection } from "@/lib/messaging/email-connections";
import { setEmailConnectionStatus } from "@/lib/messaging/email-connections";
import { MICROSOFT_GRAPH_SCOPES } from "@/lib/messaging/email-providers/microsoft-scopes";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const GRAPH_SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/me/sendMail";

export interface MicrosoftTokenRefreshPayload {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date | null;
}

export interface MicrosoftGraphEmailProviderDeps {
  onTokensRefreshed?: (payload: MicrosoftTokenRefreshPayload) => Promise<void>;
  markExpired?: (workspaceId: string, id: string) => Promise<void>;
  fetch?: typeof fetch;
}

export class MicrosoftGraphEmailProvider implements ConversationEmailProvider {
  constructor(
    private connection: EmailConnection,
    private deps: MicrosoftGraphEmailProviderDeps = {}
  ) {}

  async send(input: ConversationEmailInput): Promise<ConversationEmailResult> {
    let accessToken = this.connection.access_token;

    try {
      accessToken = await this.ensureFreshToken();
    } catch (err) {
      await this.markExpired();
      throw new Error(
        `Microsoft token refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const body = buildGraphMessage(input, this.connection.signature ?? null);

    const fetchImpl = this.deps.fetch ?? fetch;
    const response = await fetchImpl(GRAPH_SEND_MAIL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      if (response.status === 401 || /invalid_grant|token/i.test(text)) {
        await this.markExpired();
      }
      throw new Error(`Microsoft Graph send failed (${response.status}): ${text}`);
    }

    // Microsoft Graph /me/sendMail returns 202 Accepted with no body.
    // Use a synthetic id based on the connection so callers can correlate.
    return { id: `microsoft-${Date.now()}`, success: true };
  }

  private async ensureFreshToken(): Promise<string> {
    const expiresAt = this.connection.expires_at
      ? new Date(this.connection.expires_at).getTime()
      : null;
    const needsRefresh =
      !expiresAt || expiresAt - Date.now() < FIVE_MINUTES_MS;

    if (!needsRefresh) {
      return this.connection.access_token;
    }

    if (!this.connection.refresh_token) {
      throw new Error("No refresh token available");
    }

    const cca = this.buildMsalClient();
    const result = await cca.acquireTokenByRefreshToken({
      refreshToken: this.connection.refresh_token,
      scopes: [...MICROSOFT_GRAPH_SCOPES],
    });

    if (!result?.accessToken) {
      throw new Error("Refresh response missing access_token");
    }

    const newAccessToken = result.accessToken;
    // MSAL only returns a refresh token on certain flows; retain the existing one
    // when a new one is not provided.
    const newRefreshToken =
      (result as AuthenticationResult & { refreshToken?: string }).refreshToken ??
      this.connection.refresh_token;
    const newExpiresAt = result.expiresOn ?? null;

    this.connection.access_token = newAccessToken;
    this.connection.refresh_token = newRefreshToken;
    this.connection.expires_at = newExpiresAt?.toISOString() ?? null;

    if (this.deps.onTokensRefreshed) {
      await this.deps.onTokensRefreshed({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      } as MicrosoftTokenRefreshPayload);
    }

    return newAccessToken;
  }

  private buildMsalClient(): ConfidentialClientApplication {
    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    const tenant = process.env.MICROSOFT_OAUTH_TENANT ?? "common";

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing Microsoft OAuth configuration (MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_SECRET)."
      );
    }

    return new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${tenant}`,
      },
    });
  }

  private async markExpired(): Promise<void> {
    if (this.deps.markExpired) {
      await this.deps.markExpired(this.connection.workspace_id, this.connection.id);
    } else {
      await setEmailConnectionStatus(this.connection.workspace_id, this.connection.id, "expired");
    }
  }
}

function buildGraphMessage(
  input: ConversationEmailInput,
  signature: string | null
): Record<string, unknown> {
  const htmlBody = signature ? `${input.html}<br><br>${signature}` : input.html;
  const textBody = htmlToPlainText(htmlBody);

  const message: Record<string, unknown> = {
    message: {
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      from: parseAddress(input.from),
      toRecipients: [parseAddress(input.to)],
      replyTo: [parseAddress(input.replyTo)],
    },
    saveToSentItems: true,
  };

  if (input.inReplyTo) {
    (message.message as Record<string, unknown>).internetMessageHeaders = [
      { name: "In-Reply-To", value: input.inReplyTo },
    ];
  }
  if (input.references) {
    const headers =
      ((message.message as Record<string, unknown>).internetMessageHeaders as Array<{
        name: string;
        value: string;
      }>) ?? [];
    headers.push({ name: "References", value: input.references });
    (message.message as Record<string, unknown>).internetMessageHeaders = headers;
  }
  if (input.extraHeaders) {
    const headers =
      ((message.message as Record<string, unknown>).internetMessageHeaders as Array<{
        name: string;
        value: string;
      }>) ?? [];
    for (const [name, value] of Object.entries(input.extraHeaders)) {
      headers.push({ name, value });
    }
    (message.message as Record<string, unknown>).internetMessageHeaders = headers;
  }

  // Microsoft Graph requires a plain-text fallback when contentType is HTML if
  // we want clients that prefer text to receive it; include it as an additional
  // body is not allowed, so we rely on the HTML body and keep text for tracing.
  void textBody;

  return message;
}

function parseAddress(raw: string): { emailAddress: { name: string; address: string } } {
  const match = raw.match(/^(?:"([^"]+)"\s*)?<?([^>]+)>?$/);
  if (!match) {
    return { emailAddress: { name: "", address: raw.trim() } };
  }
  const [, quotedName, address] = match;
  return {
    emailAddress: {
      name: quotedName ?? "",
      address: address.trim(),
    },
  };
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
