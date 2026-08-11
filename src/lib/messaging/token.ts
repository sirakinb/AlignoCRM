import { createHmac, timingSafeEqual } from "node:crypto";
import { requireMessagingTokenSecret } from "./env";
import type { MessageChannel } from "@/types/messaging";

/**
 * HMAC-signed, self-describing tokens for the two public/untrusted messaging
 * surfaces (REQ-SEC-08, REQ-SEC-16). Both share `MESSAGING_TOKEN_SECRET` but
 * carry different payloads and expiries. The format is `v1.<payloadB64url>.<sigB64url>`;
 * the payload is base64url(JSON) and the signature is HMAC-SHA256 over
 * `v1.<payloadB64url>`. Verification is constant-time (timingSafeEqual with a
 * length guard) — a `===` on an HMAC is a finding.
 *
 * These tokens are NOT database ids and carry NOTHING enumerable: an attacker
 * cannot mint or mutate one without the secret, and cannot learn from a rejected
 * token whether the address, workspace, or campaign exists.
 */

const VERSION = "v1";

// ── unsubscribe tokens (REQ-SEC-08) ──────────────────────────────────────────

export interface UnsubPayload {
  /** workspace id */
  w: string;
  /** channel */
  c: MessageChannel;
  /** normalized address (lowercased email / E.164 phone) */
  a: string;
  /** campaign id that sent this (optional; for attribution) */
  cid?: string;
  /** expiry, unix seconds */
  exp: number;
}

/**
 * Mail lives a long time, so an unsubscribe link must keep working for years — a
 * dead opt-out link is a compliance failure. But an unbounded token is also a
 * standing liability, so the security doc pins a long-but-bounded 400-day window
 * (REQ-SEC-08). (Deviation from the acceptance doc's "non-expiring" wording; the
 * security doc governs.)
 */
const UNSUB_TTL_SECONDS = 400 * 24 * 60 * 60;

export function signUnsubToken(
  input: { workspaceId: string; channel: MessageChannel; address: string; campaignId?: string | null }
): string {
  const payload: UnsubPayload = {
    w: input.workspaceId,
    c: input.channel,
    a: input.address,
    ...(input.campaignId ? { cid: input.campaignId } : {}),
    exp: Math.floor(Date.now() / 1000) + UNSUB_TTL_SECONDS,
  };
  return sign(payload);
}

export function verifyUnsubToken(token: string): UnsubPayload | null {
  const payload = verify<UnsubPayload>(token);
  if (!payload) return null;
  if (
    typeof payload.w !== "string" ||
    (payload.c !== "email" && payload.c !== "sms") ||
    typeof payload.a !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}

// ── campaign processor job tokens (REQ-SEC-16) ───────────────────────────────

export interface JobPayload {
  /** campaign id */
  campaignId: string;
  /** workspace id the campaign belongs to */
  workspaceId: string;
  /** monotonically increasing self-invocation counter (bounds the loop) */
  chunk: number;
  /** expiry, unix seconds (short — 15 min) */
  exp: number;
}

const JOB_TTL_SECONDS = 15 * 60;

export function signJobToken(
  input: { campaignId: string; workspaceId: string; chunk: number }
): string {
  const payload: JobPayload = {
    campaignId: input.campaignId,
    workspaceId: input.workspaceId,
    chunk: input.chunk,
    exp: Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS,
  };
  return sign(payload);
}

export function verifyJobToken(token: string): JobPayload | null {
  const payload = verify<JobPayload>(token);
  if (!payload) return null;
  if (
    typeof payload.campaignId !== "string" ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.chunk !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}

// ── primitives ───────────────────────────────────────────────────────────────

function sign(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", requireMessagingTokenSecret())
    .update(`${VERSION}.${body}`)
    .digest("base64url");
  return `${VERSION}.${body}.${sig}`;
}

function verify<T>(token: string): T | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const expected = createHmac("sha256", requireMessagingTokenSecret())
    .update(`${VERSION}.${parts[1]}`)
    .digest("base64url");
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as T;
  } catch {
    return null;
  }
}
