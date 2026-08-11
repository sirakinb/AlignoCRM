import { verifySvixSignature } from "@/lib/messaging/svix-signature";
import { claimWebhookEvent } from "@/lib/messaging/webhook-events";
import {
  findConversationByReplyToken,
  getContactEmail,
  insertInboundMessage,
  bumpConversationInbound,
  findContactByEmail,
  createInboundEmailContact,
} from "@/lib/messaging/webhook-store";
import { findWorkspaceByEmailAlias } from "@/lib/messaging/reply-alias";
import { ensureConversation } from "@/lib/messaging/send-message";
import { sanitizeInboundHtml } from "@/lib/messaging/sanitize-html";
import { stripQuotedReply } from "@/lib/messaging/quote-strip";
import { sanitizeHeaderValue, HEADER_LIMITS } from "@/lib/messaging/header-safety";
import { redactAddress, redactProviderError } from "@/lib/messaging/redact";
import { checkRateLimit, RATE_LIMITS } from "@/lib/messaging/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB (REQ-SEC-05)
const MAX_HTML_BYTES = 512 * 1024; // stored body_html cap
const MAX_TEXT_BYTES = 128 * 1024; // stored body_text cap

const REPLY_DOMAIN = process.env.MESSAGING_REPLY_DOMAIN ?? "reply.alignocrm.com";

interface InboundEmail {
  from?: unknown;
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
  headers?: unknown;
  attachments?: unknown;
  message_id?: unknown;
  messageId?: unknown;
  // The email.received webhook carries METADATA ONLY — Resend omits body,
  // headers, and attachments to stay under serverless payload limits. The parsed
  // body is fetched separately from the Received-emails API via this id.
  email_id?: unknown;
  id?: unknown;
}

/**
 * Fetch the parsed body for an inbound email from Resend's Received-emails API.
 * The webhook payload is metadata-only, so without this the stored message body
 * is always empty. Best-effort: on any failure we return nulls and still store
 * the message (subject + routing survive) rather than dropping the inbound mail.
 */
async function fetchInboundBody(
  emailId: string
): Promise<{ html: string | null; text: string | null; headers: unknown } | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[webhook:resend-inbound] RESEND_API_KEY not set; cannot fetch body");
    return null;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.resend.com/emails/inbound/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn("[webhook:resend-inbound] body fetch failed", { status: res.status });
      return null;
    }
    const full = (await res.json()) as { html?: unknown; text?: unknown; headers?: unknown };
    return {
      html: typeof full.html === "string" ? full.html : null,
      text: typeof full.text === "string" ? full.text : null,
      headers: full.headers,
    };
  } catch (err) {
    console.warn("[webhook:resend-inbound] body fetch threw", redactProviderError(err));
    return null;
  }
}

