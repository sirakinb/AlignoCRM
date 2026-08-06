import { insforge } from "@/lib/insforge/server";

/**
 * DB-backed fixed-window rate limiter (REQ-SEC-17). Serverless-safe — an
 * in-memory counter resets per lambda instance, so the window count lives in
 * `messaging_rate_counters` keyed on (bucket_key, window_start).
 *
 * This is a COARSE flood guard, not a precise quota: the increment is a
 * read-then-write (the SDK cannot express an atomic `count = count + 1`), so
 * concurrent requests may undercount at the margin. That is acceptable for the
 * webhook flood-guard use; Vercel Firewall is the real edge layer in front of
 * these routes per REQ-SEC-17. Limits are passed by the caller so every limit
 * lives in one reviewable place at the call sites.
 *
 * Returns true if the request is ALLOWED (under the limit), false if it should
 * be rejected.
 *
 * On a counter error the fallback depends on the bucket's role: webhook flood
 * guards fail OPEN (`failOpen: true`, the default) — a broken limiter must not
 * take the provider webhook offline. The 1:1 SEND path fails CLOSED
 * (`failOpen: false`) because there the counter is the ONLY spend ceiling: a
 * `messaging_rate_counters` outage must not become an uncapped outbound-spend
 * hole (MEDIUM #2 hardening).
 */
export async function checkRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
  failOpen: boolean = true
): Promise<boolean> {
  try {
    const windowStart = new Date(
      Math.floor(Date.now() / windowMs) * windowMs
    ).toISOString();

    const { data } = await insforge.database
      .from("messaging_rate_counters")
      .select("count")
      .eq("bucket_key", bucketKey)
      .eq("window_start", windowStart)
      .limit(1);

    const current = (data?.[0] as { count: number } | undefined)?.count ?? 0;
    if (current >= limit) return false;

    await insforge.database.from("messaging_rate_counters").upsert(
      { bucket_key: bucketKey, window_start: windowStart, count: current + 1 },
      { onConflict: "bucket_key,window_start" }
    );
    return true;
  } catch {
    // Webhook buckets: fail open (availability). Send buckets: fail closed so a
    // counter outage caps spend instead of removing the cap.
    return failOpen;
  }
}

export const RATE_LIMITS = {
  /** Coarse per-route flood guard on the four webhook endpoints. */
  webhookPerRoute: { limit: 600, windowMs: 60_000 },
  /** Inbound-SMS contact auto-creation, per workspace. */
  smsAutoCreatePerWorkspace: { limit: 50, windowMs: 60 * 60_000 },
  /** 1:1 outbound send, per workspace, per minute (REQ-SEC-17, A-13). */
  oneToOneSendPerMinute: { limit: 60, windowMs: 60_000 },
  /** 1:1 outbound send, per workspace, per day (REQ-SEC-17). */
  oneToOneSendPerDay: { limit: 1_000, windowMs: 24 * 60 * 60_000 },
  /** Campaign sends, per workspace, per hour (REQ-SEC-17). */
  campaignSendPerHour: { limit: 5, windowMs: 60 * 60_000 },
  /** Public unsubscribe endpoint, per IP, per minute (REQ-SEC-17). */
  unsubscribePerIp: { limit: 30, windowMs: 60_000 },
} as const;

/** Hard recipient caps for a campaign send (REQ-SEC-17). */
export const CAMPAIGN_CAPS = {
  perCampaign: 5_000,
  perWorkspacePerDay: 10_000,
} as const;

export interface SendRateLimitResult {
  ok: boolean;
  /** seconds until the caller may retry, for the Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * The single rate gate for the two 1:1 send routes (`/api/messages/send` and
 * `/api/conversations/[id]/messages`). Both share ONE per-minute budget and ONE
 * per-day budget keyed on `send:<workspaceId>` (P5-07e), so 30 sends through
 * each route trips the 61st. Bulk campaign sends do NOT go through here — they
 * are governed by the chunked processor and provider limits (P5-07f). Scoped per
 * workspace, so one workspace exhausting its budget never blocks another (P5-07d).
 */
export async function checkSendRateLimit(
  workspaceId: string
): Promise<SendRateLimitResult> {
  // failOpen=false: on a counter outage, block the send rather than uncap spend.
  const minuteOk = await checkRateLimit(
    `send:${workspaceId}`,
    RATE_LIMITS.oneToOneSendPerMinute.limit,
    RATE_LIMITS.oneToOneSendPerMinute.windowMs,
    false
  );
  if (!minuteOk) return { ok: false, retryAfterSeconds: 60 };

  const dayOk = await checkRateLimit(
    `send-day:${workspaceId}`,
    RATE_LIMITS.oneToOneSendPerDay.limit,
    RATE_LIMITS.oneToOneSendPerDay.windowMs,
    false
  );
  if (!dayOk) return { ok: false, retryAfterSeconds: 3600 };

  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Rate gate for `POST /api/campaigns/[id]/send` — 5/hour/workspace (REQ-SEC-17).
 * NOT the 60/min 1:1 limiter (P5-07f): a bulk send would trivially exceed that.
 * Fails closed so a counter outage caps campaign spend rather than uncapping it.
 */
export async function checkCampaignSendRateLimit(
  workspaceId: string
): Promise<SendRateLimitResult> {
  const ok = await checkRateLimit(
    `campaign-send:${workspaceId}`,
    RATE_LIMITS.campaignSendPerHour.limit,
    RATE_LIMITS.campaignSendPerHour.windowMs,
    false
  );
  return ok ? { ok: true, retryAfterSeconds: 0 } : { ok: false, retryAfterSeconds: 3600 };
}

/** Rate gate for the public unsubscribe endpoint — 30/min/IP (REQ-SEC-17). */
export async function checkUnsubscribeRateLimit(ip: string): Promise<boolean> {
  return checkRateLimit(
    `unsub:${ip}`,
    RATE_LIMITS.unsubscribePerIp.limit,
    RATE_LIMITS.unsubscribePerIp.windowMs,
    true // public endpoint: fail open so a counter outage can't wedge opt-outs
  );
}
