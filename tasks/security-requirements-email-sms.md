# Security Requirements — Email & SMS Messaging Center

**Owner:** security agent. **Status:** governing document. Where this conflicts with `tasks/plan-email-sms-infrastructure.md`, this document wins (per that plan's own statement).

**Scope:** everything introduced by the messaging center — `workspace_channels`, `conversations`, `messages`, `campaigns`, `suppressions`, the four webhook receivers, the app API surface under `/api/conversations`, `/api/messages`, `/api/campaigns`, `/api/templates`, `/api/suppressions`, `/api/messaging`, `/api/unsubscribe`, the transport layer in `src/lib/messaging/`, and the Conversations / Email / SMS UI.

**Baseline established:** 2026-08-05, against branch `feat/agent-layer` at `45b540d`.

---

## 0. Why this document is unusually strict

The messaging center is the first subsystem in this codebase that (a) accepts unauthenticated input from the public internet that gets **stored and then rendered to a logged-in user**, (b) can **spend money** on every request, and (c) handles **third-party PII** (contact email bodies, phone numbers, conversation content) rather than just CRM field data.

Two pre-existing weaknesses turn each of those into a real finding rather than a theoretical one:

1. **`src/lib/auth/session.ts:22-29` does not verify anything.** `getAuthenticatedUser()` reads the `insforge-user` cookie, `JSON.parse`s it, checks that `id` and `email` are strings, and returns it. The `insforge-session` token is checked for *presence only* — never validated against InsForge. Any client can `curl -H 'Cookie: insforge-session=x; insforge-user={"id":"<uuid>","email":"a@b.c"}'` and be fully authenticated as an arbitrary user. `src/middleware.ts:59-63` excludes `/api` from the matcher, so middleware provides no compensating control on API routes.
2. **RLS is written but never enabled.** `src/lib/db/migrations/009_organizations.sql` defines `is_org_member()` and `CREATE POLICY org_member_all ON ...` for 22 tables (lines 366-497) but contains **no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`** statement anywhere. The policies are inert. Combined with `src/lib/insforge/client.ts` connecting with `NEXT_PUBLIC_INSFORGE_ANON_KEY` — a key that ships in the browser bundle by definition — the database is reachable directly, without the app, by anyone who views source.

Everything below assumes those two facts. Section 3 registers them formally.

---

## 1. Threat model

Assets, ranked: message bodies and conversation history (third-party PII, plausibly privileged in a legal-CRM context) > contact PII (email/phone) > Twilio/Resend credentials (direct financial loss) > sender-domain reputation (hard to recover, business-ending for the product) > CRM records generally.

### T1 — Inbound webhook forgery
Four new routes accept unauthenticated POSTs. Precedent in this repo is bad: `src/lib/api/lead-webhook.ts:47-53` is the only existing webhook auth, and it delegates to `getInternalApiAuthContext()`, whose non-prod branch (`internal-auth.ts:52-59`) returns `authorized: true` when `ALIGNO_API_KEY` is unset **and no key header is sent**. Un-authenticated messaging webhooks would let an attacker inject fabricated inbound "replies" into conversations, mark campaign messages delivered, forge bounce/complaint events (poisoning the suppression list and silently killing a workspace's ability to email a contact), and create unbounded contacts via the SMS auto-create path.

### T2 — Reply-token guessing / enumeration
`conversations.reply_token` routes inbound email to a thread. A guessable token lets an attacker write into an arbitrary conversation. The existing token precedent in this repo is inadequate: `src/app/api/testimonial-requests/route.ts:10-20` mints share tokens as `slug + crypto.randomUUID().replace(/-/g,'').slice(0,10)` — **40 bits** of entropy, with a name-derived prefix that shrinks the search space further. Copying that pattern into `reply_token` would be a vulnerability.

A related and more likely variant: the reply token is **semi-public by construction** — it appears in the `Reply-To:` header of every email sent to that contact. Forwarded mail, shared inboxes, ticketing systems, and mail-archive tooling all leak it. Entropy stops brute force; it does not stop replay by anyone who legitimately received the mail. Sender identity must therefore never be inferred from the token alone.

### T3 — Stored XSS via inbound email HTML
Inbound email `body_html` is attacker-controlled markup, stored, then rendered inside an authenticated dashboard session. Because the session cookie is unverified JSON (§0.1), an XSS payload that exfiltrates `document.cookie` yields a permanent, replayable impersonation of that user — the cookie is the credential, there is no bound token to expire. Vectors: `<script>`, `onerror=`/`onload=` handlers, `javascript:` and `data:text/html` URLs, `<svg><animate onbegin>`, `<iframe srcdoc>`, `<style>` with `expression()`/`@import`, `<base href>`, `<form>` re-pointing, mXSS via mismatched-nesting parser differentials.

### T4 — HTML / header injection through merge tags and user templates
`src/lib/messaging/interpolation.ts:57-67` returns `String(value)` with **no escaping** and is documented in the plan as feeding email HTML. Contact fields are attacker-supplied at the boundary: `src/lib/api/lead-webhook.ts` accepts `name`, `email`, `phone`, `details` from any caller and writes them straight to `contacts`. A contact named `<img src=x onerror=...>` becomes markup in every campaign email containing `{{contact.first_name}}`, and in the CRM's own rendering of the composed body. This is the same class of bug already live in `src/app/api/organizations/invites/route.ts:54-87`, where `${orgName}` and `${inviterName}` are interpolated raw into an HTML email template.

Header injection is the sibling: CR/LF or a stray `<...>` in a subject, display name, or `to` address can split headers or inject recipients. Resend's JSON API is structurally resistant, but `from_name` and `from_local_part` from `workspace_channels.config` flow into a constructed `"Name" <local@domain>` string in `send-message.ts` — that concatenation is the injection point.

### T5 — Cross-tenant data access
Tenancy is app-level only (§0.2). New surfaces that can leak across tenants:
- Webhook handlers have **no session** and must derive tenant from a DB row. Any handler that trusts a `workspace_id` from the webhook payload is a direct cross-tenant write.
- `campaigns.audience JSONB {tagIds, statuses, all}` — tag IDs are client-supplied opaque UUIDs. If the audience resolver queries `contact_tags` by `tag_id` without also constraining `workspace_id`, a caller can enumerate another tenant's contacts *and mail them*, which is exfiltration with delivery attached.
- `/api/conversations/[id]`, `/api/campaigns/[id]`, `/api/suppressions` — IDOR on every `[id]` route.
- `/api/campaigns/[id]/process` authenticates with the global `ALIGNO_API_KEY`, which resolves to `FALLBACK_WORKSPACE_ID = "default"` (`internal-auth.ts:45-50, 60-66`), not to the campaign's workspace. Per prior finding on this codebase, the global-key path writes into a workspace that is invisible in the UI. A processor that scopes by `authContext.tenant.workspaceId` will silently do nothing, or worse, act on the wrong tenant's rows.

### T6 — Unsubscribe-token forgery and enumeration
A sequential or DB-ID-derived unsubscribe link lets anyone enumerate and suppress arbitrary addresses (denial of communication) and confirm whether an address is a contact of a given workspace (membership disclosure). Second-order: RFC 8058 `List-Unsubscribe-Post` means mail clients and security scanners will **automatically issue requests** to whatever URL is advertised. A `GET` that mutates state will be fired by link-prefetchers and corporate URL-detonation appliances, producing spurious unsubscribes.

### T7 — SMS pumping / toll fraud, and spend abuse generally
Every outbound message costs money and there is no spend ceiling anywhere in the design. Because authentication is forgeable (§0.1), `/api/messages/send` and `/api/campaigns/[id]/send` are effectively **unauthenticated paid endpoints**. Classic SMS pumping needs an unauthenticated send-to-arbitrary-number primitive; this design has no OTP flow, but a forged cookie plus contact-create (also reachable via the open lead webhook) supplies the same primitive: create a contact with a premium-rate international number, send to it, collect the revenue share. Additionally, `/api/campaigns/[id]/process` "self-re-invokes until drained" — a re-invocation loop with no claim/lease and no iteration ceiling is a self-inflicted amplification bug.

### T8 — Secrets exposure
`TWILIO_AUTH_TOKEN` is not merely a send credential — it is the **verification key for inbound Twilio webhooks**, so its disclosure converts T1 from "blocked" to "wide open". `RESEND_API_KEY` grants send-as-your-domain. Exposure paths: a `NEXT_PUBLIC_` prefix (the repo already exposes one key that way, so the pattern is present), import of a server module into a client component, inclusion in an error object returned to the client (`invites/route.ts:100-103` and `lead-webhook.ts:158-164` both echo `error.message` to the caller), or `console.error(err)` on a provider SDK error whose `config.headers` carries the bearer token.

### T9 — Webhook replay
A captured-and-replayed signed webhook is still validly signed. Without idempotency, replay double-counts campaign metrics, re-inserts inbound messages, and can un-suppress or re-suppress addresses. Svix's timestamp tolerance limits the window for Resend; **Twilio's signature has no timestamp at all**, so a captured Twilio callback is replayable indefinitely and idempotency is the only defense.

### T10 — SSRF and outbound-request abuse
The design should have no server-side URL fetching. The risks are the ones that get added by accident: fetching inbound-email remote images server-side to proxy them; following redirects to validate campaign links; fetching a favicon or preview for a URL a user pasted; Resend inbound attachment URLs (deferred, but the payload will contain them). Client-side, remote `<img>` in rendered inbound HTML leaks the reading user's IP, User-Agent, and read-time to the sender.

### T11 — Abuse of send endpoints (spam / reputation)
Compromise or misuse of a send endpoint burns `send.alignocrm.com`'s domain reputation and can get the Twilio toll-free number deregistered. Unlike data breaches, this is not recoverable by patching. Rate limiting is a security control here, not a performance one.

### T12 — Inbound content as a poisoning vector
Beyond XSS: attacker-controlled inbound text is displayed to users and (per repo direction) may reach an LLM-backed agent surface. Quoted-reply stripping is a heuristic parser operating on hostile input — it must not be able to throw unhandled, and unbounded body sizes are a memory/DoS vector on a serverless function.

---

## 2. Mandatory requirements

Each item: **what** / **why** (threat) / **verify**. `MUST` is blocking; `SHOULD` is blocking unless explicitly waived in writing by the team lead with a note in this file.

### Webhook authentication

---
**REQ-SEC-01 — Svix signature verification on both Resend webhooks.**

*What:* `POST /api/webhooks/resend` and `POST /api/webhooks/resend/inbound` MUST verify the Svix signature before parsing or acting on the payload. Use the `svix` package's `Webhook` class. `svix@1.84.1` is already present in `node_modules` as a transitive dependency of `resend`, but it MUST be added to `package.json` `dependencies` explicitly — relying on a hoisted transitive dep for a security control is unacceptable, as a `resend` minor bump can remove it.

Verification MUST run against the **raw request body string**, obtained with `await request.text()`. Do not `await request.json()` first and re-serialize — key ordering and unicode escaping will differ and either break verification or, if someone "fixes" it by verifying the re-serialized form, break the security property. Next.js App Router route handlers receive the unmodified body from `request.text()`; no `bodyParser` config is needed (that is a Pages Router concern).

```ts
// src/app/api/webhooks/resend/route.ts
import { Webhook } from "svix";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  const raw = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: unknown;
  try {
    event = new Webhook(secret).verify(raw, headers);
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  // ... only now is `event` trustworthy
}
```

There MUST be **no development bypass** — no `if (process.env.NODE_ENV !== "production") return true`, no "skip if secret unset and we're local". If the secret is absent, return `503` and log; never process. This is a direct rejection of the `internal-auth.ts:52-59` pattern, which the plan's local-tunnel dev workflow makes actively dangerous (see REQ-SEC-25).

The two webhooks use **separate secrets** (`RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`), each verified against its own endpoint's secret. Do not accept either secret on either route.

*Why:* T1, T9. Svix's `verify()` also enforces a ±5-minute timestamp tolerance, which is the replay window bound for Resend.

*Verify:* Unit test per route: (a) valid signature → 200 and side effect occurs; (b) tampered body, valid-looking headers → 401, **no DB write**; (c) missing `svix-*` headers → 401; (d) timestamp shifted 10 minutes → 401; (e) signature generated with the *other* endpoint's secret → 401. Assert the DB mock recorded zero calls in every failure case — a route that 401s *after* writing has failed the test. Grep the two files for `NODE_ENV` and confirm no hits.

---
**REQ-SEC-02 — `X-Twilio-Signature` validation with an explicitly configured URL.**

*What:* `POST /api/webhooks/twilio/inbound` and `POST /api/webhooks/twilio/status` MUST validate `X-Twilio-Signature` before acting. Use `validateRequest` from the `twilio` package (add as a direct dependency; it is needed for sending anyway) rather than hand-rolling HMAC-SHA1.

**The URL-reconstruction pitfall — read this before writing the route.** Twilio computes the signature over the exact URL it was configured to call, concatenated with the POST parameters. Reconstructing that URL inside a Next.js route handler on Vercel is where implementations break, in two different ways:

- *It silently fails.* `request.url` inside a Vercel-hosted route handler does not reliably reproduce the public URL Twilio dialed. Depending on the runtime and rewrite path it can surface an internal hostname, `http://` instead of `https://` (Vercel terminates TLS at the edge), or a normalized path. Signature check fails, all inbound SMS is dropped, and someone "fixes" it by disabling verification.
- *It silently succeeds for an attacker.* The obvious repair is to rebuild the URL from `request.headers.get("host")` or `x-forwarded-host`/`x-forwarded-proto`. Those are **attacker-controlled request headers**. An attacker who knows any URL for which they possess a valid Twilio signature — or who simply wants to grind — can set `Host:` to whatever value makes their forged signature validate. Header-derived URL reconstruction is not a validation; it is a bypass with extra steps.

**The correct approach:** pin the URL in configuration. Add `MESSAGING_PUBLIC_BASE_URL` (e.g. `https://app.alignocrm.com`) and build the signed URL as a constant string. It MUST byte-for-byte match what is entered in the Twilio console — including scheme, no trailing slash, no query string.

```ts
// src/lib/messaging/twilio-signature.ts
import { validateRequest } from "twilio";

export async function verifyTwilioRequest(request: Request, path: string) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.MESSAGING_PUBLIC_BASE_URL;
  if (!token || !base) return { ok: false as const, params: null };

  const signature = request.headers.get("x-twilio-signature") ?? "";
  // Read raw text, then parse. Do NOT use request.formData() — it consumes the
  // body and we need deterministic control over parameter extraction.
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const url = `${base.replace(/\/$/, "")}${path}`; // path is a hardcoded literal
  const ok = validateRequest(token, signature, url, params);
  return { ok, params: ok ? params : null };
}
```

Call sites pass a **string literal** path (`"/api/webhooks/twilio/inbound"`), never a value derived from the request.

Additional constraints:
- Configure the Twilio webhook URLs with **no query string**. If one is ever added it becomes part of the signed URL and must be reproduced exactly; avoid the class of bug entirely.
- Twilio posts `application/x-www-form-urlencoded`. If the content type is anything else, reject with 400 before validation — do not attempt the `bodySHA256` JSON variant, which we do not use.
- Preview deployments have a different hostname than `MESSAGING_PUBLIC_BASE_URL`. That is correct and intended: **Twilio webhooks must not be pointed at preview deployments.** Use a dedicated Twilio subaccount or test credentials for non-production.
- Non-production MUST NOT bypass validation. For local development, run the tunnel hostname as `MESSAGING_PUBLIC_BASE_URL` and configure a *separate* Twilio test-credential webhook; do not add a skip flag.

*Why:* T1, T8. Twilio signature validation is the only thing standing between the public internet and "inject arbitrary inbound SMS, forge STOP for any contact, mark any message delivered."

*Verify:* Unit-test `verifyTwilioRequest` with a fixture generated by `twilio`'s own signing helper: (a) correct URL + params → valid; (b) one param mutated → invalid; (c) request carrying `Host: evil.example` and `X-Forwarded-Host: evil.example` → still validates against the pinned base URL, proving headers are not consulted. Grep both route files for `request.url`, `"host"`, and `x-forwarded` and confirm zero hits. Manually confirm the console-configured URL string equals `MESSAGING_PUBLIC_BASE_URL + path` character for character.

---
**REQ-SEC-03 — Webhook handlers derive tenant exclusively from the database.**

*What:* No webhook handler may read `workspace_id`, `organization_id`, or any tenant identifier from the request payload, headers, or query string — even after a valid signature. Signature validity proves *the provider sent this*, not *which tenant it concerns*. Tenant MUST be resolved by looking up an owned row:
- Resend delivery events → `messages` row via `(provider, provider_id)`; take `workspace_id` from that row.
- Resend inbound → `conversations` row via `reply_token`; take `workspace_id` from that row.
- Twilio inbound → `workspace_channels` row via the `To` number (the workspace's own number); take `workspace_id` from that row. Match the contact by `From` **within that workspace only**.
- Twilio status → `messages` row via `MessageSid`.

If no owning row is found: return `200`, write nothing, log a single structured line with the identifier only. Never create a row in `FALLBACK_WORKSPACE_ID`.

*Why:* T5, T1. This is the single control that keeps unauthenticated endpoints from becoming cross-tenant writes.

*Verify:* Code review of all four handlers — grep for `workspace_id` and confirm every occurrence is a *read from a queried row* or a *filter using such a value*, never an assignment from payload data. Test: signed webhook whose payload contains `"workspace_id": "other-tenant"` alongside a `provider_id` belonging to workspace A → the write lands in A. Test: signed webhook with an unknown identifier → 200, zero writes.

---
**REQ-SEC-04 — Idempotency on every webhook-driven write.**

*What:* The plan's `UNIQUE (provider, provider_id)` partial index on `messages` is necessary but not sufficient — it dedupes *messages*, not *events*. A Resend `bounced` event and a later `complained` event share a `provider_id`; a replayed `delivered` must not re-run its side effects.

Add a dedicated table:

```sql
CREATE TABLE messaging_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,              -- 'resend' | 'resend_inbound' | 'twilio'
  event_id TEXT NOT NULL,              -- svix-id, or Twilio MessageSid + MessageStatus
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
```

Handlers MUST attempt the insert first and treat a unique-violation as "already processed → return 200, do nothing." Event id source: `svix-id` header for both Resend webhooks; `${MessageSid}:${MessageStatus}` for Twilio status; `MessageSid` for Twilio inbound.

Side effects that MUST be idempotent regardless: campaign counter increments (derive counters by aggregating `messages` rather than blind `+1`, or gate the increment on an actual status *transition*), suppression inserts (`ON CONFLICT DO NOTHING` against the plan's `UNIQUE (workspace_id, channel, address)`), and `unread_count` bumps.

*Why:* T9. Twilio signatures carry no timestamp, so replay is unbounded in time and this is the only defense.

*Verify:* Test: post the identical signed payload twice → exactly one `messages` row, one suppression row, counters incremented once. Test: replay a Twilio status callback captured an hour earlier → 200, no state change. Review every `increment`/`+1` in the webhook path.

---
**REQ-SEC-05 — Bounded webhook bodies and total-failure containment.**

*What:* Reject webhook bodies over 1 MB (check `content-length`, and cap the `request.text()` result) with 413 before parsing. Cap stored `body_html` at 512 KB and `body_text` at 128 KB, truncating with a visible marker. Every handler wraps its work in try/catch and returns `200` on *internal* errors after logging — a 500 makes Resend and Twilio retry, and a poison payload becomes a self-inflicted flood. Signature failures remain `401` (they are not retryable and should be visible in the provider dashboard).

*Why:* T12, T11.

*Verify:* Test with a 2 MB body → 413, no parse attempt. Test with a handler forced to throw → 200 plus a logged error.

### Tokens and links

---
**REQ-SEC-06 — Reply tokens: ≥128-bit, CSPRNG, opaque, no derived prefix.**

*What:*

```ts
import { randomBytes } from "crypto";
// 32 bytes = 256 bits, 43 url-safe chars. Fits an email local part with room
// for the "r+" prefix (RFC 5321 caps local parts at 64 octets).
export function newReplyToken() {
  return randomBytes(32).toString("base64url");
}
```

Explicitly forbidden: `Math.random()`, timestamps, sequential counters, contact/workspace ids in any encoded form, and the pattern at `src/app/api/testimonial-requests/route.ts:10-20` (name slug + 10 hex chars ≈ 40 bits). Do not copy that function. Tokens are stored plaintext in `conversations.reply_token` with a UNIQUE index — that is acceptable because the token is a *routing* identifier, not an authorization credential (see REQ-SEC-07).

On **timing-safe lookup:** the honest engineering position is that a `UNIQUE` B-tree index lookup is not a practical timing oracle for a 256-bit token, and contorting the query to be constant-time is theater. What actually matters, and is required:
- The endpoint MUST return an identical response (`200`, empty body) for valid and invalid tokens, with no timing-dependent branch that performs additional network I/O only on the valid path *before* responding. Do the work, then respond uniformly.
- Invalid-token attempts MUST be rate-limited per source (REQ-SEC-17) and MUST NOT be reflected back to the sender as a bounce (per the plan — correct, and now mandatory: bouncing turns the endpoint into a token oracle).

*Why:* T2.

*Verify:* Unit test asserts token length ≥ 22 base64url chars and that 10,000 generated tokens are unique and pass a basic entropy sanity check. Grep the messaging modules for `Math.random` and `randomUUID().slice` → zero hits.

---
**REQ-SEC-07 — Inbound sender verification: the reply token routes, it does not authenticate.**

*What:* Because the reply token travels in `Reply-To` on every outbound email (T2), possession proves only "received mail from this workspace." Therefore, on inbound email:
- The `From` address MUST be compared (case-insensitively, after normalization) against the conversation's contact email. On mismatch, still store the message, but set a `sender_verified BOOLEAN` column to `false` and render it in the UI with an explicit "sender does not match this contact" warning. Do not silently attribute the message to the contact.
- Inbound email MUST NEVER mutate contact records — no updating `contacts.email`, `phone`, `first_name`, tags, or any other field from inbound content. Inbound is append-only into `messages`.
- Inbound email MUST NEVER change `suppressions`. (Unsubscribe happens through the signed-token route only. An "unsubscribe" reply is a UI prompt for the user, not an automated action.)
- Rotating a reply token MUST be possible (`POST /api/conversations/[id]/rotate-token`, tenant-scoped) so a leaked thread can be cut off. Old tokens are dropped, not kept as aliases.

Add `sender_verified BOOLEAN NOT NULL DEFAULT true` to `messages` in the initial migration so this is not a later ALTER.

*Why:* T2. This is the difference between "an unguessable token" and "a bearer credential mailed to strangers."

*Verify:* Test: inbound with a valid token but `From: attacker@evil.com` → stored with `sender_verified = false`, contact row byte-identical before and after. Test: inbound body containing `UNSUBSCRIBE` → no suppression row.

---
**REQ-SEC-08 — Unsubscribe tokens: HMAC-signed, self-contained, per-recipient.**

*What:* Unsubscribe links MUST carry an HMAC-signed, self-describing token — no database ID, no sequential value, nothing enumerable.

```ts
import { createHmac, timingSafeEqual } from "crypto";

// v1.<payload>.<sig>  — payload is base64url JSON, sig is base64url HMAC-SHA256
type UnsubPayload = { w: string; c: "email" | "sms"; a: string; cid?: string; exp: number };

export function signUnsubToken(p: UnsubPayload) {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", requireSecret()).update(`v1.${body}`).digest("base64url");
  return `v1.${body}.${sig}`;
}

export function verifyUnsubToken(token: string): UnsubPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = createHmac("sha256", requireSecret())
    .update(`v1.${parts[1]}`).digest("base64url");
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;   // constant-time
  const p = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as UnsubPayload;
  if (p.exp < Date.now() / 1000) return null;
  return p;
}
```

- Secret: a new `MESSAGING_TOKEN_SECRET` (≥32 random bytes, base64). MUST NOT reuse `ALIGNO_API_KEY` or any provider credential — a token-signing key has different rotation and blast-radius properties.
- Signature comparison MUST use `timingSafeEqual` with a length guard, mirroring the existing correct pattern at `src/lib/api/internal-auth.ts:28-33`. A `===` on an HMAC is a finding.
- `exp` set to 400 days (mail lives a long time; an expired unsubscribe link is a compliance failure, so err long, but bounded).
- Verification failure → render a neutral "this link is no longer valid" page. MUST NOT reveal whether the address exists, which workspace it belongs to, or why the token failed.

*Why:* T6.

*Verify:* Test: single-bit flip anywhere in the token → rejected. Test: payload edited to a different `a` (address) with the original signature → rejected. Test: token signed with a different secret → rejected. Confirm no `===`/`!==` comparison of signature strings.

---
**REQ-SEC-09 — Unsubscribe route: `POST` mutates, `GET` confirms.**

*What:* The plan lists only `GET /api/unsubscribe/[token]`. That is a design flaw and MUST change:
- `POST /api/unsubscribe/[token]` — performs the suppression. This is the RFC 8058 one-click target advertised in `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Exempt from CSRF token requirements by design (it is cross-origin by nature), which is safe precisely because the HMAC token is the authorization and the action is narrowly scoped to one address.
- `GET /api/unsubscribe/[token]` — renders a landing page with a confirm button that issues the POST. It MUST NOT mutate state.

*Why:* T6. Mail-security appliances, link scanners, and browser prefetch routinely `GET` every URL in an email. A mutating GET means enterprise recipients get unsubscribed by their own security tooling, which reads as a bug and is a deliverability signal.

*Verify:* Test: `GET` with a valid token → 200 HTML, zero rows in `suppressions`. Test: `POST` same token → suppression row created. Test: `POST` twice → one row (unique constraint), 200 both times.

---
**REQ-SEC-10 — Provider-supplied identifiers are untrusted strings.**

*What:* `provider_id`, `email_message_id` (RFC 5322 `Message-ID`), `In-Reply-To`, `References`, and inbound `Subject` are attacker-controlled. They MUST be: length-capped (`provider_id` 255, `email_message_id` 998, `subject` 512), stripped of CR/LF **before storage** (`value.replace(/[\r\n]+/g, " ")`), and re-validated before being echoed into an outbound header. A `Message-ID` containing `\r\nBcc: victim@...` that is stored and later emitted into `In-Reply-To` on our own outbound mail is header injection with an extra hop.

*Why:* T4.

*Verify:* Test storing an inbound message whose `Message-ID` contains `\r\nBcc:` → stored value has no control characters; the subsequent outbound reply's headers contain no injected field.

### Content handling

---
**REQ-SEC-11 — Server-side HTML sanitization of all inbound email, before storage.**

*What:* Use **`sanitize-html`** (npm, add as a direct dependency). Rationale for the choice over `DOMPurify` + `jsdom`: `sanitize-html` is a server-native allowlist sanitizer built on `htmlparser2` with no DOM emulation layer, roughly an order of magnitude lighter in a serverless cold start than pulling in `jsdom` (already present as a *dev* dependency for vitest — promoting a test-only dependency into the production runtime path is exactly the kind of drift worth avoiding). `sanitize-html`'s allowlist model also fails closed: unknown tags and attributes are dropped by default, whereas DOMPurify's strength — DOM-tree-aware mXSS resistance — matters most when re-serializing into a live document, which we explicitly do not do (REQ-SEC-13 renders in a sandboxed iframe).

Sanitize **on write**, store only the sanitized HTML in `messages.body_html`, and discard the original. Do not store raw and "sanitize on render" — that guarantees someone eventually renders the raw column.

```ts
// src/lib/messaging/sanitize-html.ts
import sanitizeHtml from "sanitize-html";

export function sanitizeInboundHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p","br","hr","div","span","blockquote","pre","code",
      "b","strong","i","em","u","s","sub","sup","small",
      "h1","h2","h3","h4","h5","h6",
      "ul","ol","li","dl","dt","dd",
      "table","thead","tbody","tfoot","tr","td","th","caption","colgroup","col",
      "a","img",
    ],
    // Explicitly NOT allowed: script, style, iframe, object, embed, form,
    // input, button, base, link, meta, svg, math, template, noscript.
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan", "align", "valign"],
      th: ["colspan", "rowspan", "align", "valign", "scope"],
      "*": ["style"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    // data: URIs banned outright — no data:text/html, and no inline images.
    allowProtocolRelative: false,
    // Style is allowed but heavily constrained: presentational properties only,
    // with value patterns. No position/behavior/expression/url().
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/, /^[a-zA-Z]+$/],
        "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/, /^[a-zA-Z]+$/],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "font-size": [/^\d{1,3}(px|pt|em|rem|%)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
        padding: [/^[\d\s]{1,20}(px|pt|em|%)?$/],
        margin: [/^[\d\s]{1,20}(px|pt|em|%)?$/],
      },
    },
    transformTags: {
      // Every surviving link opens externally and leaks no referrer.
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
    // Drop the *contents* of removed script/style, not just the tags.
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    disallowedTagsMode: "discard",
  });
}
```

Also required:
- Sanitize **after** any quoted-reply stripping, never before — the stripper must not be able to reintroduce or reassemble markup post-sanitization.
- The quoted-reply stripper operates on hostile input: it MUST have a hard iteration/length bound, MUST NOT use a regex with nested quantifiers (ReDoS), and MUST be wrapped in try/catch that falls back to "no stripping."
- Any HTML we generate for *outbound* email from user-authored template bodies goes through the same function before send, so a stored-XSS payload in a template does not ship to recipients.

*Why:* T3.

*Verify:* A fixture-driven test suite with at least these payloads, each asserted to produce output containing no `<script`, no `on[a-z]+=`, no `javascript:`, no `data:`: plain `<script>alert(1)</script>`; `<img src=x onerror=alert(1)>`; `<a href="javascript:alert(1)">x</a>`; `<a href="data:text/html,<script>alert(1)</script>">x</a>`; `<svg><animate onbegin=alert(1) attributeName=x dur=1s>`; `<iframe srcdoc="<script>alert(1)</script>">`; `<style>@import 'http://evil'</style>`; `<base href="http://evil/">`; `<form action="http://evil"><input>`; `<div style="background:url(javascript:alert(1))">`; `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>` (mXSS); `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`. Additionally assert that the *stored* column, read back, is the sanitized form.

---
**REQ-SEC-12 — `interpolation.ts` must escape when the output is HTML.**

*What:* `interpolateTemplate()` at `src/lib/messaging/interpolation.ts:51-70` currently returns `String(value)` unescaped. Changing its default silently would alter existing workflow-engine behavior, so make the contract explicit:

```ts
export type InterpolationMode = "text" | "html";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>,
  mode: InterpolationMode = "text",   // callers must opt into html
): InterpolationResult
```

In `html` mode every substituted value passes through `escapeHtml`. **Every** call site that builds email HTML — `send-message.ts`, the campaign processor, the template preview renderer — MUST pass `"html"`. SMS bodies use `"text"`. Escaping is applied to the *substituted value*, never to the template body itself (the template is trusted markup authored by a workspace member; the merge value is not).

Merge values are additionally length-capped at 1,000 characters and stripped of control characters before escaping.

Subjects are separate: subject lines are plain text, so interpolate in `"text"` mode and then strip CR/LF (REQ-SEC-10).

*Why:* T4. Contact names arrive unvalidated through `src/lib/api/lead-webhook.ts`; without this, a lead named `<img src=x onerror=...>` becomes markup in every campaign and in the CRM's own preview.

*Verify:* Test: `interpolateTemplate("<p>Hi {{contact.first_name}}</p>", { contact: { first_name: '<img src=x onerror=alert(1)>' } }, "html")` → output contains `&lt;img` and no `<img`. Test: the same call in `"text"` mode is unchanged from today (existing workflow tests must still pass). Grep every construction of email HTML and confirm `"html"` is passed. **Additionally**, fix the same bug at `src/app/api/organizations/invites/route.ts:54-87` (`${orgName}`, `${inviterName}`, `${role}`) using the same `escapeHtml` — leaving a live instance of the exact bug class the new code is forbidden from having is not defensible.

---
**REQ-SEC-13 — Render inbound HTML in a sandboxed iframe; never `dangerouslySetInnerHTML` foreign markup.**

*What:* Sanitization is the primary control; rendering is defense in depth, because a single sanitizer bypass otherwise yields full session compromise (§0.1). The message-body component MUST render `body_html` via:

```tsx
<iframe
  sandbox=""                        // no scripts, no forms, no same-origin, no top-nav
  referrerPolicy="no-referrer"
  srcDoc={sanitizedHtml}
  title="Message content"
  className="w-full border-0"