/**
 * Resend inbound-email webhook (REQ-SEC-01/03/04/05/07/10/11).
 * Reply token routes to a conversation; unknown token → 200 drop (never bounce,
 * that turns the endpoint into a token oracle). HTML sanitized before storage;
 * inbound never mutates contacts or suppressions.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook:resend-inbound] RESEND_INBOUND_WEBHOOK_SECRET not configured");
    return new Response("Not configured", { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  const verified = verifySvixSignature(raw, request.headers, secret);
  if (!verified.ok) {
    console.warn("[webhook:resend-inbound] signature rejected");
    return new Response("Invalid signature", { status: 401 });
  }

  const { limit, windowMs } = RATE_LIMITS.webhookPerRoute;
  if (!(await checkRateLimit("wh:resend-inbound", limit, windowMs))) {
    return new Response("Rate limited", { status: 429, headers: { "retry-after": "60" } });
  }

  try {
    const event = verified.event as { data?: InboundEmail };
    const data = event?.data ?? (verified.event as InboundEmail);

    const recipients = extractAddresses(data?.to);
    const fromAddress = sanitizeHeaderValue(firstAddress(data?.from), HEADER_LIMITS.address);

    // Routing, two forms of reply address:
    //   r+<token>@…  → conversation directly via conversations.reply_token (legacy)
    //   <alias>@…    → workspace via alias, contact via sender, then the
    //                  (workspace, contact) conversation (pretty addresses)
    const token = firstReplyToken(recipients);
    const aliasLocal = token ? null : firstAliasLocalPart(recipients);

    let conversation: {
      id: string;
      workspace_id: string;
      contact_id: string;
      unread_count: number;
    } | null = null;
    let senderVerified = false;
    let toAddress: string;

    if (token) {
      conversation = await findConversationByReplyToken(token);
      if (!conversation) {
        console.info("[webhook:resend-inbound] unknown reply token");
        return new Response("ok", { status: 200 }); // unknown token → drop (P2-13)
      }
      toAddress = `r+${token}@${REPLY_DOMAIN}`;

      // Idempotency: event id is the svix-id. (A resent inbound also carries the
      // same Message-ID, deduped by the per-workspace unique index as a backstop.)
      // Claimed BEFORE the body fetch so a webhook retry never re-fetches.
      const first = await claimWebhookEvent("resend", verified.eventId, "email.inbound");
      if (!first) return new Response("ok", { status: 200 });

      // Sender verification: the reply token only ROUTES, it does not AUTHENTICATE
      // (it travels in Reply-To on every outbound mail). Compare From to the
      // contact's email; on mismatch store the message but flag it (REQ-SEC-07).
      const contactEmail = await getContactEmail(conversation.workspace_id, conversation.contact_id);
      senderVerified =
        !!fromAddress &&
        !!contactEmail &&
        fromAddress.trim().toLowerCase() === contactEmail.trim().toLowerCase();
    } else {
      if (!aliasLocal || !fromAddress) {
        console.info("[webhook:resend-inbound] no routable recipient", {
          to: recipients.map(redactAddress),
        });
        return new Response("ok", { status: 200 }); // malformed/absent → drop (P2-13)
      }
      const workspaceId = await findWorkspaceByEmailAlias(aliasLocal);
      if (!workspaceId) {
        console.info("[webhook:resend-inbound] unknown alias");
        return new Response("ok", { status: 200 }); // unknown alias → drop, never bounce
      }
      toAddress = `${aliasLocal}@${REPLY_DOMAIN}`;

      const first = await claimWebhookEvent("resend", verified.eventId, "email.inbound");
      if (!first) return new Response("ok", { status: 200 });

      let contact: { id: string } | null = await findContactByEmail(workspaceId, fromAddress);
      if (!contact) {
        // Same auto-create policy + rate limit as mailbox sync: unknown senders
        // become contacts, capped per workspace so alias spam can't flood the CRM.
        const { limit, windowMs } = RATE_LIMITS.emailAutoCreatePerWorkspace;
        if (!(await checkRateLimit(`email-autocreate:${workspaceId}`, limit, windowMs))) {
          console.warn("[webhook:resend-inbound] auto-create rate limited");
          return new Response("ok", { status: 200 });
        }
        contact = await createInboundEmailContact(workspaceId, fromAddress);
      }
      conversation = await ensureConversation(workspaceId, contact.id);
      // Contact was resolved (or created) FROM the sender address, so the
      // sender matches by construction.
      senderVerified = true;
    }

    // The webhook is metadata-only; fetch the parsed body from the API.
    const emailId = asString(data?.email_id) ?? asString(data?.id);
    const fetched = emailId ? await fetchInboundBody(emailId) : null;
    const headersSource = fetched?.headers ?? data?.headers;

    const messageId =
      sanitizeHeaderValue(
        headerValue(headersSource, "message-id") ??
          asString(data?.message_id) ??
          asString(data?.messageId),
        HEADER_LIMITS.messageId
      );

    const subject = sanitizeHeaderValue(asString(data?.subject), HEADER_LIMITS.subject);

    // Cap the INPUT before sanitizing (not the output) so truncation can never
    // cut mid-tag and reintroduce unbalanced markup (Security #7). Sanitize on
    // write; strip quotes for the text view; full sanitized HTML kept.
    // Prefer the fetched body; fall back to any inline fields for forward-compat
    // if Resend ever starts including them in the webhook.
    const rawHtml = ((fetched?.html ?? asString(data?.html)) ?? "").slice(0, MAX_HTML_BYTES);
    const bodyHtml = sanitizeInboundHtml(rawHtml) || null;
    const rawText = (fetched?.text ?? asString(data?.text)) ?? "";
    const bodyText = stripQuotedReply(rawText).slice(0, MAX_TEXT_BYTES) || null;

    const attachments = Array.isArray(data?.attachments) ? data.attachments : [];
    const providerResponse =
      attachments.length > 0
        ? { has_attachments: true, attachment_count: attachments.length } // indicator only, no bytes (P2-16)
        : null;

    await insertInboundMessage({
      workspaceId: conversation.workspace_id,
      conversationId: conversation.id,
      contactId: conversation.contact_id,
      channel: "email",
      bodyText,
      bodyHtml,
      fromAddress,
      toAddress,
      provider: "resend",
      providerId: messageId,
      emailMessageId: messageId,
      subject,
      senderVerified,
      providerResponse,
    });

    await bumpConversationInbound(conversation.id, {
      channel: "email",
      preview: (bodyText ?? subject ?? "").slice(0, 140),
      subject,
      currentUnread: conversation.unread_count,
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[webhook:resend-inbound] processing error", redactProviderError(err));
    return new Response("ok", { status: 200 });
  }
}

// ── payload extractors (defensive: Resend inbound shapes vary) ────────────────

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Normalize a `to`/`from` field into address strings. */
function extractAddresses(value: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const a = o.address ?? o.email;
      if (typeof a === "string") out.push(a);
    }
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);
  return out;
}

