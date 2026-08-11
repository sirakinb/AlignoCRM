import { syncAllEmailConnections } from "@/lib/messaging/email-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron target (every 5 minutes, see vercel.json). Polls all connected
 * Gmail/Outlook mailboxes and lands new inbound messages into conversations.
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set
 * in the project env; requests without it are rejected.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:email-sync] CRON_SECRET is not configured");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { connections, results } = await syncAllEmailConnections();
    const stored = results.reduce((n, r) => n + r.stored, 0);
    const errors = results.filter((r) => r.error).length;

    console.info("[cron:email-sync] complete", { connections, stored, errors });
    return Response.json({ connections, stored, errors, results });
  } catch (err) {
    console.error("[cron:email-sync] failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "sync_failed" }, { status: 500 });
  }
}