/>
```

`sandbox=""` (empty, not `sandbox="allow-scripts"`) denies script execution, form submission, plugins, top-level navigation, and same-origin access. Note that `allow-scripts` together with `allow-same-origin` is equivalent to no sandbox at all — neither may be added.

`dangerouslySetInnerHTML` MUST NOT appear anywhere in `src/components/messaging/`. Remote images: default to **blocked**, with an explicit "Load remote images" affordance per message, so opening a thread does not silently confirm read receipt and leak the reading user's IP to the sender (T10). Implement the block by rewriting `img[src]` to a placeholder at render time and restoring on click — not by re-sanitizing.

Add a Content-Security-Policy response header for the app (currently `next.config.mjs` sets none): at minimum `default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`. Next.js requires `'unsafe-inline'` for styles and a nonce or `'unsafe-inline'` for its bootstrap scripts; scope pragmatically rather than skipping the header entirely.

*Why:* T3.

*Verify:* Grep `src/components/messaging/` for `dangerouslySetInnerHTML` → zero hits. Component test asserts the iframe carries `sandbox=""`. Manual: store a message whose sanitized HTML nonetheless contains `<script>alert(1)</script>` (inject directly into the DB, bypassing the sanitizer) and confirm no alert fires — this tests the render layer independently of the sanitizer.

---
**REQ-SEC-14 — No server-side fetching of URLs found in message content.**

*What:* Nothing in the messaging path may issue an outbound HTTP request to a URL that originated in message content, a contact field, or a webhook payload. Specifically forbidden without a written exception: proxying inbound remote images, resolving/expanding shortened links, fetching link previews or favicons, validating campaign URLs by requesting them, and downloading Resend inbound attachment URLs (attachments are deferred — keep it that way; when implemented, they need their own review covering the fetch target, size cap, content-type pinning, and storage isolation).

Outbound HTTP from the messaging subsystem is limited to a hardcoded allowlist of provider hostnames: `api.resend.com`, `api.twilio.com`.

*Why:* T10. The runtime has network access to Vercel and InsForge internals; a fetch primitive against attacker-supplied URLs is a pivot into that network and a cloud-metadata reach.

*Verify:* Grep `src/lib/messaging/` and the webhook routes for `fetch(`, `axios`, `got`, `undici` → every hit must target a provider SDK or an allowlisted constant host. Review at each phase gate.

### Tenancy and authorization

---
**REQ-SEC-15 — Tenant scoping checklist, applied to every new route.**

*What:* Every dashboard route in the messaging surface MUST satisfy all of the following. This is a literal checklist to be walked per route at review, not a principle.

1. First statement in the handler body is `const tenant = await requireTenantContext();` (throws `UnauthorizedError` → 401 via `tenantErrorResponse`). No route may use `getOptionalTenantContext()` — it returns `FALLBACK_WORKSPACE_ID` for anonymous callers (`src/lib/auth/tenant.ts:22-34`), which on this deployment is a real workspace.
2. Every `SELECT` includes `.eq("workspace_id", tenant.workspaceId)`. Including `[id]` lookups: **fetch-by-id must be fetch-by-id-and-workspace**, never fetch-then-compare-then-403 (which is a timing/error-message oracle and one early-return away from an IDOR).
3. Every `INSERT` sets `workspace_id: tenant.workspaceId` from the session — never from the request body. Request bodies MUST NOT be spread into insert payloads (`...body` is banned in this subsystem); enumerate fields explicitly.
4. Every `UPDATE`/`DELETE` carries `.eq("workspace_id", tenant.workspaceId)` **in addition to** `.eq("id", ...)`.
5. Every client-supplied foreign key — `contact_id`, `template_id`, `campaign_id`, `conversation_id`, and **every element of `audience.tagIds`** — is re-fetched and confirmed to belong to `tenant.workspaceId` before use. Resolving a campaign audience by tag id without this is cross-tenant contact exfiltration *with delivery attached* (T5).
6. Mutating operations that change spend or compliance state — `POST /api/campaigns/[id]/send`, `PUT /api/messaging/settings`, `DELETE /api/suppressions` — additionally require `tenant.role` in `("owner","admin")`, matching the pattern at `src/app/api/organizations/invites/route.ts:20-22`.
7. Error responses MUST NOT echo `error.message` to the client (the pattern at `invites/route.ts:100-103` and `lead-webhook.ts:158-164`). Return a generic message; log the detail server-side. Provider errors routinely embed request payloads and occasionally credentials.

*Why:* T5, T8.

*Verify:* A single test file `src/__tests__/messaging/tenant-scoping.test.ts` that, for every messaging route, asserts: (a) no session → 401; (b) session for workspace B requesting a workspace-A resource id → 404 (not 403, no existence disclosure); (c) a body containing `workspace_id: "other"` does not affect the written row. Reviewer walks items 1-7 against each route file at the phase gate.

---
**REQ-SEC-16 — The campaign processor must not use `ALIGNO_API_KEY` / `internal-auth`.**

*What:* The plan specifies `POST /api/campaigns/[id]/process` authenticated by "internal-auth key". That MUST NOT be used here, for two concrete reasons:
- `getInternalApiAuthContext()` returns `tenant.workspaceId = FALLBACK_WORKSPACE_ID` ("default") for the global-key path (`internal-auth.ts:45-50, 60-66`). The processor would either operate on the wrong workspace or silently no-op.
- Its non-production branch (`internal-auth.ts:52-59`) authorizes *any* request when `ALIGNO_API_KEY` is unset and no key header is present. Attaching that to an endpoint that sends email and SMS at scale is unacceptable.

Instead, the processor authenticates with a **per-campaign HMAC job token**, signed with `MESSAGING_TOKEN_SECRET` (reuse the REQ-SEC-08 primitives), carrying `{ campaignId, workspaceId, exp }` with a short expiry (15 minutes) and a monotonically increasing `chunk` counter. The handler:
1. Verifies the HMAC (constant-time) and expiry.
2. Loads the campaign **by id**, and asserts `campaign.workspace_id === token.workspaceId`.
3. Uses `campaign.workspace_id` for all subsequent scoping — never a fallback, never a session.
4. Enforces a hard ceiling on self-re-invocation: refuse to continue past `ceil(total_count / chunkSize) + 5` chunks, and refuse if `campaign.status !== 'sending'`. A campaign moved to `sent` or `failed` terminates the chain.
5. Claims its chunk atomically (conditional update from `queued` → `sending` on a bounded row set) so two concurrent invocations cannot both send the same rows.

*Why:* T5, T7, T11. Without the ceiling and the claim, "self-re-invokes until drained" is an unbounded fan-out that spends real money.

*Verify:* Test: processor called with no token → 401. With a token for campaign A used against campaign B → 401. With an expired token → 401. Two concurrent invocations against the same queued set → each row sent exactly once. A campaign whose status is `sent` → immediate no-op.

### Rate limiting, spend, and abuse

---
**REQ-SEC-17 — Rate limits on send and public endpoints.**

*What:* There is no rate-limiting infrastructure in this repo today and no Redis. Implement a database-backed fixed-window counter (works correctly on serverless, unlike in-memory counters which reset per lambda instance):

```sql
CREATE TABLE messaging_rate_counters (
  bucket_key TEXT NOT NULL,          -- e.g. 'send:ws_abc' | 'unsub:1.2.3.4'
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
```

Increment via upsert (`ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = messaging_rate_counters.count + 1 RETURNING count`) and compare against the limit. Minimum limits:

| Bucket | Limit |
|---|---|
| `POST /api/messages/send`, `/api/conversations/[id]/messages` | 60 / minute / workspace, 1,000 / day / workspace |
| `POST /api/campaigns/[id]/send` | 5 / hour / workspace |
| Campaign recipients | 5,000 / campaign, 10,000 / day / workspace (hard cap, 400 above it) |
| `GET|POST /api/unsubscribe/[token]` | 30 / minute / IP |
| Inbound-SMS contact auto-creation | 50 / hour / workspace |
| Webhook endpoints | 600 / minute / route (coarse flood guard only) |

Exceeding → `429` with `Retry-After`. Limits are constants in one module so they are reviewable in a single place. Add Vercel Firewall rules on the public routes (`/api/unsubscribe/*`, `/api/webhooks/*`) as a coarse edge layer in front of this — the DB counter still runs a query per request, which is itself a DoS surface.

*Why:* T7, T11. Given §0.1, these limits are currently the *only* real ceiling on an attacker's spend.

*Verify:* Test the limiter directly (61st call in a window → 429). Integration test on `/api/messages/send`. Confirm the daily workspace cap is enforced in the campaign path, not just the 1:1 path.

---
**REQ-SEC-18 — SMS destination restrictions and spend guardrails.**

*What:*
- Enable Twilio **Geo Permissions** restricted to US and Canada on the account. Everything else off. This is the single highest-leverage anti-pumping control and it lives in the Twilio console, not the code — record it as a go-live checklist item.
- In `phone.ts`, reject any destination whose E.164 country code is not in an allowlist (`+1` for v1) before calling Twilio, with a clear error. Do not rely solely on the provider-side setting.
- Block known-abused `+1` ranges: premium/pay-per-call (`+1900`), and reject non-NANP-valid numbers (area code and exchange must not start with 0 or 1).
- Set a Twilio account **spend trigger/alert** at a threshold agreed with the user, and a monthly cap.
- Log and surface a daily send count per workspace so anomalies are visible.

*Why:* T7. SMS pumping revenue depends on reaching high-payout international ranges; a `+1`-only allowlist removes essentially the whole business model.

*Verify:* Unit test `phone.ts` rejects `+447700900000`, `+8801700000000`, `+19005551234`, and accepts `+15551234567`. Screenshot/confirm the Geo Permissions and billing-alert settings before go-live.

---
**REQ-SEC-19 — Suppression enforcement is a hard gate in the transport layer.**

*What:* The suppression check MUST live inside `sendConversationMessage()` in `src/lib/messaging/send-message.ts`, before any provider call — not in the route handlers, not in the UI. Every send path (1:1, campaign, workflow, test-send, future agent-initiated) inherits it because it inherits the function. Matching is on normalized address (email lowercased and trimmed; phone E.164) scoped to `(workspace_id, channel)`.

Semantics per the plan, made explicit:
- SMS + reason `stop` → **hard block, no override, all paths**, including 1:1. Sending to a STOP'd number is a TCPA violation and Twilio blocks it at the carrier level anyway; a queued row that always fails is worse than a refusal.
- Email + `unsubscribe`/`bounce`/`complaint` → hard block for `campaign_id != null`; 1:1 conversation sends permitted with a UI warning. `bounce` should arguably block 1:1 too (it is a delivery fact, not a preference) — allowed, but the warning must distinguish "they opted out" from "this address does not exist."
- A blocked send writes a `messages` row with `status = 'failed'` and a suppression reason so the audit trail exists. It MUST NOT silently vanish.

*Why:* T11, and legal exposure (TCPA, CAN-SPAM, CASL) that is not strictly a security concern but shares the same control.

*Verify:* Test each of the six (channel × reason × path) combinations. Test that a route-level bypass is impossible by calling `sendConversationMessage()` directly against a suppressed address.

### Secrets and operations

---
**REQ-SEC-20 — Environment variable handling.**

*What:*
- New vars — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`, `MESSAGING_TOKEN_SECRET`, `MESSAGING_PUBLIC_BASE_URL`, `MESSAGING_EMAIL_DOMAIN`, `MESSAGING_REPLY_DOMAIN` — MUST NOT carry a `NEXT_PUBLIC_` prefix, and MUST NOT be referenced from any file under a `"use client"` boundary.
- `.env.local.example` gets every one of them with placeholder values, plus the currently-missing `RESEND_API_KEY`.
- Add a startup assertion module (`src/lib/messaging/env.ts`) exporting `requireMessagingEnv()` that throws a descriptive error naming the missing variable, called at the top of each messaging entry point. Never `process.env.X!` — a non-null assertion on a secret produces `undefined` reaching an HMAC, which yields a *signature that verifies against attacker input* if both sides use the same undefined key. The existing `src/lib/insforge/client.ts` uses `!` on both values; do not extend that pattern.
- `MESSAGING_TOKEN_SECRET` MUST be distinct from `ALIGNO_API_KEY` and from any provider credential.
- Secrets live in Vercel project env vars scoped per-environment. Production Twilio credentials MUST NOT be present in the Preview environment (a preview deployment is world-reachable and, until §0.1 is fixed, world-authenticable).

*Why:* T8.

*Verify:* `grep -rn "NEXT_PUBLIC_" src/lib/messaging/ src/components/messaging/` → zero hits. `grep -rn "process.env" src/components/` → zero hits for messaging vars. Build the app and grep the client bundle in `.next/static` for a fragment of each secret's value → zero hits. Confirm `requireMessagingEnv()` throws on a missing var rather than proceeding.

---
**REQ-SEC-21 — Logging hygiene: message content is never logged.**

*Decision: message bodies, subjects, and full recipient addresses MUST NOT be written to application logs, at any level, in any environment.* Justification, since the plan asked for one rather than a default:

Vercel runtime logs are retained by the platform, are visible to every member of the Vercel project, are searchable, and — unlike the database — are not covered by any tenant boundary, deletion path, or retention policy this application controls. A contact's conversation content in a CRM used for legal-adjacent work may be privileged; a workspace's "delete this conversation" action cannot reach a log line. The convenience of `console.log(payload)` during webhook debugging is real but is exactly how PII ends up permanently in a third-party log store. The debugging need is served by the `messages` table itself, which holds the same content under proper access control.

Concretely:
- Permitted in logs: `message_id`, `conversation_id`, `campaign_id`, `workspace_id`, `provider`, `provider_id`, `status`, `direction`, `channel`, error *class*/code, byte lengths, timing.
- Forbidden: `body_text`, `body_html`, `subject`, raw webhook payloads, full email addresses, full phone numbers, **reply tokens**, **unsubscribe tokens**, job tokens, and any provider credential. A token in a log line is a credential in a log line.
- Addresses, when needed for support, are redacted: `redactAddress("jane.doe@example.com")` → `"ja***@example.com"`; `redactPhone("+15551234567")` → `"+1555***4567"`. One helper in `src/lib/messaging/redact.ts`, used everywhere.
- Provider SDK errors MUST be passed through a `redactProviderError()` helper before logging — Resend/Twilio error objects can carry `config.headers.Authorization` and the full request body.
- `messages.provider_response JSONB` may store the provider's structured response, but the sanitizer MUST strip any `body`/`html`/`text` field from it before storage (the content is already in `body_text`/`body_html`; duplicating it into a JSONB blob defeats any future redaction work).

*Why:* T8, and PII containment generally.

*Verify:* Test: drive a full inbound → store → outbound cycle with `console.*` spied, and assert no captured argument contains the fixture body text, the fixture subject, the full address, or the reply token. Grep the messaging modules for `console.log(` with an object argument and review each.

---
**REQ-SEC-22 — Remove the personal-address sender fallbacks.**

*What:* `src/lib/messaging/email-service.ts:41` (`process.env.EMAIL_FROM ?? "aki.b@pentridgemedia.com"`) and `src/app/api/organizations/invites/route.ts:51` (same fallback) MUST be removed. Resolution order becomes `workspace_channels.config` → `EMAIL_FROM` → **throw**. Silently sending as a personal address from a misconfigured tenant is both a data-leak vector (replies go to a person, not the workspace) and a domain-reputation risk.

The constructed `From` header MUST validate `from_name` (strip CR/LF and `<`, `>`, `"`, `;`, `,`; cap at 64 chars) and `from_local_part` (`/^[a-z0-9][a-z0-9._-]{0,32}$/i`) before concatenation (T4).

*Why:* T4, T8.

*Verify:* Test: no config and no `EMAIL_FROM` → `sendConversationMessage` throws, no provider call. Test: `from_name` of `Evil"\r\nBcc: x@y.z` → rejected or stripped. Grep for `pentridgemedia` → zero hits in `src/`.

---
**REQ-SEC-23 — Migration and schema review.**

*What:* The new migration MUST: use `workspace_id TEXT NOT NULL` (live-schema convention; do not add a `workspaces` FK — the live `workspaces` table is empty and repo migrations 001-009 are stale against the live DB, so verify live schema before writing); create the `UNIQUE (workspace_id, channel, address)` on `suppressions` and the partial unique on `messages (provider, provider_id)` that idempotency depends on; create `messaging_webhook_events` (REQ-SEC-04) and `messaging_rate_counters` (REQ-SEC-17); add `sender_verified BOOLEAN NOT NULL DEFAULT true` to `messages` (REQ-SEC-07); and include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **plus** policies for all five new tables, even though enforcement is not yet active — so that turning RLS on later (IR-2) does not require touching messaging tables.

Do not add the new tables to migration 009's `tenant_tables` array; write self-contained policies keyed on `workspace_id`.

*Why:* T5, T9.

*Verify:* Read the applied live schema back (not the migration file) and confirm each constraint exists. Attempt a duplicate suppression insert → conflict. Attempt a duplicate `(provider, provider_id)` → conflict.

---
**REQ-SEC-24 — Input validation on every request body.**

*What:* Every messaging route validates its body against an explicit shape before use: string length caps (`subject` ≤ 512, `body` ≤ 100 KB, `name` ≤ 200), enum membership for `channel`/`direction`/`status`/`reason`, UUID format for every id, and E.164 for phones. Unknown fields are ignored, never spread. `audience.tagIds` capped at 100 entries. Reject with 400 and a generic message; do not echo the offending value back.

*Why:* T4, T5, T12.

*Verify:* Per-route test with an oversized body, a non-UUID id, and an out-of-enum value → 400 in each case, no DB write.

---
**REQ-SEC-25 — Local webhook development must not expose the dev server.**

*What:* The plan calls for an ngrok/cloudflared tunnel to receive webhooks locally. That tunnel exposes the **entire `next dev` server** to the internet, including every API route — and in dev, `getInternalApiAuthContext()` auto-authorizes unauthenticated requests when `ALIGNO_API_KEY` is unset (`internal-auth.ts:52-59`), while `requireTenantContext()` accepts a forged cookie (§0.1). A tunnel therefore publishes an unauthenticated CRM.

Required practice: (a) always set `ALIGNO_API_KEY` in `.env.local` before opening a tunnel, so the auto-authorize branch cannot fire; (b) use a tunnel with access control (cloudflared with Access, or ngrok with a basic-auth/OIDC rule) allowing only the provider's webhook paths, or an ngrok traffic policy restricted to `/api/webhooks/*`; (c) never tunnel a dev server connected to the production InsForge project — point `.env.local` at a branch/dev backend; (d) tear the tunnel down when not actively testing. Document this in `docs/email-dns-setup.md` or a sibling.

*Why:* T1, T5, T7. This is a workflow requirement, not a code one, and is the most likely way this project gets compromised during the build itself.

*Verify:* Reviewer confirms the documented procedure exists and that `.env.local.example` carries a comment on the tunnel requirement.

---

## 3. Inherited risks register

Pre-existing issues the messaging center makes materially worse. Severity reflects the *post-messaging* state, not today's.

---
**IR-1 — Unverified session cookie is a complete authentication bypass. — CRITICAL**

`src/lib/auth/session.ts:22-29`. `insforge-session` is checked for presence only; `insforge-user` is `JSON.parse`d and trusted for `id` and `email`. `src/middleware.ts:59-63` excludes `/api`. Any unauthenticated party can impersonate any user by setting two cookie values, and `getTenantContextForUser()` will resolve that forged user to a real organization and workspace.

*Why messaging makes it worse:* today the payoff is CRM record access. After messaging, the same forged request can read every conversation (third-party PII), send email as the verified domain, blast SMS at per-message cost, and manipulate the suppression list. It converts an access-control bug into financial loss, reputation loss, and a communications-integrity breach — and it makes every rate limit in REQ-SEC-17 the *primary* control rather than a backstop.

*Fix:* `getAuthenticatedUser()` must validate the `insforge-session` token server-side against InsForge on each request (with a short-TTL cache keyed on the token hash) and derive `id`/`email` **from the validated token response**, discarding the `insforge-user` cookie as an input entirely.

*Verdict:* **MUST FIX BEFORE GO-LIVE.** Not waivable. "Single-workspace dev" does not mitigate it — the deployment is internet-reachable and the endpoints spend money. If the fix cannot land before the messaging center ships, the messaging routes MUST be gated behind an additional server-verified check (at minimum, a Vercel Firewall IP allowlist or Vercel Deployment Protection) until it does.

---
**IR-2 — RLS policies exist but were never enabled; the DB is reachable with a public key. — CRITICAL, CONFIRMED EXPLOITABLE AGAINST THE LIVE DATABASE (2026-08-05)**

> **Verified by the team lead, 2026-08-05.** Using only `NEXT_PUBLIC_INSFORGE_ANON_KEY` — the key shipped in the browser bundle — with **no user session**, an anonymous caller read `contacts`, `deals`, `organization_members`, and `api_keys` from the live database (3 rows each). This is an **active data exposure today**, not a risk that the messaging center introduces. It takes priority over all messaging work. Note especially that `api_keys` was readable: every per-workspace API key must be treated as compromised and rotated as part of the fix, and the anon key itself should be regarded as burned.


`src/lib/db/migrations/009_organizations.sql` creates `is_org_member()` and `CREATE POLICY org_member_all` for 22 tables but contains **zero `ENABLE ROW LEVEL SECURITY`** statements — the policies are inert. `src/lib/insforge/client.ts` connects with `NEXT_PUBLIC_INSFORGE_ANON_KEY`, which ships in the browser bundle. With RLS off, that key is effectively a full-access database credential published to every visitor. Migration 009 is also stale relative to the live schema (live `workspace_id` is TEXT; the `workspaces` table is empty), so the migration cannot simply be re-run.

*Why messaging makes it worse:* the new tables hold the highest-sensitivity data in the product. `messages.body_text`/`body_html` is the full content of every customer conversation. `suppressions` is a list of people who opted out. Direct anon-key access means reading all of it, and writing to it, without touching the app.

*Fix:* verify against the **live** schema whether RLS is enabled on any table; if not, enable it per table with policies keyed on `workspace_id`/`organization_id`, and confirm `is_org_member()` resolves correctly for the InsForge JWT claim structure. Separately, confirm whether the InsForge anon key is genuinely privileged with RLS off — if so, this is exploitable today, before any messaging code exists.

*Verdict:* **MUST FIX BEFORE ANYTHING ELSE.** No longer a go-live gate — it is an open incident. Fix order: enable RLS with correct policies, verify anonymously, then rotate every `api_keys` row and the anon key. Separately assess whether the exposure of `contacts`/`deals` triggers a notification obligation to the affected people; that is a decision for the user, not for us, but it must be put in front of them.

---
**IR-3 — `internal-auth` non-production auto-authorization. — HIGH**

`src/lib/api/internal-auth.ts:52-59`: when `ALIGNO_API_KEY` is unset and no key header is supplied, any request in a non-production `NODE_ENV` is authorized with `tenant.workspaceId = "default"`.

*Why messaging makes it worse:* the plan routes the campaign processor through internal-auth, and the plan's local-tunnel workflow (REQ-SEC-25) publishes the dev server. That combination makes an unauthenticated internet-reachable bulk-send trigger. Vercel preview builds run with `NODE_ENV=production`, so previews are not affected by this specific branch — but they *are* affected by IR-1.

*Fix:* REQ-SEC-16 keeps the messaging center off internal-auth entirely. Independently, the branch should be removed or gated behind an explicit `ALIGNO_ALLOW_INSECURE_DEV_AUTH=1` opt-in.

*Verdict:* Messaging-side mitigation (REQ-SEC-16) is **mandatory**. Removing the branch itself is **strongly recommended before go-live**; acceptable to defer only if `ALIGNO_API_KEY` is confirmed set in every deployed environment.

---
**IR-4 — Global `ALIGNO_API_KEY` resolves to the fallback "default" workspace. — HIGH**

`internal-auth.ts:45-50, 60-66` returns `workspaceId: FALLBACK_WORKSPACE_ID` for the global-key path, regardless of which tenant the caller intends. This is a known trap on this codebase — the global key writes into a workspace that is not visible in the UI.

*Why messaging makes it worse:* the same key would drive campaign processing. Messages, suppressions, and conversations written under "default" would be invisible to the operator while still being *sent* to real recipients. Silent mis-tenanting in a system that contacts humans is worse than a visible failure.

*Fix:* REQ-SEC-16 (per-campaign HMAC job token carrying an explicit `workspaceId`, cross-checked against the campaign row). Longer term, the global key should carry an explicit workspace binding or be retired in favour of per-workspace `api_keys` rows.

*Verdict:* **MUST FIX** within the messaging center (REQ-SEC-16). The global-key behaviour elsewhere is out of scope here but should be tracked.

---
**IR-5 — Unescaped HTML interpolation in the invite email. — MEDIUM**

`src/app/api/organizations/invites/route.ts:54-87` interpolates `${orgName}`, `${inviterName}`, and `${role}` raw into an HTML email. `orgName` is derived from `organizations.name`, which is set from user-controlled profile data via `displayNameForWorkspace()` (`src/lib/data/organizations.ts:57-68`). Exploitation requires being an org owner/admin, and the payload lands in an external mail client rather than the app, which caps severity.

*Why messaging makes it worse:* it is the live specimen of exactly the bug class the messaging center is forbidden from having, in the same repository, using the same email provider. Leaving it while writing a document that forbids it is not a coherent position, and it will be cited as precedent by anyone reading the codebase for patterns.

*Fix:* apply the REQ-SEC-12 `escapeHtml` helper at all three interpolation points. Roughly a five-line change.

*Verdict:* **Fix during Phase 1** as part of the `escapeHtml` work. Cheap, and it removes the counter-precedent.

---
**IR-6 — Weak share tokens in the testimonial flow. — MEDIUM**

`src/app/api/testimonial-requests/route.ts:10-20` mints public share tokens as a name-derived slug plus 10 hex characters (~40 bits), guarding an unauthenticated endpoint (`src/app/api/public/testimonials/[token]/route.ts`) that discloses client name, company, and business name.

*Why messaging makes it worse:* it is the in-repo precedent an implementer would naturally copy for `reply_token`. 40 bits is brute-forceable; 40 bits with a guessable name prefix is worse.

*Fix:* out of scope for this build, but REQ-SEC-06 explicitly forbids copying it, and the testimonial tokens should be regenerated with `randomBytes(32)` in a follow-up.

*Verdict:* **Acceptable to defer** (existing surface, low-value data). Documented here so the pattern is not propagated.

---
**IR-7 — Open lead webhooks accept `Access-Control-Allow-Origin: *` and create contacts. — MEDIUM**

`src/lib/api/lead-webhook.ts:7-11` sets a wildcard CORS policy; combined with IR-3 in dev, and with `ALIGNO_API_KEY` in prod, the endpoint creates `contacts` rows from unvalidated input (`name`, `email`, `phone`, `details`).

*Why messaging makes it worse:* those unvalidated contact fields become merge-tag values in outbound email (T4) and destination phone numbers for paid SMS (T7). The lead webhook is the injection point; the messaging center is the amplifier.

*Fix:* REQ-SEC-12 (escaping) and REQ-SEC-18 (destination allowlist) neutralize the downstream impact. Additionally, `phone` should be E.164-normalized and validated at contact-write time, per the plan's own `phone.ts` item.

*Verdict:* Downstream mitigations are **mandatory**; hardening the lead webhook itself is **recommended, deferrable**.

---
**IR-8 — `.insforge/project.json` — NOT AN ISSUE (verified).**

Checked: `git check-ignore .insforge/project.json` exits 0 (ignored) and `git ls-files` shows no `.insforge/` entries. The file exists locally with `0600` permissions and is not tracked. `insforge.toml` and `src/lib/insforge/client.ts` are tracked but contain no secrets. **No action.** Re-verify at the Phase 5 gate in case a `git add -f` slips in.

---
**IR-9 — No security response headers. — LOW/MEDIUM**

`next.config.mjs` sets no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security`.

*Why messaging makes it worse:* CSP is the last line of defense behind sanitization (REQ-SEC-13). Without it, a sanitizer bypass is unmitigated, and given IR-1 the payoff for an XSS is a permanent session forgery.

*Fix:* REQ-SEC-13 requires the headers as part of the messaging work.

*Verdict:* **Fix during Phase 3**, alongside the message renderer.

---

## 4. Review gates

I re-check the following at the end of each phase. A phase is not complete until its gate passes. Findings are reported back to the team lead with severity; CRITICAL/HIGH findings block the next phase.

### Gate 0 — before the build starts (and before any deployment)

Two bars, deliberately different.

**Bar to start BUILDING (local only):** IR-1 and IR-2 need not be fixed first — but local work MUST point at a **non-production InsForge backend**. This is not a formality. IR-2 is confirmed exploitable, so a `.env.local` aimed at the live project means every dev session, every tunnel (REQ-SEC-25), and every test fixture is operating inside an actively exposed database. Requirements to begin: (a) `.env.local` points at a dev/branch InsForge project, not production; (b) `ALIGNO_API_KEY` is set locally so the `internal-auth.ts:52-59` auto-authorize branch cannot fire; (c) no tunnel is left running outside an active test; (d) no production Twilio or Resend credentials exist on the dev machine — use Twilio test credentials and a Resend test key so a coding mistake cannot send to a real person or spend real money.

**Bar to DEPLOY the messaging code anywhere (preview or production), sending or not:** IR-1 and IR-2 MUST both be fixed and verified. The trigger is *deployment*, not *first real message* — with IR-1 unfixed, merely having `/api/messages/send` and `/api/campaigns/[id]/send` reachable on a deployed URL means an anonymous party can send, because the cookie check is not a check. There is no meaningful state where the routes are deployed but safely inert. Verification required before that deploy:
- Anonymous read attempt against the live database with the anon key alone returns **zero rows** on `contacts`, `deals`, `organization_members`, `api_keys`, and the five new messaging tables. Re-run the exact probe that found the exposure.
- All `api_keys` rows rotated, and the InsForge anon key rotated, after RLS is enforced.
- A forged-cookie request (`insforge-session=x; insforge-user={"id":"<any-uuid>","email":"a@b.c"}`) against a deployed messaging route returns **401**.
- If the user wants messaging deployed before IR-1/IR-2 land, the only acceptable compensating control is Vercel Deployment Protection or a firewall IP allowlist in front of the entire deployment — not route-level patches. I will say so plainly rather than approving a partial mitigation.

### Gate 1 — after Foundation (migration, `phone.ts`, `sms-service.ts`, `send-message.ts`, sender cleanup)

- Live schema read back: `workspace_id TEXT`, all unique constraints from REQ-SEC-23 present, `messaging_webhook_events` and `messaging_rate_counters` created, `sender_verified` column present, RLS statements included.
- `phone.ts`: E.164 normalization correct; `+1`-only destination allowlist enforced; `+1900` and invalid NANP rejected (REQ-SEC-18).
- `send-message.ts`: suppression check is inside the function and before any provider call (REQ-SEC-19); `From` construction validates `from_name`/`from_local_part` and has no personal-address fallback (REQ-SEC-22).
- `escapeHtml` + `interpolateTemplate(..., "html")` landed, existing workflow tests still green, and `invites/route.ts` fixed (REQ-SEC-12, IR-5).
- `requireMessagingEnv()` exists; no `process.env.X!` in new code; `.env.local.example` complete including `RESEND_API_KEY` (REQ-SEC-20).
- `grep -rn "NEXT_PUBLIC_" src/lib/messaging/` → zero.

### Gate 2 — after Two-way plumbing (four webhooks)

This is the highest-risk gate; expect it to take the longest.

- Line-by-line read of all four handlers.
- Svix verification on both Resend routes, against raw `request.text()`, separate secrets, **no `NODE_ENV` branch anywhere** (REQ-SEC-01).
- Twilio validation uses the pinned `MESSAGING_PUBLIC_BASE_URL` + literal path; `grep` for `request.url`, `host`, `x-forwarded` in those files returns zero (REQ-SEC-02). I will independently construct a forged request with a spoofed `Host` header and confirm rejection.
- Tenant resolved only from DB rows; a payload-supplied `workspace_id` provably ignored (REQ-SEC-03).
- `messaging_webhook_events` insert-first idempotency on all four; replay test passes; counter increments are transition-gated (REQ-SEC-04).
- Sanitizer test suite green against the full mXSS fixture list; stored column verified sanitized (REQ-SEC-11).
- Quoted-reply stripper: bounded, no nested-quantifier regex, try/catch fallback (REQ-SEC-11).
- `sender_verified` set correctly on `From` mismatch; inbound provably cannot mutate `contacts` or `suppressions` (REQ-SEC-07).
- Reply tokens `randomBytes(32)`; no copy of the testimonial token pattern (REQ-SEC-06).
- Body size caps and 200-on-internal-error containment (REQ-SEC-05).
- Log audit: spy on `console.*` through a full inbound cycle, assert no body/subject/address/token appears (REQ-SEC-21).

### Gate 3 — after Conversations UI

- `grep -rn "dangerouslySetInnerHTML" src/components/messaging/` → zero.
- Message body renders in `<iframe sandbox="" srcDoc={...}>`; confirmed `allow-scripts`/`allow-same-origin` absent (REQ-SEC-13).
- Manual bypass test: inject unsanitized `<script>` directly into a DB row and confirm the renderer still neutralizes it.
- Remote images blocked by default with an explicit load affordance.
- CSP and companion security headers present in `next.config.mjs` and observed on a real response (IR-9).
- Tenant-scoping checklist walked against every route added this phase (REQ-SEC-15), including 404-not-403 on cross-tenant ids.
- `sender_verified = false` surfaces a visible warning in the thread UI.

### Gate 4 — after Email & SMS sections (campaigns, templates, bulk processor)

- Campaign audience resolution re-validates every `tagIds` element against `tenant.workspaceId` — I will write the cross-tenant tag test myself if it is absent (REQ-SEC-15.5). This is the likeliest place for a real cross-tenant leak.
- Processor uses HMAC job tokens, **not** internal-auth; cross-campaign token rejected; expiry enforced; self-re-invocation ceiling and atomic chunk claim verified (REQ-SEC-16).
- Rate limits live and enforced on `/api/messages/send`, `/api/conversations/[id]/messages`, `/api/campaigns/[id]/send`, plus the per-campaign and per-day recipient caps (REQ-SEC-17).
- Unsubscribe: `POST` mutates, `GET` does not; HMAC verified with `timingSafeEqual`; tampered payload rejected; neutral failure page (REQ-SEC-08, REQ-SEC-09).
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers present on campaign sends, absent on 1:1.
- Suppression enforced on the campaign path, not only 1:1; `suppressed_count` accurate (REQ-SEC-19).
- Template bodies sanitized before outbound send (REQ-SEC-11).
- Role check (`owner`/`admin`) on send and settings mutations (REQ-SEC-15.6).

### Gate 5 — after Polish & hardening (pre-go-live)

- **IR-1 and IR-2 status confirmed.** If either is unresolved, I recommend against go-live and state the compensating controls required to proceed anyway.
- Twilio console: Geo Permissions US/CA only, spend alert configured, Advanced Opt-Out enabled, toll-free verification approved (REQ-SEC-18).
- Resend: both webhook secrets rotated from any value used during development; domain SPF/DKIM verified; DMARC policy present.
- Production build bundle grepped for every secret value → zero hits (REQ-SEC-20).
- `git ls-files | grep insforge` re-run; `.insforge/project.json` still untracked (IR-8).
- Full messaging test suite green, with explicit coverage of: webhook signature (all four), idempotency/replay, sanitizer fixtures, HTML-escaped interpolation, E.164 + destination allowlist, reply-token routing, unsubscribe HMAC, tenant scoping, rate limits.
- No `NODE_ENV` conditional anywhere in the messaging security path.
- Tunnel-safety procedure documented (REQ-SEC-25).
- Final read of the diff for the whole feature, looking specifically for controls that were added at Gate 2 and quietly removed later to make something work.
