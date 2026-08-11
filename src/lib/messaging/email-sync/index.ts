import "server-only";
import {
  listActiveEmailConnectionsForSync,
  type EmailConnection,
} from "@/lib/messaging/email-connections";
import { syncGmailConnection, type GmailSyncResult } from "./gmail";
import { syncOutlookConnection, type OutlookSyncResult } from "./outlook";

export type ConnectionSyncResult = GmailSyncResult | OutlookSyncResult;

export async function syncEmailConnection(
  connection: EmailConnection
): Promise<ConnectionSyncResult> {
  if (connection.provider === "google") {
    return syncGmailConnection(connection);
  }
  if (connection.provider === "microsoft") {
    return syncOutlookConnection(connection);
  }
  return {
    connectionId: connection.id,
    processed: 0,
    stored: 0,
    skipped: 0,
    error: `unsupported_provider:${connection.provider}`,
  };
}

/**
 * Sync all active Gmail/Outlook connections. Each connection is isolated so
 * one failure never blocks another workspace.
 */
export async function syncAllEmailConnections(): Promise<{
  connections: number;
  results: ConnectionSyncResult[];
}> {
  const connections = await listActiveEmailConnectionsForSync();
  const results: ConnectionSyncResult[] = [];

  for (const connection of connections) {
    try {
      results.push(await syncEmailConnection(connection));
    } catch (err) {
      results.push({
        connectionId: connection.id,
        processed: 0,
        stored: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { connections: connections.length, results };
}

export { processSyncedInboundEmail } from "./processor";
export type { SyncedInboundEmail, ProcessSyncedResult } from "./processor";
