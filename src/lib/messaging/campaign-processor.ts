import { randomBytes } from "node:crypto";
import { insforge } from "@/lib/insforge/server";
import { interpolateTemplate } from "./interpolation";
import { sanitizeHeaderValue, HEADER_LIMITS } from "./header-safety";
import {
  resolveAudienceContacts,
  classifyAudience,
  type AudienceContact,
} from "./campaign-audience";
import {
  sendCampaignMessageRow,
  campaignUnsubUrl,
  type CampaignMessageRow,
} from "./send-message";
import { waitUntil } from "@vercel/functions";
import { signJobToken, type JobPayload } from "./token";
import { normalizeSendableE164 } from "./phone";
import { messagingPublicBaseUrl } from "./urls";
import { escapeHtml } from "@/lib/html";
import { sanitizeOutboundHtml } from "./sanitize-html";
import {
  getCampaign,
  setCampaignFields,
  recomputeCampaignCounters,
  type Campaign,
} from "@/lib/data/campaigns";

const DEFAULT_CHUNK_SIZE = 100; // Resend batch ceiling; also the claim size.
const DEFAULT_TIME_BUDGET_MS = 250_000; // yield before the 300s function limit (P4-14c).
const INSERT_BATCH = 200; // materialized-row insert batch size (P4-12).

// ── materialization (POST /send) ──────────────────────────────────────────────

export interface MaterializeResult {
  totalCount: number;
  suppressedCount: number;
  noAddressCount: number;
}

export class CampaignCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignCapError";
  }
}

/**
 * Resolve the audience, drop suppressed + address-less recipients into the split
 * counters (A-14), render each recipient's body/subject (merge tags, HTML-escaped
 * for email — P4-17), and insert one `queued` `messages` row per sendable
 * recipient with `conversation_id = NULL` (P4-19). Sets the campaign to `sending`
 * with the authoritative counts. Returns promptly; the actual provider sends are
 * done by the chunked processor (P4-12).
 *
 * Shares the resolver/classifier with the preview, so `total + suppressed +
 * no_address` equals the previewed audience size (P4-11, P4-21).
 */
export async function materializeCampaign(
  campaign: Campaign,
  options: { maxRecipients?: number } = {}
): Promise<MaterializeResult> {
  const { workspace_id: workspaceId, channel } = campaign;
  const contacts = await resolveAudienceContacts(workspaceId, campaign.audience);
  const classification = await classifyAudience(workspaceId, channel, contacts);

  // Enforce the recipient cap BEFORE inserting anything (REQ-SEC-17): a partial
  // materialize followed by an abort would be worse than a clean rejection.
  if (
    options.maxRecipients !== undefined &&
    classification.sendable.length > options.maxRecipients
  ) {
    throw new CampaignCapError(
      `Audience of ${classification.sendable.length} exceeds the ${options.maxRecipients} recipient cap.`
    );
  }

  const rows: Array<Record<string, unknown>> = [];
  let extraNoAddress = 0;

  // Sanitize the author's campaign body ONCE (Gate-4 #6) before per-recipient
  // interpolation, so a payload stored in a template can't ship from the verified
  // domain. SMS bodies are plain text — no HTML sanitization needed.
  const safeBody =
    channel === "email" ? sanitizeOutboundHtml(campaign.body) : campaign.body;

  for (const contact of classification.sendable) {
    const built = buildRecipientRow(campaign, contact, safeBody);
    if (!built) {
      // Address failed E.164 normalization at build time — count it with the
      // other address-less recipients rather than materializing an unsendable row.
      extraNoAddress++;
      continue;
    }
    rows.push({
      workspace_id: workspaceId,
      ...(campaign.organization_id
        ? { organization_id: campaign.organization_id }
        : {}),
      conversation_id: null, // campaign rows never appear in a thread (P4-19)
      contact_id: contact.id,
      campaign_id: campaign.id,
      channel,
      direction: "outbound",
      status: "queued",
      subject: built.subject,
      body_text: built.bodyText,
      body_html: built.bodyHtml,
      to_address: built.toAddress,
    });
  }

  // Batched inserts — not one round-trip per recipient (P4-12).
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await insforge.database.from("messages").insert(batch);
    if (error) throw error;
  }

  const result: MaterializeResult = {
    totalCount: rows.length,
    suppressedCount: classification.suppressedCount,
    noAddressCount: classification.noAddressCount + extraNoAddress,
  };

  await setCampaignFields(campaign.id, workspaceId, {
    status: "sending",
    total_count: result.totalCount,
    suppressed_count: result.suppressedCount,
    no_address_count: result.noAddressCount,
    sent_count: 0,
    delivered_count: 0,
    failed_count: 0,
  });

  return result;
}

