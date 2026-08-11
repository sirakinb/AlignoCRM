import "server-only";
import {
  ConfidentialClientApplication,
  type AuthenticationResult,
} from "@azure/msal-node";
import type { EmailConnection } from "@/lib/messaging/email-connections";
import {
  updateEmailConnectionSyncState,
  updateEmailConnectionTokens,
  setEmailConnectionStatus,
} from "@/lib/messaging/email-connections";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";
import { processSyncedInboundEmail } from "./processor";
import { redactProviderError } from "@/lib/messaging/redact";
import { MICROSOFT_GRAPH_SCOPES } from "@/lib/messaging/email-providers/microsoft-scopes";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_MESSAGES_PER_SYNC = 50;
const GRAPH_INBOX_DELTA =
  "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$select=id,subject,body,bodyPreview,from,toRecipients,internetMessageId,isDraft,parentFolderId";

export interface OutlookSyncResult {
  connectionId: string;
  bootstrapped?: boolean;
  processed: number;
  stored: number;
  skipped: number;
  error?: string;
}

/**
 * Poll Microsoft Graph delta for one Outlook connection. First run walks the
 * delta to the end without importing history; later runs process new messages.
 */
export async function syncOutlookConnection(
  connection: EmailConnection,
  deps: { fetch?: typeof fetch } = {}
): Promise<OutlookSyncResult> {
  const fetchImpl = deps.fetch ?? fetch;
  const base: OutlookSyncResult = {
    connectionId: connection.id,
    processed: 0,
    stored: 0,
    skipped: 0,
  };

  const { limit, windowMs } = RATE_LIMITS.emailSyncPerConnection;
  if (!(await checkRateLimit(`email-sync:${connection.id}`, limit, windowMs))) {
    return { ...base, error: "rate_limited" };
  }

  let accessToken: string;
  try {
    accessToken = await ensureFreshAccessToken(connection);
  } catch (err) {
    await setEmailConnectionStatus(connection.workspace_id, connection.id, "expired");
    return {
      ...base,
      error: `token_refresh_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    if (!connection.sync_history_id) {
      const walk = await walkDelta(accessToken, GRAPH_INBOX_DELTA, {
        fetchImpl,
        processMessages: false,
      });
      if (!walk.deltaLink) {
        return { ...base, error: "missing_delta_link" };
      }
      await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
        syncHistoryId: walk.deltaLink,
        lastSyncAt: new Date(),
      });
      return { ...base, bootstrapped: true };
    }

    const walk = await walkDelta(accessToken, connection.sync_history_id, {
      fetchImpl,
      processMessages: true,
      connection,
      maxMessages: MAX_MESSAGES_PER_SYNC,
    });

    if (walk.deltaLink) {
      await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
        syncHistoryId: walk.deltaLink,
        lastSyncAt: new Date(),
      });
    } else {
      await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
        lastSyncAt: new Date(),
      });
    }

    return {
      ...base,
      processed: walk.processed,
      stored: walk.stored,
      skipped: walk.skipped,
    };
  } catch (err) {
    console.error("[email-sync:outlook]", redactProviderError(err));
    const message = err instanceof Error ? err.message : String(err);
    if (/401|invalid_grant|token/i.test(message)) {
      await setEmailConnectionStatus(connection.workspace_id, connection.id, "expired");
    }
    // Stale delta token → re-bootstrap on next run.
    if (/410|syncStateNotFound|resyncRequired/i.test(message)) {
      await updateEmailConnectionSyncState(connection.workspace_id, connection.id, {
        syncHistoryId: null,
        lastSyncAt: new Date(),
      });
      return { ...base, bootstrapped: true, error: "delta_reset" };
    }
    return { ...base, error: message };
  }
}

interface GraphMessage {
  id?: string;
  subject?: string;
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  internetMessageId?: string;
  isDraft?: boolean;
  "@removed"?: { reason?: string };
}

interface WalkResult {
  deltaLink: string | null;
  processed: number;
  stored: number;
  skipped: number;
}

async function walkDelta(
  accessToken: string,
  startUrl: string,
  opts: {
    fetchImpl: typeof fetch;
    processMessages: boolean;
    connection?: EmailConnection;
    maxMessages?: number;
  }
): Promise<WalkResult> {
  let url: string | null = startUrl;
  let deltaLink: string | null = null;
  let processed = 0;
  let stored = 0;
  let skipped = 0;
  const max = opts.maxMessages ?? MAX_MESSAGES_PER_SYNC;

  while (url) {
    const response = await opts.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: "odata.maxpagesize=50",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Graph delta failed (${response.status}): ${text}`);
    }

    const page = (await response.json()) as {
      value?: GraphMessage[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };

    if (opts.processMessages && opts.connection) {
      for (const item of page.value ?? []) {
        if (item["@removed"]) {
          skipped += 1;
          continue;
        }
        if (processed >= max) break;
        processed += 1;

        if (item.isDraft || !item.id) {
          skipped += 1;
          continue;
        }

        const from = item.from?.emailAddress?.address ?? "";
        const to =
          item.toRecipients
            ?.map((r) => r.emailAddress?.address)
            .filter((a): a is string => !!a)
            .join(", ") ?? null;

        const html =
          item.body?.contentType?.toLowerCase() === "html"
            ? item.body.content ?? null
            : null;
        const text =
          item.body?.contentType?.toLowerCase() === "text"
            ? item.body.content ?? null
            : item.bodyPreview ?? null;

        const result = await processSyncedInboundEmail({
          workspaceId: opts.connection.workspace_id,
          connectionEmail: opts.connection.email,
          provider: "microsoft",
          providerMessageId: item.id,
          emailMessageId: item.internetMessageId ?? null,
          fromAddress: from,
          toAddress: to,
          subject: item.subject ?? null,
          bodyHtml: html,
          bodyText: text,
        });

        if (result === "stored") stored += 1;
        else skipped += 1;
      }
    }

    if (page["@odata.deltaLink"]) {
      deltaLink = page["@odata.deltaLink"];
      url = null;
    } else {
      url = page["@odata.nextLink"] ?? null;
    }

    if (opts.processMessages && processed >= max && url) {
      // Keep current page's nextLink as cursor if we hit the per-run cap before
      // a deltaLink — next sync continues from here.
      deltaLink = url;
      break;
    }
  }

  return { deltaLink, processed, stored, skipped };
}

async function ensureFreshAccessToken(connection: EmailConnection): Promise<string> {
  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : null;
  const needsRefresh = !expiresAt || expiresAt - Date.now() < FIVE_MINUTES_MS;
  if (!needsRefresh) return connection.access_token;
  if (!connection.refresh_token) throw new Error("No refresh token available");

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_OAUTH_TENANT ?? "common";
  if (!clientId || !clientSecret) {
    throw new Error("Missing Microsoft OAuth configuration");
  }

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  });

  const result = await cca.acquireTokenByRefreshToken({
    refreshToken: connection.refresh_token,
    scopes: [...MICROSOFT_GRAPH_SCOPES],
  });

  if (!result?.accessToken) throw new Error("Refresh response missing access_token");

  const newRefresh =
    (result as AuthenticationResult & { refreshToken?: string }).refreshToken ??
    connection.refresh_token;
  const newExpiresAt = result.expiresOn ?? null;

  connection.access_token = result.accessToken;
  connection.refresh_token = newRefresh;
  connection.expires_at = newExpiresAt?.toISOString() ?? null;

  await updateEmailConnectionTokens(connection.workspace_id, connection.id, {
    accessToken: result.accessToken,
    refreshToken: newRefresh,
    expiresAt: newExpiresAt,
  });

  return result.accessToken;
}