function firstAddress(value: unknown): string | null {
  return extractAddresses(value)[0] ?? null;
}

// Anchored to our reply domain so `r+<token>@attacker.com` (or any other host)
// is not accepted as a routing address (Security #6).
const REPLY_TOKEN_RE = new RegExp(
  `^r\\+([A-Za-z0-9_-]+)@${REPLY_DOMAIN.replace(/[.\\]/g, "\\$&")}$`,
  "i"
);

/** Find the first recipient of the form r+<token>@<reply-domain> and return the token. */
function firstReplyToken(recipients: string[]): string | null {
  for (const r of recipients) {
    const m = REPLY_TOKEN_RE.exec(r.trim());
    if (m) return m[1];
  }
  return null;
}

// Workspace alias addresses (pretty Reply-To): lowercase slug local part on our
// reply domain. Anchored to the domain for the same reason as REPLY_TOKEN_RE;
// the charset excludes "+", so r+<token> addresses can never match here.
const ALIAS_ADDR_RE = new RegExp(
  `^([a-z0-9][a-z0-9-]{1,62})@${REPLY_DOMAIN.replace(/[.\\]/g, "\\$&")}$`,
  "i"
);

/** Find the first recipient of the form <alias>@<reply-domain> and return the alias. */
function firstAliasLocalPart(recipients: string[]): string | null {
  for (const r of recipients) {
    const m = ALIAS_ADDR_RE.exec(r.trim());
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** Look up a header value from Resend's `headers` array (or object) by name. */
function headerValue(headers: unknown, name: string): string | null {
  const target = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && typeof h === "object") {
        const o = h as Record<string, unknown>;
        if (typeof o.name === "string" && o.name.toLowerCase() === target) {
          return typeof o.value === "string" ? o.value : null;
        }
      }
    }
  } else if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === target && typeof v === "string") return v;
    }
  }
  return null;
}