interface BuiltRow {
  toAddress: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
}

function interpolationContext(contact: AudienceContact) {
  return {
    contact: {
      first_name: contact.first_name ?? "",
      last_name: contact.last_name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      company: contact.company ?? "",
    },
  };
}

/**
 * Render one recipient's row. Email bodies interpolate in `"html"` mode so a
 * contact named `<img onerror=…>` is escaped, not executed (P4-17), and get the
 * unsubscribe footer (P4-23). SMS bodies interpolate in `"text"` mode. Returns
 * null when an SMS address fails E.164 normalization.
 */
function buildRecipientRow(
  campaign: Campaign,
  contact: AudienceContact,
  safeBody: string
): BuiltRow | null {
  const ctx = interpolationContext(contact);

  if (campaign.channel === "email") {
    const email = (contact.email ?? "").trim();
    if (!email) return null;
    const subject = sanitizeHeaderValue(
      interpolateTemplate(campaign.subject ?? "", ctx, { mode: "text" }).text,
      HEADER_LIMITS.subject
    );
    // safeBody is the sanitized template; merge values are HTML-escaped here.
    let bodyHtml = interpolateTemplate(safeBody, ctx, { mode: "html" }).text;
    const unsubUrl = campaignUnsubUrl(campaign.workspace_id, email, campaign.id);
    if (unsubUrl) {
      bodyHtml += unsubscribeFooter(unsubUrl);
    }
    return { toAddress: email, subject, bodyText: null, bodyHtml };
  }

  // SMS
  const phone = contact.phone ?? "";
  let toAddress: string;
  try {
    toAddress = normalizeSendableE164(phone);
  } catch {
    return null;
  }
  const bodyText = interpolateTemplate(safeBody, ctx, { mode: "text" }).text;
  return { toAddress, subject: null, bodyText, bodyHtml: null };
}

function unsubscribeFooter(url: string): string {
  return (
    `<hr style="margin-top:24px;border:none;border-top:1px solid #e5e5e5" />` +
    `<p style="margin-top:12px;font-size:12px;color:#8a8a8a">` +
    `You received this email because you're a contact of this workspace. ` +
    `<a href="${escapeHtml(url)}" style="color:#8a8a8a;text-decoration:underline">Unsubscribe</a>.` +
    `</p>`
  );
}

// ── the chunked processor (POST /process) ─────────────────────────────────────

export interface ProcessorDeps {
  now?: () => number;
  chunkSize?: number;
  timeBudgetMs?: number;
  loadCampaign?: (id: string, ws: string) => Promise<Campaign | null>;
  /** Atomically claim up to `limit` unclaimed queued rows; returns the claimed set. */
  claimChunk?: (
    campaignId: string,
    ws: string,
    limit: number,
    claimToken: string
  ) => Promise<CampaignMessageRow[]>;
  /** Release claimed-but-unsent rows so a successor can reclaim them. */
  releaseRows?: (ids: string[], claimToken: string) => Promise<void>;
  /** Count of rows still `queued` (incl. claim-blocked), for the drain check. */
  countQueued?: (campaignId: string, ws: string) => Promise<number>;
  recompute?: (campaignId: string, ws: string) => Promise<void>;
  markStatus?: (id: string, ws: string, status: Campaign["status"]) => Promise<void>;
  send?: (row: CampaignMessageRow) => Promise<"sent" | "failed">;
  reinvoke?: (campaignId: string, token: string) => Promise<void>;
}

export interface ProcessOutcome {
  done: boolean;
  status?: Campaign["status"];
  processed: number;
  reason?: string;
}

/**
 * Process one self-invocation of a campaign (REQ-SEC-16). The caller has already
 * verified the HMAC job token; this function trusts `token.workspaceId` only to
 * the extent that it loads the campaign by id AND that workspace and re-asserts
 * the match. It claims one chunk atomically, sends it, recomputes counters from
 * aggregates, and re-invokes its successor until the queue drains — bounded by a
 * hard iteration ceiling and a per-invocation time budget.
 */
