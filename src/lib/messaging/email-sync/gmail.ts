import "server-only";
import { google, type Auth } from "googleapis";
import type { EmailConnection } from "@/lib/messaging/email-connections";
import {
  updateEmailConnectionSyncState,
  updateEmailConnectionTokens,
  setEmailConnectionStatus,
} from "@/lib/messaging/email-connections";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { processSyncedInboundEmail } from "./processor";
import { redactProviderError } from "@/lib/messaging/redact";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_MESSAGES_PER_SYNC = 50;

export interface GmailSyncResult {
  connectionId: string;
  bootstrapped?: boolean;
  processed: number;
  stored: number;
  skipped: number;
  error?: string;
}

/**
 * Poll Gmail history for one connection. First run stores the current
 * historyId without backfilling the inbox; subsequent runs process
 * messageAdded events since that cursor.
 */
export async function syncGmailConnection(
  connection: EmailConnection
): Promise<GmailSyncResult> {
  const base: GmailSyncResult = {
    connectionId: connection.id,
    processed: 0,
    stored: 0,
    skipped: 0,
  };

  const { limit, windowMs } = RATE_LIMITS.emailSyncPerConnection;
  if (!(await checkRateLimit(`email-sync:${connection.id}`, limit, windowMs))) {
    return { ...base, error: "rate_limited" };
  }

  let auth: Auth.OAuth2Client;
  try {
    auth = await buildFreshAuth(connection);
  } catch (err) {
    await setEmailConnectionStatus(connection.workspace_id, connection.id, "expired");
    return {
      ...base,
      error: `token_refresh_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const gmail = google.gmail({ version: "v1", auth });

  try {
    if (!connection.sync_history_id) {
      const profile = await gmail.users.getProfile({ userId: "me" });
      const historyId = profile.data.historyId;
      if (!historyId) {
        return { ...base, error: "missing_history_id" };
      }
      await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
        syncHistoryId: String(historyId),
        lastSyncAt: new Date(),
      });
      return { ...base, bootstrapped: true };
    }

    let list;
    try {
      list = await gmail.users.history.list({
        userId: "me",
        startHistoryId: connection.sync_history_id,
        historyTypes: ["messageAdded"],
        maxResults: 100,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // History id too old / invalid → re-bootstrap from current profile.
      if (/404|historyId|notFound/i.test(message)) {
        const profile = await gmail.users.getProfile({ userId: "me" });
        const historyId = profile.data.historyId;
        if (historyId) {
          await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
            syncHistoryId: String(historyId),
            lastSyncAt: new Date(),
          });
        }
        return { ...base, bootstrapped: true, error: "history_reset" };
      }
      throw err;
    }

    const historyId = list.data.historyId
      ? String(list.data.historyId)
      : connection.sync_history_id;

    const messageIds = new Set<string>();
    for (const entry of list.data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        const id = added.message?.id;
        if (id) messageIds.add(id);
      }
    }

    let stored = 0;
    let skipped = 0;
    let processed = 0;

    for (const messageId of messageIds) {
      if (processed >= MAX_MESSAGES_PER_SYNC) break;
      processed += 1;

      const full = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const labelIds = full.data.labelIds ?? [];
      if (labelIds.includes("SENT") || labelIds.includes("DRAFT")) {
        skipped += 1;
        continue;
      }

      const parsed = parseGmailMessage(full.data);
      if (!parsed) {
        skipped += 1;
        continue;
      }

      const result = await processSyncedInboundEmail({
        workspaceId: connection.workspace_id,
        connectionEmail: connection.email,
        provider: "google",
        providerMessageId: messageId,
        emailMessageId: parsed.messageId,
        fromAddress: parsed.from,
        toAddress: parsed.to,
        subject: parsed.subject,
        bodyHtml: parsed.html,
        bodyText: parsed.text,
      });

      if (result === "stored") stored += 1;
      else skipped += 1;
    }

    await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
      syncHistoryId: historyId,
      lastSyncAt: new Date(),
    });

    return { ...base, processed, stored, skipped };
  } catch (err) {
    console.error("[email-sync:gmail]", redactProviderError(err));
    const message = err instanceof Error ? err.message : String(err);
    if (/401|invalid_grant|token/i.test(message)) {
      await setEmailConnectionStatus(connection.workspace_id, connection.id, "expired");
    }
    return { ...base, error: message };
  }
}

async function buildFreshAuth(connection: EmailConnection): Promise<Auth.OAuth2Client> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Google OAuth configuration");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token ?? undefined,
    expiry_date: connection.expires_at
      ? new Date(connection.expires_at).getTime()
      : undefined,
  });

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : null;
  const needsRefresh = !expiresAt || expiresAt - Date.now() < FIVE_MINUTES_MS;
  if (!needsRefresh) return auth;
  if (!connection.refresh_token) throw new Error("No refresh token available");

  const response = await auth.refreshAccessToken();
  const credentials = response.credentials;
  if (!credentials.access_token) throw new Error("Refresh response missing access_token");

  const newExpiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : null;
  const newRefresh = credentials.refresh_token ?? connection.refresh_token;

  connection.access_token = credentials.access_token;
  connection.refresh_token = newRefresh;
  connection.expires_at = newExpiresAt?.toISOString() ?? null;

  await updateEmailConnectionTokens(connection.workspace_id, connection.id, {
    accessToken: credentials.access_token,
    refreshToken: newRefresh,
    expiresAt: newExpiresAt,
  });

  return auth;
}

interface ParsedGmail {
  from: string;
  to: string | null;
  subject: string | null;
  messageId: string | null;
  html: string | null;
  text: string | null;
}

function parseGmailMessage(message: {
  payload?: {
    headers?: Array<{ name?: string | null; value?: string | null }>;
    mimeType?: string | null;
    body?: { data?: string | null };
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null };
      parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } }>;
    }>;
  } | null;
}): ParsedGmail | null {
  const headers = message.payload?.headers ?? [];
  const get = (name: string) =>
    headers.find((h) => (h.name ?? "").toLowerCase() === name)?.value ?? null;

  const from = extractEmailAddress(get("from"));
  if (!from) return null;

  return {
    from,
    to: extractEmailAddress(get("to")),
    subject: get("subject"),
    messageId: get("message-id"),
    html: findBodyPart(message.payload, "text/html"),
    text: findBodyPart(message.payload, "text/plain"),
  };
}

function extractEmailAddress(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/<([^>]+)>/);
  const address = (match?.[1] ?? raw).trim();
  return address.includes("@") ? address : null;
}

function findBodyPart(
  payload:
    | {
        mimeType?: string | null;
        body?: { data?: string | null };
        parts?: Array<{
          mimeType?: string | null;
          body?: { data?: string | null };
          parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } }>;
        }>;
      }
    | null
    | undefined,
  mimeType: string
): string | null {
  if (!payload) return null;
  if ((payload.mimeType ?? "").toLowerCase() === mimeType && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    if ((part.mimeType ?? "").toLowerCase() === mimeType && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    for (const nested of part.parts ?? []) {
      if ((nested.mimeType ?? "").toLowerCase() === mimeType && nested.body?.data) {
        return decodeBase64Url(nested.body.data);
      }
    }
  }
  return null;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}
