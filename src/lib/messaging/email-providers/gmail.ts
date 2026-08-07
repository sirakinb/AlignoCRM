import "server-only";
import { google, type Auth } from "googleapis";
import type {
  ConversationEmailInput,
  ConversationEmailProvider,
  ConversationEmailResult,
} from "@/lib/messaging/conversation-email";
import type { EmailConnection } from "@/lib/messaging/email-connections";
import { setEmailConnectionStatus } from "@/lib/messaging/email-connections";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface GmailTokenRefreshPayload {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date | null;
}

export interface GmailProviderDeps {
  onTokensRefreshed?: (payload: GmailTokenRefreshPayload) => Promise<void>;
  markExpired?: (workspaceId: string, id: string) => Promise<void>;
}

export class GmailApiEmailProvider implements ConversationEmailProvider {
  constructor(
    private connection: EmailConnection,
    private deps: GmailProviderDeps = {}
  ) {}

  async send(input: ConversationEmailInput): Promise<ConversationEmailResult> {
    const auth = this.buildOAuthClient();

    try {
      await this.ensureFreshToken(auth);
    } catch (err) {
      await this.markExpired();
      throw new Error(
        `Gmail token refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const gmail = google.gmail({ version: "v1", auth });
    const raw = buildRawMimeMessage(input, this.connection.signature ?? null);

    try {
      const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      const messageId = data.id;
      if (!messageId) {
        throw new Error("Gmail API returned no message id");
      }

      return { id: messageId, success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("401") || /invalid_grant|token/i.test(message)) {
        await this.markExpired();
      }
      throw new Error(`Gmail send failed: ${message}`);
    }
  }

  private buildOAuthClient(): Auth.OAuth2Client {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Missing Google OAuth configuration (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI)."
      );
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    auth.setCredentials({
      access_token: this.connection.access_token,
      refresh_token: this.connection.refresh_token ?? undefined,
      expiry_date: this.connection.expires_at
        ? new Date(this.connection.expires_at).getTime()
        : undefined,
    });
    return auth;
  }

  private async ensureFreshToken(auth: Auth.OAuth2Client): Promise<void> {
    const expiresAt = this.connection.expires_at
      ? new Date(this.connection.expires_at).getTime()
      : null;

    const needsRefresh =
      !expiresAt || expiresAt - Date.now() < FIVE_MINUTES_MS;

    if (!needsRefresh) return;
    if (!this.connection.refresh_token) {
      throw new Error("No refresh token available");
    }

    const response = await auth.refreshAccessToken();
    const credentials = response.credentials;
    if (!credentials.access_token) {
      throw new Error("Refresh response missing access_token");
    }

    const newAccessToken = credentials.access_token;
    const newRefreshToken = credentials.refresh_token ?? this.connection.refresh_token;
    const newExpiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : null;

    // Keep the in-memory connection up to date for this send.
    this.connection.access_token = newAccessToken;
    this.connection.refresh_token = newRefreshToken;
    this.connection.expires_at = newExpiresAt?.toISOString() ?? null;

    if (this.deps.onTokensRefreshed) {
      await this.deps.onTokensRefreshed({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      } as GmailTokenRefreshPayload);
    }
  }

  private async markExpired(): Promise<void> {
    if (this.deps.markExpired) {
      await this.deps.markExpired(this.connection.workspace_id, this.connection.id);
    } else {
      await setEmailConnectionStatus(this.connection.workspace_id, this.connection.id, "expired");
    }
  }
}

export function buildRawMimeMessage(
  input: ConversationEmailInput,
  signature: string | null
): string {
  const boundary = `----AlignoBoundary${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  const htmlBody = signature
    ? `${input.html}<br><br>${signature}`
    : input.html;
  const textBody = htmlToPlainText(htmlBody);

  const headers: string[] = [
    "MIME-Version: 1.0",
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Reply-To: ${input.replyTo}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  if (input.extraHeaders) {
    for (const [key, value] of Object.entries(input.extraHeaders)) {
      headers.push(`${key}: ${value}`);
    }
  }

  const parts = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(textBody, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody, "utf8").toString("base64"),
    `--${boundary}--`,
  ];

  const raw = parts.join("\r\n");
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