export async function processCampaignChunk(
  token: JobPayload,
  deps: ProcessorDeps = {}
): Promise<ProcessOutcome> {
  const now = deps.now ?? Date.now;
  const chunkSize = deps.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const timeBudgetMs = deps.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const loadCampaign = deps.loadCampaign ?? getCampaign;
  const claimChunk = deps.claimChunk ?? defaultClaimChunk;
  const releaseRows = deps.releaseRows ?? defaultReleaseRows;
  const countQueued = deps.countQueued ?? defaultCountQueued;
  const recompute =
    deps.recompute ??
    (async (id: string, ws: string) => {
      await recomputeCampaignCounters(id, ws);
    });
  const markStatus =
    deps.markStatus ??
    (async (id: string, ws: string, status: Campaign["status"]) => {
      await setCampaignFields(id, ws, { status });
    });
  const send = deps.send ?? sendCampaignMessageRow;
  const reinvoke = deps.reinvoke ?? defaultReinvoke;

  const start = now();

  const campaign = await loadCampaign(token.campaignId, token.workspaceId);
  // getCampaign filters by workspace, so a foreign/mismatched token → null here.
  if (!campaign || campaign.workspace_id !== token.workspaceId) {
    return { done: true, processed: 0, reason: "not_found" };
  }
  // A campaign moved out of `sending` terminates the chain (REQ-SEC-16.4).
  if (campaign.status !== "sending") {
    return { done: true, status: campaign.status, processed: 0, reason: "not_sending" };
  }

  // Hard self-invocation ceiling (REQ-SEC-16.4, P4-14b).
  const maxChunks = Math.ceil(campaign.total_count / chunkSize) + 5;
  if (token.chunk > maxChunks) {
    await markStatus(campaign.id, campaign.workspace_id, "failed");
    return { done: true, status: "failed", processed: 0, reason: "iteration_cap" };
  }

  const claimToken = `claim:${randomBytes(9).toString("base64url")}`;
  const claimed = await claimChunk(
    campaign.id,
    campaign.workspace_id,
    chunkSize,
    claimToken
  );

  if (claimed.length === 0) {
    // Nothing unclaimed to do. If genuinely nothing is queued, we're done.
    const remaining = await countQueued(campaign.id, campaign.workspace_id);
    if (remaining === 0) {
      await recompute(campaign.id, campaign.workspace_id);
      await markStatus(campaign.id, campaign.workspace_id, "sent");
      return { done: true, status: "sent", processed: 0 };
    }
    // Queued rows exist but are all claim-blocked/orphaned — can't progress this
    // pass. Re-invoke; the ceiling will terminate a pathological loop (P4-14b).
    await reinvoke(
      campaign.id,
      signJobToken({
        campaignId: campaign.id,
        workspaceId: campaign.workspace_id,
        chunk: token.chunk + 1,
      })
    );
    return { done: false, processed: 0, reason: "claim_blocked" };
  }

  let processed = 0;
  // Rows whose send THREW (a transient DB blip in findSuppression/markFailed can
  // throw rather than settling the row) — released in finally so they don't stay
  // claimed-but-unsent forever (Gate-4 #2 / QA FIX-2). A released row is queued +
  // unclaimed again, so a successor reclaims it; the ceiling bounds a permanent
  // fault.
  const unsettled: string[] = [];
  try {
    for (let i = 0; i < claimed.length; i++) {
      if (now() - start > timeBudgetMs) {
        // Stop claiming/sending new work; release what we won't reach and yield.
        const remainingIds = claimed.slice(i).map((r) => r.id);
        await releaseRows(remainingIds, claimToken);
        break;
      }
      try {
        // sendCampaignMessageRow normally settles the row itself and returns
        // "sent"/"failed" without throwing; this guard covers the transient case
        // where the settle path itself throws, so one bad recipient cannot abort
        // the whole chunk.
        await send(claimed[i]);
        processed++;
      } catch {
        unsettled.push(claimed[i].id);
      }
    }
  } finally {
    // ALWAYS release unsettled rows, recompute counters, and schedule a successor
    // — even if something above threw — so the campaign can never wedge in
    // 'sending' with a dead chain (Gate-4 #2).
    if (unsettled.length > 0) {
      await releaseRows(unsettled, claimToken).catch(() => {});
    }
    await recompute(campaign.id, campaign.workspace_id).catch(() => {});
    await reinvoke(
      campaign.id,
      signJobToken({
        campaignId: campaign.id,
        workspaceId: campaign.workspace_id,
        chunk: token.chunk + 1,
      })
    ).catch(() => {});
  }
  return { done: false, processed };
}

// ── default (insforge-backed) processor primitives ────────────────────────────

/** A claim older than this is treated as abandoned and reclaimable (Gate-4 #2). */
const CLAIM_STALE_MS = 10 * 60_000;

async function defaultClaimChunk(
  campaignId: string,
  ws: string,
  limit: number,
  claimToken: string
): Promise<CampaignMessageRow[]> {
  // 0) self-heal: free STALE claims (a claimer that crashed mid-send) so their
  // rows become reclaimable rather than wedging as claimed-but-unsent forever.
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  await insforge.database
    .from("messages")
    .update({ claim_token: null, claimed_at: null })
    .eq("workspace_id", ws)
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .not("claim_token", "is", null)
    .lt("claimed_at", staleBefore);

  // 1) candidates: queued + not yet claimed (claim_token NULL).
  const { data: candidates } = await insforge.database
    .from("messages")
    .select("id")
    .eq("workspace_id", ws)
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .is("claim_token", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  const ids = ((candidates ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return [];

  // 2) atomic claim: stamp claim_token ONLY on rows still queued+unclaimed. The
  // `status='queued' AND claim_token IS NULL` guard + row locking means two
  // concurrent invocations get DISJOINT sets — .select() returns just this
  // invocation's rows (REQ-SEC-16.5). claim_token is a DEDICATED column, so it no
  // longer overloads provider_id or couples to the webhook-idempotency index.
  const { data: claimed, error } = await insforge.database
    .from("messages")
    .update({ claim_token: claimToken, claimed_at: new Date().toISOString() })
    .eq("workspace_id", ws)
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .is("claim_token", null)
    .in("id", ids)
    .select(
      "id, workspace_id, contact_id, channel, subject, body_text, body_html, to_address, campaign_id"
    );
  if (error) throw error;
  return (claimed ?? []) as CampaignMessageRow[];
}

async function defaultReleaseRows(
  ids: string[],
  claimToken: string
): Promise<void> {
  if (ids.length === 0) return;
  await insforge.database
    .from("messages")
    .update({ claim_token: null, claimed_at: null })
    .in("id", ids)
    .eq("claim_token", claimToken); // only release our own claim, and only if unsent
}

async function defaultCountQueued(
  campaignId: string,
  ws: string
): Promise<number> {
  const { count } = await insforge.database
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws)
    .eq("campaign_id", campaignId)
    .eq("status", "queued");
  return count ?? 0;
}

/**
 * Kick the processor by fetching its own absolute URL with a fresh HMAC job
 * token. Fire-and-forget from the /send route; the /process route uses this as
 * its successor re-invocation.
 */
export async function kickProcessor(
  campaignId: string,
  workspaceId: string,
  chunk: number
): Promise<void> {
  const token = signJobToken({ campaignId, workspaceId, chunk });
  await defaultReinvoke(campaignId, token);
}

async function defaultReinvoke(
  campaignId: string,
  token: string
): Promise<void> {
  const base = messagingPublicBaseUrl() ?? "";
  if (!base) {
    console.error("[campaign-processor] no base URL; cannot self-invoke", {
      campaignId,
    });
    return;
  }
  const url = `${base.replace(/\/$/, "")}/api/campaigns/${campaignId}/process`;
  const dispatch = fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch((err) => {
    console.error("[campaign-processor] self-invoke failed", {
      campaignId,
      error: err instanceof Error ? err.name : "unknown",
    });
  });
  // waitUntil keeps the serverless instance alive until the successor request is
  // dispatched, so the self-invocation chain isn't dropped when the parent
  // response returns (Gate-4 #5). A bare `void fetch()` can be killed mid-flight.
  try {
    waitUntil(dispatch);
  } catch {
    // Outside a Vercel request context (e.g. local scripts/tests) waitUntil may
    // throw — the promise still runs; nothing else to do.
  }
}
