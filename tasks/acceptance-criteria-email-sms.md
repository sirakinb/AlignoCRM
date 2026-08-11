# Acceptance Criteria — Email & SMS Infrastructure

**Companion to:** `tasks/plan-email-sms-infrastructure.md` (approved plan — the source of scope)
**Governed by:** `tasks/security-requirements-email-sms.md` (security doc wins conflicts)
**Purpose:** the checklist used during implementation review. Nothing here adds scope beyond the plan.
**Status:** updated 2026-08-05 against the plan's §Ambiguity resolutions (A-1…A-17). No criterion is blocked on an open question.

## Conventions

Each criterion carries a verification method:

| Tag | Meaning |
|---|---|
| **[unit]** | Automated test under `src/__tests__/` (vitest), runnable via `npm run test:run` |
| **[curl]** | Manual request against a running dev server or preview deploy |
| **[ui]** | Manual browser check |
| **[sql]** | Direct query against the live/dev DB |
| **[code]** | Static check — grep / read the file, no runtime needed |

IDs are stable (`P1-03`) so review comments can reference them.

---

# Phase 1 — Foundation

## 1.1 Migration & data model

Structural checklist — verify with **[sql]** (`\d+ <table>` or InsForge schema view) and **[code]** (migration file review):

- [ ] **P1-01** Migration lives in the **root `migrations/`** directory with timestamp naming (matching `20260704073712_fix-testimonials-workspace-id.sql`) — **not** in `src/lib/db/migrations/`, which is historical record only. It is the only new migration for this feature. **[code]**
- [ ] **P1-01b** Live schema was verified via insforge-cli *before* the DDL was written; the migration's assumptions about existing tables (`contacts`, `message_templates`, `tags`) match what is actually deployed. **[sql]**
- [ ] **P1-01c** Dependencies added to `package.json`: `twilio`, `svix`, `sanitize-html`, `libphonenumber-js` — and no others for this feature. `sanitize-html` is the string-based server sanitizer (no jsdom in the dependency tree). **[code]**
- [ ] **P1-02** All five tables created: `workspace_channels`, `conversations`, `messages`, `campaigns`, `suppressions`.
- [ ] **P1-03** `workspace_id` is `TEXT NOT NULL` on every new table — **not** UUID, **no** FK to `workspaces`. Verify with `[sql]`: `SELECT table_name, data_type FROM information_schema.columns WHERE column_name='workspace_id' AND table_name IN (...)` returns `text` for all five.
- [ ] **P1-04** `workspace_channels`: `UNIQUE (workspace_id, channel)`; `channel` CHECK in `('email','sms')`; `config JSONB NOT NULL DEFAULT '{}'`.
- [ ] **P1-05** `conversations`: `reply_token TEXT UNIQUE NOT NULL`; `UNIQUE (workspace_id, contact_id)`; index on `(workspace_id, last_message_at DESC)`.
- [ ] **P1-06** `messages`: `direction` CHECK in `('inbound','outbound')`; `status` CHECK in exactly `('queued','sent','delivered','failed','bounced','received')` — **the enum does not grow**; indexes on `(conversation_id, created_at)`, `(workspace_id, created_at DESC)`, `(campaign_id)`.
- [ ] **P1-06b** `messages.conversation_id` is **nullable** (campaign rows carry NULL). Verify with `[sql]`: `INSERT` a row with `conversation_id = NULL` succeeds.
- [ ] **P1-06c** `messages` has `opened_at TIMESTAMPTZ` and `clicked_at TIMESTAMPTZ`, both nullable — the landing spots for Resend open/click events, which have no status-enum slot.
- [ ] **P1-07** `messages` has a **unique partial index** on `(provider, provider_id)` where `provider_id IS NOT NULL`. Verify with `[sql]`: inserting two rows with the same `(provider, provider_id)` raises a unique violation; two rows with `provider_id = NULL` both insert.
- [ ] **P1-08** `campaigns`: `status` CHECK in `('draft','sending','sent','failed')`; counters `total_count`, `sent_count`, `delivered_count`, `failed_count`, `suppressed_count`, **`no_address_count`** all present and default `0`; `scheduled_at` column exists and is nullable.
- [ ] **P1-09** `suppressions`: `UNIQUE (workspace_id, channel, address)`; `reason` CHECK in `('unsubscribe','stop','bounce','complaint','manual')`.
- [ ] **P1-10** `message_logs` and `message_templates` are **not** altered by this migration. Verify with `[code]`: grep the migration for `message_logs` — zero hits; for `message_templates` — no `ALTER`.
- [ ] **P1-11** `workspace_channels` rows are **not** seeded by the migration (no environment-specific workspace id embedded in DDL). Verify with `[code]`: grep the migration for `INSERT INTO workspace_channels` — zero hits. Creation happens on first `GET /api/messaging/settings` per P5-01b.

**P1-12 — Reply tokens are unguessable.**
Given the conversation-creation path,
When a conversation row is created,
Then `reply_token` is generated from a CSPRNG with ≥128 bits of entropy and is URL/email-local-part safe.
**[unit]** Generate 10,000 tokens: all unique, all match `/^[A-Za-z0-9_-]{22,}$/`. **[code]** Source is `crypto.randomBytes`/`crypto.getRandomValues`, never `Math.random`.

## 1.2 `phone.ts` — E.164 normalization

Implemented over `libphonenumber-js` (per A-17) — `phone.ts` is a thin wrapper, not a hand-rolled regex parser. **[code]**

**P1-13 — US 10-digit numbers normalize to E.164.**
Given inputs `"5551234567"`, `"(555) 123-4567"`, `"555-123-4567"`, `"555.123.4567"`, `" 555 123 4567 "`,
When normalized with the default US region,
Then all return `"+15551234567"`.
**[unit]**

**P1-14 — Already-E.164 and 11-digit US inputs are stable.**
Given `"+15551234567"` and `"15551234567"`, Then both return `"+15551234567"` (normalization is idempotent: `f(f(x)) === f(x)`).
**[unit]**

**P1-15 — Non-US E.164 is preserved.**
Given `"+442071838750"`, Then it returns unchanged — the US default must not rewrite an explicit country code.
**[unit]**

**P1-16 — Invalid input is rejected, not mangled.**
Given `""`, `"abc"`, `"123"`, `"+1555"`, `null`, `undefined`,
Then the function returns `null` (or throws a typed error — pick one and apply consistently); it never returns a partially-formatted string.
**[unit]**

**P1-17 — Normalization is applied at all three write/read points.**
**[code]** grep confirms `phone.ts` is called from (a) the outbound SMS send path, (b) the Twilio inbound contact-match path, (c) contact create and contact update.

## 1.3 `sms-service.ts`

- [ ] **P1-18** Exports a `SmsProvider` interface and `setSmsProvider()`, mirroring `email-service.ts`'s `EmailProvider` / `setEmailProvider()` shape. **[code]**
- [ ] **P1-19** `TwilioSmsProvider` lazily constructs its client and throws a clear error when `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` are unset — same lazy pattern as `ResendEmailProvider.getClient()`. **[unit]** with env vars deleted.
- [ ] **P1-20** Sends use `messagingServiceSid` (from `TWILIO_MESSAGING_SERVICE_SID` or `workspace_channels.config`), **not** a bare `from` number. **[unit]** with a fake provider asserting the payload shape.
- [ ] **P1-21** Every send sets `statusCallback` to the absolute public URL of `/api/webhooks/twilio/status`. **[unit]** asserts the callback URL is absolute (`https://…`) and ends with that path.
- [ ] **P1-22** Twilio credentials are never imported into a `"use client"` module. **[code]** grep `TWILIO_` across `src/` — hits only in server files.

## 1.4 `send-message.ts` — `sendConversationMessage()`

**P1-23 — Happy-path ordering.**
Given a contact with a valid email and an active `workspace_channels` email row,
When `sendConversationMessage()` is called,
Then in order: channel config resolves → suppression check passes → conversation is found or created → a `messages` row is inserted with `status='queued'` → the provider send fires → the row updates to `sent` with `provider_id` set → the conversation's `last_message_at`, `last_message_preview`, `last_message_channel`, `last_message_direction` are updated.
**[unit]** with a fake provider recording call order; assert the `queued` row exists *before* the provider is called (so a provider crash leaves a recoverable row).

**P1-24 — Provider failure is recorded, not thrown away.**
Given a provider that throws,
Then the `messages` row ends at `status='failed'` with `error` populated, the conversation is **not** bumped, and the caller receives a failure result rather than an unhandled exception.
**[unit]**

**P1-25 — Outbound email headers.**
Given an outbound email on conversation with `reply_token = TOK`,
Then the send payload has `From: "{from_name}" <{from_local_part}@send.alignocrm.com>` and `Reply-To: r+TOK@reply.alignocrm.com`.
**[unit]** asserting the exact strings.

**P1-26 — Threading headers.**
Given the conversation's most recent **inbound** message has `email_message_id = "<abc@mail.example>"`,
When an outbound email is sent on that conversation,
Then `In-Reply-To` equals that value and `References` includes it.
And Given a conversation with no inbound email yet, Then neither header is set (no empty-string headers).
**[unit]**

**P1-27 — Missing address short-circuits.**
Given a contact with no email (email channel) or no phone (sms channel),
Then no `messages` row is inserted, no provider call is made, and the caller gets a distinguishable "no address" error.
**[unit]**

## 1.5 Suppression semantics — the asymmetry

The highest-risk logic in Phase 1. The full matrix, per the A-6 ruling (`bounce` hard-blocks everywhere; only `unsubscribe`/`complaint` are warn-allow on 1:1 email):

| Channel | Reason | 1:1 send | Campaign send |
|---|---|---|---|
| SMS | `stop` | **blocked** | **blocked**, `suppressed_count` |
| Email | `unsubscribe` | allowed + warning | **blocked**, `suppressed_count` |
| Email | `complaint` | allowed + warning | **blocked**, `suppressed_count` |
| Email | `bounce` | **blocked** | **blocked**, `suppressed_count` |
| Either | `manual` | **blocked** | **blocked**, `suppressed_count` |

**P1-28 — SMS STOP blocks everything.**
Given a `suppressions` row `(workspace, 'sms', '+15551234567', 'stop')`,
When a **1:1 conversation** SMS is sent to that number → blocked, no provider call, no `messages` row (or a `failed` row with a suppression reason — pick one, apply consistently).
And When a **campaign** SMS targets that number → blocked and counted in `suppressed_count`.
And there is **no override flag** on either path.
**[unit]** ×2 (1:1 and campaign). **[code]** grep for a force/override parameter on the SMS path — must find none.

**P1-29 — Email `unsubscribe` and `complaint` block campaigns only.**
Given a `suppressions` row `(workspace, 'email', 'x@example.com', 'unsubscribe')` — and separately `'complaint'`,
When a **campaign** email targets that address → blocked, counted in `suppressed_count`, no provider call.
And When a **1:1 conversation** email is sent to that address → the send **proceeds**, and the result carries a warning indicating the address is suppressed.
**[unit]** ×4 (two reasons × two paths).

**P1-30 — Email `bounce` blocks 1:1 as well as campaigns.**
Given a `suppressions` row `(workspace, 'email', 'x@example.com', 'bounce')`,
Then **both** the campaign path and the 1:1 conversation path are blocked with no provider call — a hard-bounced address is undeliverable regardless of intent, and repeat attempts damage domain reputation.
And the 1:1 UI surfaces this as a blocked send with a reason, not as a dismissible warning.
**[unit]** ×2 + **[ui]**. This is the one case where email behaves like SMS; test it separately from P1-29 rather than parameterizing the two together, so a regression that collapses them is caught.

**P1-30b — Reason-to-policy mapping is table-driven.**
The block/warn decision comes from a single declared mapping of `(channel, reason, path) → allow|warn|block`, not from scattered conditionals.
**[code]** — a reviewer should be able to read the policy in one place and match it against the matrix above.

**P1-31 — Suppression matching is normalized.**
Given a suppression on `"X@Example.COM"`,
Then a send to `"x@example.com"` is matched (emails lowercased on both write and lookup).
And Given a suppression on `"+15551234567"`, Then a send to `"(555) 123-4567"` is matched (phones E.164-normalized on both write and lookup).
**[unit]** ×2.

**P1-32 — Suppression is workspace-scoped.**
Given a suppression row in workspace A, When workspace B sends to the same address, Then it is not blocked.
**[unit]**

## 1.6 Sender-fallback cleanup

- [ ] **P1-33** `grep -rn "aki.b@pentridgemedia.com" src/` returns **zero** hits. **[code]**
- [ ] **P1-34** Sender resolution is exactly `workspace_channels.config` → `EMAIL_FROM` → **throw**. Verify **[unit]**: with no channel config and no `EMAIL_FROM`, the send throws a descriptive error rather than silently using any default address.

## Definition of done — Phase 1

- Migration written in root `migrations/` with timestamp naming, applied to the dev DB, and verified with `[sql]` against P1-03 through P1-09 — including the nullable `conversation_id`, `opened_at`/`clicked_at`, and `no_address_count`.
- Live schema verified before the DDL was written (P1-01b), and the four new dependencies installed (P1-01c).
- `npm run test:run` green, including new unit suites for `phone.ts`, the full suppression matrix in §1.5, and `sendConversationMessage()` with a fake provider.
- `npm run build` (or `tsc --noEmit`) clean — no new type errors.
- A real 1:1 email and a real 1:1 SMS can be sent from a script/REPL against the live providers and land in the recipient's inbox/handset, with correct `From` and `Reply-To`, and a `messages` row at `status='sent'`.
- Zero personal-address fallbacks remain in the codebase.
- No changes to `message_logs`, `src/lib/workflows/`, or `trigger/`. Verify with `git diff --stat`.

---

# Phase 2 — Two-way plumbing (webhooks)

## 2.1 Requirements common to all four webhooks

Apply each of these to `/api/webhooks/resend`, `/api/webhooks/resend/inbound`, `/api/webhooks/twilio/inbound`, `/api/webhooks/twilio/status`.

**P2-01 — Invalid signature is rejected.**
Given a request whose signature header is absent, malformed, or computed with the wrong secret,
Then the route responds `401` (or `403`), performs **no** database write, and logs the rejection.
**[unit]** per route. **[curl]**:
```bash
curl -i -X POST http://localhost:3000/api/webhooks/twilio/status \
  -H 'X-Twilio-Signature: bogus' \
  -d 'MessageSid=SM123&MessageStatus=delivered'
# expect 401/403, and no row change
```

**P2-02 — Valid signature is accepted.**
Given a request signed with the configured secret, Then the route responds `200` and applies its effect.
**[unit]** per route, constructing a genuine signature (Svix for Resend; Twilio's `validateRequest` HMAC for Twilio).

**P2-03 — Twilio signature uses exact-URL reconstruction.**
Given the app runs behind a proxy where `request.url` may differ from the public URL Twilio signed,
Then the signature check reconstructs the URL from the configured public base (env-driven), not from the raw request host.
**[code]** review + **[unit]** with a request whose `Host` header differs from the configured base — signature still validates.

**P2-04 — Missing secret fails closed.**
Given the relevant `*_SECRET` / `TWILIO_AUTH_TOKEN` env var is unset,
Then the route rejects all requests rather than skipping verification.
**[unit]** with the env var deleted — assert non-2xx, and assert there is no `if (!secret) return next()` style bypass. **[code]**

**P2-05 — Idempotency: duplicate deliveries no-op.**
Given the same provider event delivered twice (identical `provider_id` / event id),
Then the second delivery produces no duplicate `messages` row, no double-increment of any counter (`unread_count`, campaign counters), and still responds `200`.
**[unit]** per route: call the handler twice with the same payload, assert row count and counters unchanged after the second call.

**P2-06 — Malformed body is survivable.**
Given a correctly-signed request with an unexpected/empty JSON or form body,
Then the route responds `200` or `400` (never `500`) and logs; the process does not crash.
**[unit]**

**P2-07 — Webhook routes do not call `requireTenantContext()`.**
Webhooks are unauthenticated-by-session; workspace is derived from the matched conversation / channel config / recipient token.
**[code]** grep the four route files — zero hits for `requireTenantContext`.

## 2.2 `POST /api/webhooks/resend` — delivery events

**P2-08 — Status transitions.**
Given a `messages` row with `provider='resend'`, `provider_id='re_abc'`, `status='sent'`,
When events arrive, Then: `email.delivered` → `delivered` (+ `delivered_at`); `email.bounced` → `bounced`.
**[unit]** parameterized over event types.

**P2-08b — Events with no status slot land in columns, not the enum.**
Given `email.opened` → `opened_at` is set and `status` is **unchanged**.
Given `email.clicked` → `clicked_at` is set and `status` is **unchanged**.
Given `email.complained` → a `complaint` suppression row is written, the raw event is merged into `provider_response`, and `status` **remains `delivered`** (a complaint is not a delivery failure).
**[unit]** ×3 — each asserts the status field specifically, since the tempting-but-wrong implementation is to widen the enum.

**P2-08c — Repeat opens/clicks do not overwrite the first timestamp.**
Given `opened_at` already set, When a second `email.opened` arrives, Then `opened_at` is unchanged (first-open semantics).
**[unit]**

**P2-09 — Bounce and complaint write suppressions.**
Given an `email.bounced` (hard) or `email.complained` event for `x@example.com` in workspace W,
Then a `suppressions` row `(W, 'email', 'x@example.com', 'bounce'|'complaint')` exists with `source_message_id` pointing at the message.
And a second identical event does not error (unique constraint handled via upsert).
**[unit]** ×2.

**P2-10 — Campaign counters follow status.**
Given a bounced message with `campaign_id` set,
Then that campaign's `failed_count` increments by exactly 1, and by exactly 1 again on a duplicate delivery of the same event (i.e. not at all).
**[unit]**

**P2-11 — Unknown `provider_id` is a no-op 200.**
Given an event for a `provider_id` not in `messages`, Then respond `200`, write nothing, log once.
**[unit]**

## 2.3 `POST /api/webhooks/resend/inbound` — inbound email

**P2-12 — Reply token routes to the conversation.**
Given a conversation with `reply_token='TOK'`,
When an inbound email arrives addressed to `r+TOK@reply.alignocrm.com`,
Then an inbound `messages` row is created on that conversation with `direction='inbound'`, `status='received'`, `channel='email'`, `email_message_id` set from the RFC 5322 `Message-ID`, and the conversation's `unread_count` increments by 1 and `last_message_*` fields update.
**[unit]** + **[ui]** end-to-end: reply to a real sent email, see it appear in the thread.

**P2-13 — Unknown or malformed token is acknowledged and dropped.**
Given an inbound email to `r+NOPE@reply.alignocrm.com`, or to an address with no `r+` prefix, or with multiple recipients none of which parse,
Then the route responds **`200`**, creates **no** message and **no** conversation, and emits exactly one log line naming the unmatched recipient.
**[unit]** ×3 (unknown token, malformed local part, no recipient match). Assert `200` specifically — a non-2xx would make the provider retry and could generate a bounce.

**P2-14 — Token lookup is not tenant-guessable.**
Given a valid token, the resolved workspace comes from the conversation row itself; no workspace id is read from the request payload.
**[code]**

**P2-15 — HTML is sanitized before storage.**
Given an inbound email whose HTML body contains `<script>alert(1)</script>`, an `onerror=` attribute, a `<iframe>`, and a `javascript:` href,
Then the stored `body_html` contains none of them.
**[unit]** with those exact payloads. **[code]** confirm sanitization runs through `sanitize-html` server-side at write time (per A-17 — not a browser DOMPurify build, not a hand-rolled regex strip), and that rendering does not re-trust the stored value.

**P2-16 — Attachments show as an indicator only.**
Given an inbound email with one or more attachments,
Then the message row records that attachments were present, no file bytes are stored, and the thread UI shows a "has attachments" indicator.
**[unit]** + **[ui]**

## 2.4 `POST /api/webhooks/twilio/inbound` — inbound SMS

**P2-17 — Known sender matches an existing contact.**
Given a contact with phone `+15551234567`,
When an SMS arrives from `+15551234567` (and, separately, from a legacy contact row storing `(555) 123-4567`),
Then both match that contact — no new contact is created — and the message lands on that contact's conversation with `unread_count` incremented.
**[unit]** ×2 (normalized row, legacy-format row).

**P2-18 — Unknown sender auto-creates a contact.**
Given no contact matches the inbound number,
Then a contact is created with the phone in E.164 and no email, tagged `source:sms-inbound`, and a conversation + inbound message are created for it.
**[unit]** — assert exactly one contact created, and that a second message from the same number creates **zero** additional contacts.

**P2-19 — STOP adds a suppression.**
Given an inbound SMS whose body is `STOP` (also test `stop`, ` Stop `, and other Twilio opt-out keywords the implementation claims to handle),
Then a `suppressions` row `(workspace, 'sms', '<E.164>', 'stop')` is created (upsert-safe on repeat).
**[unit]** parameterized over the keyword list.

**P2-19b — Blocked-number error reconciles into a suppression (the belt-and-suspenders half of A-7).**
Given Advanced Opt-Out handled a STOP at the carrier level and never forwarded it to our inbound webhook, so no suppression row exists,
When a subsequent send to that number produces a Twilio status callback with error code **`21610`** (send to a blocked number),
Then a `suppressions` row `(workspace, 'sms', '<E.164>', 'stop')` is written, the message is marked `failed`, and the next send to that number is blocked before reaching Twilio.
**[unit]** — simulate the 21610 callback with no pre-existing suppression, then assert the following send short-circuits.

**P2-19c — Live verification of Advanced Opt-Out forwarding.**
Before Phase 2 sign-off, text `STOP` to the real toll-free number and record which path fired: the inbound webhook (P2-19), the 21610 reconciliation (P2-19b), or both. Note the observed behavior in this document.
**[manual]** — this determines whether P2-19 or P2-19b is the load-bearing path in production; both must be implemented regardless, but the result should be written down rather than assumed.

**P2-20 — UNSTOP/START removes the suppression.**
Given an existing `stop` suppression, When an inbound `START`/`UNSTOP` arrives, Then the suppression row is deleted and a subsequent send succeeds.
**[unit]**

**P2-21 — Opt-out keywords are still logged as messages.**
Given a STOP message, Then it is also stored as an inbound message on the conversation (the operator can see why sending stopped).
**[unit]** — or, if the plan's intent is to swallow it, document the choice; either way the behavior must be deliberate and tested.

## 2.5 `POST /api/webhooks/twilio/status` — status callbacks

**P2-22 — Status mapping.**
Given a `messages` row with `provider='twilio'`, `provider_id='SM123'`,
When callbacks arrive with `MessageStatus` of `sent`, `delivered`, `failed`, `undelivered`,
Then the row's status becomes `sent`, `delivered` (+ `delivered_at`), `failed`, `failed` respectively, and `ErrorCode`/`ErrorMessage` (when present) land in `error`.
And error code `21610` additionally triggers the suppression write of P2-19b.
**[unit]** parameterized.

**P2-23 — Out-of-order callbacks do not regress status.**
Given a row already at `delivered`, When a late `sent` callback arrives, Then the row stays `delivered`.
**[unit]**

## 2.6 Quoted-reply stripping

**P2-24 — The v1 delimiter list is stripped into `body_text`.**
The list is fixed (A-9), English-only for v1, and must exist as an enumerated constant in the source rather than inline regexes:

1. `^On .* wrote:$`
2. `-----Original Message-----`
3. `From:` / `Sent:` header blocks
4. Leading-`>` line runs
5. `________________` separator rules

Given an inbound body containing each delimiter,
Then `body_text` holds only the new reply text with the quoted block removed, and `body_html` retains the full sanitized original.
**[unit]** one case per delimiter (5 tests), with fixtures committed alongside. **[code]** confirm the enumerated constant.

**P2-24b — Non-English quote headers are left intact (accepted v1 limitation).**
Given a body quoted with `Le 5 août 2026, … a écrit :`,
Then the quoted text is **not** stripped and appears in `body_text` — a documented v1 gap, not a bug. The full message stays readable via "Show full message".
**[unit]** — pins the limitation so a future i18n pass has a test to flip.

**P2-25 — Stripping never empties a legitimate message.**
Given a body with no quoted history, Then `body_text` equals the original text.
And Given a body where stripping would remove everything, Then the full text is kept rather than storing an empty string.
**[unit]** ×2.

## Definition of done — Phase 2

- All four routes exist, are signature-verified, and reject unsigned requests. P2-01 and P2-04 pass on all four.
- Idempotency proven by test for all four (P2-05).
- End-to-end verified against a tunnel or preview deploy: send a real email → reply from a real mail client → the reply appears in the correct conversation with `unread_count = 1`. Send a real SMS → reply from a real handset → same. Text `STOP` → a suppression row appears and the next send is blocked.
- P2-19c completed: the live STOP test was run against the real toll-free number and the observed path (webhook, 21610 reconciliation, or both) is recorded in this document.
- Sanitization test suite (P2-15) green with adversarial payloads.
- No webhook route calls `requireTenantContext()` (P2-07); every one derives workspace from data, not from the request.

---

# Phase 3 — Conversations API & UI

## 3.1 API routes — common

- [ ] **P3-01** Every route under `/api/conversations`, `/api/messages` calls `requireTenantContext()` and uses `tenantErrorResponse(error)` in its catch, matching `src/app/api/tags/route.ts`. **[code]**
- [ ] **P3-02** Every query filters by `tenant.workspaceId` — **`workspace_id` alone is the tenancy boundary** (A-11); `organization_id` is nullable metadata populated via the existing conditional-spread idiom and migration-009 triggers, and must **not** appear in a query's `WHERE` clause. **[code]** + **[unit]**: a request from workspace B for a conversation id belonging to workspace A returns `404` (not `403`, not the row). Test this explicitly for `GET /api/conversations/[id]`, `POST /[id]/read`, `POST /[id]/messages`.
- [ ] **P3-02b** Rows created through these routes carry `organization_id` when `tenant.organizationId` is present and omit it when absent, matching `src/app/api/tags/route.ts`. A workspace with no organization can still use every route. **[unit]**
- [ ] **P3-03** Unauthenticated requests return `401` via the shared tenant error path. **[curl]** with no session cookie against each route.

## 3.2 `GET /api/conversations`

**P3-04 — Default listing.**
Given conversations in the workspace, Then the response is sorted by `last_message_at` descending and contains contact name, channel(s), preview, `last_message_at`, `unread_count`.
**[curl]**: `curl -s -b cookies.txt 'http://localhost:3000/api/conversations' | jq '.conversations[0]'`

**P3-04b — Token-holder conversations are invisible.**
Given a conversation row created by a campaign send purely to hold a reply token (`last_message_at IS NULL`),
Then it does **not** appear in the list — the query filters `last_message_at IS NOT NULL` (A-2/A-3).
And When a reply to that campaign arrives and sets `last_message_at`, Then it appears.
**[unit]** ×2 — the second half matters most: a token-holder row must become visible the moment it carries a real message.

**P3-05 — Filters.**
Given `?channel=email`, only conversations whose `last_message_channel='email'` return. Given `?unread=true`, only conversations with `unread_count > 0` return. Filters combine (AND), and all of them compose with the `last_message_at IS NOT NULL` rule of P3-04b.
**[unit]** ×3.

**P3-05b — Search scope is contact fields plus preview only.**
Given `?q=<term>`, Then results match on contact **name**, **email**, **phone**, or `last_message_preview` — and nothing else. Message bodies are **not** full-text searched in v1 (A-10).
**[unit]** ×5: one hit per searchable field, plus a negative case proving a term that appears only in an older message's `body_text` returns no result.

**P3-06 — `GET /api/conversations/unread-count`.**
Returns `{ count: N }` where N is the number of conversations with `unread_count > 0` — a **conversation** count, not a message count.
**[unit]**: with two conversations at `unread_count` 3 and 5, the endpoint returns `2`.

## 3.3 Unread semantics

**P3-07 — Inbound increments.**
Given a conversation at `unread_count = 0`, When two inbound messages arrive, Then `unread_count = 2`.
**[unit]**

**P3-08 — Mark-read zeroes.**
Given `unread_count = 5`, When `POST /api/conversations/[id]/read` is called, Then `unread_count = 0` and the nav badge count drops accordingly.
**[curl]**:
```bash
curl -s -X POST -b cookies.txt http://localhost:3000/api/conversations/<id>/read
curl -s -b cookies.txt http://localhost:3000/api/conversations/unread-count
```

**P3-09 — Mark-read is idempotent and safe on an already-read thread.**
Calling `/read` twice leaves `unread_count = 0` and returns `200` both times.
**[unit]**

**P3-10 — Outbound leaves unread untouched.**
Given `unread_count = 3`, When an outbound message is sent on that conversation, Then `unread_count` is still 3 — replying does not implicitly mark the thread read; only `POST /[id]/read` clears it (A-15, confirmed).
**[unit]**

**P3-11 — Opening a thread marks it read.**
Given a thread with an unread dot,
When the user clicks it in the list,
Then the dot clears, the sidebar badge decrements, and `POST /[id]/read` fires exactly once (not once per re-render).
**[ui]** with the network tab open.

## 3.4 Thread view & composer

**P3-12 — Mixed-channel timeline.**
Given a conversation with both email and SMS messages, Then all appear in one chronological timeline, visually distinguished by channel, with inbound/outbound sides distinct.
**[ui]**

**P3-13 — Email bubbles.**
Given an email message, Then the bubble shows the subject and a collapsed body, expandable to the full sanitized HTML. The HTML renders sanitized — a stored `<script>` (if one somehow persisted) does not execute.
**[ui]** + **[code]**: no `dangerouslySetInnerHTML` receiving un-sanitized foreign HTML.

**P3-14 — Channel toggle reflects contact capability.**
Given a contact with an email but no phone, Then the SMS toggle is **disabled** with a tooltip/inline text explaining why ("No phone number on this contact").
And Given a contact with a phone but no email, Then the email toggle is disabled with the equivalent explanation.
And Given a contact with both, Then both are enabled.
And Given an SMS-suppressed contact (`stop`), Then the SMS toggle is disabled and the reason states the contact opted out.
And Given a contact suppressed for email with reason `unsubscribe` or `complaint`, Then the email toggle stays **enabled** and a non-blocking warning appears (per P1-29).
And Given a contact suppressed for email with reason **`bounce`**, Then the email toggle is **disabled** with a reason naming the bad address (per P1-30) — this is the case most likely to be implemented as a warning by mistake.
**[ui]** ×6. The plan does not specify the copy; the requirement under review is that every disabled state names its reason, not that it uses particular wording.

**P3-15 — Subject field is email-only.**
Given the composer in email mode, a subject field is present; switching to SMS mode hides it.
**[ui]**

**P3-16 — `POST /api/conversations/[id]/messages`.**
Given a valid body `{channel, subject?, body}`, Then a message is sent via `sendConversationMessage()`, appears optimistically in the timeline, and settles to its real status.
Given a missing `body`, Then `400` with a field-named error.
Given `channel='sms'` for a contact with no phone, Then `400`, no provider call.
**[curl]**:
```bash
curl -s -X POST -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"channel":"email","subject":"Hi","body":"Hello"}' \
  http://localhost:3000/api/conversations/<id>/messages
```

**P3-17 — `POST /api/messages/send` (compose-new).**
Given `{contact_id, channel, subject?, body}` for a contact with no existing conversation, Then a conversation is created (with a fresh reply token) and the message sent.
And Given a contact that already has a conversation, Then the existing one is reused — no duplicate row (guarded by `UNIQUE (workspace_id, contact_id)`).
**[unit]** ×2 — including a concurrent-call test asserting the unique constraint is handled, not surfaced as a 500.

## 3.5 Navigation & entry points

- [ ] **P3-18** Sidebar gains **Conversations**, **Email**, **SMS** entries in `src/components/layout/sidebar.tsx`, matching the existing `{ label, href, icon }` shape and active-state logic. **[code]** + **[ui]**
- [ ] **P3-19** The Conversations entry shows an unread badge sourced from `/api/conversations/unread-count`, polled on an interval; the badge hides at zero. **[ui]** — send yourself an inbound message and watch the badge appear without a reload.
- [ ] **P3-20** Contact drawer has a "Message" action that deep-links to `/conversations?contact=<id>`, and that URL opens (or creates) the right thread pre-selected. **[ui]**

## Definition of done — Phase 3

- A user can hold a full two-way conversation with a real contact over both channels from `/conversations`, with no console errors.
- Cross-tenant isolation proven by test on every conversation route (P3-02).
- Unread lifecycle (arrive → badge → open → clear) verified end to end.
- Disabled-state explanations present for every unavailable-channel case in P3-14.
- `npm run test:run` green; `npm run build` clean.

---

# Phase 4 — Email & SMS sections (templates, campaigns, bulk)

## 4.1 Templates

- [ ] **P4-01** `/api/templates` GET/POST and `/api/templates/[id]` GET/PATCH/DELETE exist, wired to the existing `src/lib/data/templates.ts` functions — no reimplementation of the data layer. **[code]**
- [ ] **P4-02** All five handlers go through `requireTenantContext()`; `GET` list filters by workspace; `GET`/`PATCH`/`DELETE` by id return `404` for another workspace's template. **[unit]** — note `getTemplate(id)` in `templates.ts` currently takes no workspace argument, so the route must enforce the check itself. **[code]** verify it does.
- [ ] **P4-03** Templates UI (under Email and SMS tabs) lists, creates, edits, deletes; the list is filtered to the section's channel. **[ui]**
- [ ] **P4-04** The template editor exposes the merge-tag dropdown reused from the workflow forms — not a new parallel implementation. **[code]**

## 4.2 Campaign CRUD

**P4-05 — Draft lifecycle.**
`POST /api/campaigns` creates a `draft`; `PATCH` edits it; `DELETE` removes it; `GET /api/campaigns` lists workspace campaigns with status and counters.
**[curl]** the full cycle.

**P4-06 — Non-draft campaigns are immutable.**
Given a campaign at `sending` or `sent`, When `PATCH` or `DELETE` is called, Then `409` (or `400`) and the row is unchanged.
**[unit]** ×2.

**P4-07 — Tenant scoping.**
A campaign id from workspace A returns `404` for workspace B on every campaign route including `/send`, `/recipients`, `/process`.
**[unit]**

## 4.3 Audience resolution & `suppressed_count`

**P4-08 — Audience selectors resolve per the A-12 semantics.**
- `{tagIds:[t1]}` → contacts with tag t1.
- `{tagIds:[t1,t2]}` → **union** — contacts with *either* tag.
- `{statuses:['lead']}` → contacts with that status.
- `{tagIds:[t1,t2], statuses:['lead','customer']}` → **intersection across dimensions**: a contact must have (t1 OR t2) AND be (lead OR customer).
- `{all:true}` → all workspace contacts.

**[unit]** ×5 with seeded contacts, including a contact that satisfies the tag dimension but not the status dimension and is therefore excluded.

**P4-08b — `all: true` is exclusive in the UI.**
The audience picker presents `all` as a radio against the tag/status selectors, so `all: true` cannot be combined with them. If a payload arrives with `all: true` alongside non-empty `tagIds`/`statuses`, the API rejects it with `400` rather than silently picking a winner.
**[ui]** + **[unit]**.

**P4-09 — Deduplication.**
Given a contact carrying two of the selected tags, Then exactly one recipient row is materialized for them.
**[unit]**

**P4-10 — Suppressed and address-less contacts are dropped into *separate* counters.**
Given an audience of 10 contacts where 2 are suppressed for the campaign's channel and 1 has no address for that channel,
Then `total_count = 7` with 7 `queued` rows, **`suppressed_count = 2`**, **`no_address_count = 1`**, and no provider call is made for the excluded 3.
**[unit]** — assert both counters independently (A-14). "Opted out" and "we have no phone number for them" are different operator problems and must not be summed into one figure.

**P4-10b — The campaign UI shows both exclusion counts.**
The campaign detail view renders `suppressed_count` and `no_address_count` as distinct labelled figures, not a combined "skipped" number.
**[ui]**

**P4-11 — Live recipient-count preview matches the send.**
Given an audience selected in the composer showing "N recipients",
When the campaign is sent with no data changes in between,
Then `total_count + suppressed_count + no_address_count` equals N — the preview and the resolver share one code path.
**[ui]** + **[code]** (same function called from both).

## 4.4 Bulk processor

**P4-12 — Send materializes then delegates.**
`POST /api/campaigns/[id]/send` inserts one `queued` `messages` row per sendable recipient (batched inserts, not one round-trip each), sets campaign `status='sending'` and `total_count`, then kicks the processor. It returns promptly rather than blocking on the full send.
**[unit]** with 250 recipients: assert 250 `queued` rows and that the response returns before all sends complete.

**P4-13 — Double-send is rejected.**
Given a campaign already at `sending` or `sent`, When `/send` is called again, Then `409`, and no additional `queued` rows are created.
**[unit]** — the most expensive possible bug; test it explicitly.

**P4-14 — Processor drains in chunks.**
Given 250 queued email rows, When the processor runs, Then it sends in batches of ≤100 per Resend batch call, updates each row's status and `provider_id`, self-re-invokes by fetching its own absolute URL with the internal key until zero `queued` rows remain, and sets the campaign to `sent`.
**[unit]** with a fake provider counting batch calls (expect 3).

**P4-14b — Iteration cap bounds the self-invocation loop.**
Given a fault that leaves rows `queued` forever (e.g. every send throws),
Then the processor stops after `ceil(total / chunk_size) + 5` invocations rather than re-invoking indefinitely, and the campaign is marked `failed` with the reason recorded.
**[unit]** — force a permanent failure and assert the invocation count is bounded and the campaign does not sit in `sending` forever.

**P4-14c — Each invocation yields before the function timeout.**
Given a chunk that is still draining at ~250s of wall time,
Then the invocation stops claiming new work, re-invokes its successor, and returns — staying under the 300s serverless function limit.
**[unit]** with an injected clock; assert the handler returns before the budget and that a successor invocation was scheduled.

**P4-15 — Resumable after a crash.**
Given a campaign with 100 rows where 40 are `sent` and 60 are `queued`,
When the processor endpoint is invoked again,
Then only the 60 `queued` rows are processed — the 40 already-sent rows are not re-sent (verify by provider call count, the observable that matters).
**[unit]**

**P4-16 — Processor endpoint requires internal auth via `ALIGNO_API_KEY`.**
Given `POST /api/campaigns/[id]/process` with a wrong key, Then `401` and nothing is processed. Given the correct key, Then it processes.
The route reuses the existing helpers — `getInternalApiAuthContext()` / `unauthorizedInternalApiResponse()` in `src/lib/api/internal-auth.ts`, called the same way `emitter.ts` calls `/api/events/process` with `Authorization: Bearer ${ALIGNO_API_KEY}` (A-5). No new scheme, no new env var.
**[code]** confirm the shared helper is used. **[curl]** (with `ALIGNO_API_KEY` **set** in the environment):
```bash
curl -i -X POST http://localhost:3000/api/campaigns/<id>/process            # expect 401
curl -i -X POST -H "Authorization: Bearer $ALIGNO_API_KEY" \
  http://localhost:3000/api/campaigns/<id>/process                          # expect 200
```

**P4-16b — The 401 test is only meaningful with the key set.**
`getInternalApiAuthContext()` deliberately returns `authorized: true` when `ALIGNO_API_KEY` is **unset**, `NODE_ENV !== "production"`, and no key was supplied (`internal-auth.ts:52-59`). A reviewer running the P4-16 curl on a dev box with no key configured will see `200` and wrongly record a failure.
Verify the 401 path with `ALIGNO_API_KEY` set locally, and separately confirm the variable is set in the deployed environment so production never takes the dev-open branch.
**[curl]** + **[code]**

**P4-16c — The processor derives workspace from the campaign, not from the auth context.**
Given the processor authenticated with the env `ALIGNO_API_KEY`, the tenant context returned by `getInternalApiAuthContext()` is the **fallback workspace** (`internal-auth.ts:45-50`), *not* the campaign's workspace.
Therefore the processor must read `workspace_id` from the `campaigns` row it is processing and use that for every downstream query and suppression check.
**[unit]** — process a campaign belonging to a real workspace while authenticated with the env key; assert the sends, suppression lookups, and counter updates all target the campaign's workspace and that nothing is written under the fallback workspace id. This is a known trap in this codebase and the single most likely way the processor silently sends to the wrong tenant's data.

**P4-17 — Per-recipient merge tags, HTML-escaped.**
Given a body containing `{{contact.first_name}}` and a contact whose first name is `Bob <script>alert(1)</script>`,
Then the rendered HTML contains the escaped form and no executable script; each recipient receives their own interpolated copy.
**[unit]** — this is the bug class called out in the plan (`invites/route.ts`); test it directly.

**P4-18 — Missing merge values degrade gracefully.**
Given `{{contact.company}}` and a contact with no company, Then the send still happens with an empty substitution (per `interpolateTemplate`'s existing behavior) and the warning is logged, not surfaced to the recipient.
**[unit]**

**P4-19 — Campaign message rows carry `conversation_id = NULL`.**
Given a campaign send, Then every resulting `messages` row has `conversation_id` NULL, so campaign traffic never appears in a conversation timeline.
**[unit]** + **[sql]**: `SELECT count(*) FROM messages WHERE campaign_id IS NOT NULL AND conversation_id IS NOT NULL` returns `0`.

**P4-19b — Campaign sends find-or-create a token-holder conversation without disturbing it.**
Given a campaign send to a contact with no existing conversation,
Then a conversation row **is** created to hold the reply token, but with `last_message_at` NULL, `unread_count` 0, and no `last_message_*` fields set — and it does not appear in the inbox (P3-04b).
And Given a contact who already has an active conversation, Then the existing row and its `reply_token` are reused, and its `last_message_at`, `last_message_preview`, and `unread_count` are **unchanged** by the campaign send.
**[unit]** ×2 — the second case is the regression risk: a campaign blast must not reorder or unread-badge the operator's live inbox.

**P4-20 — Replies to campaign emails land in conversations.**
Given a campaign email sent with the token-holder conversation's reply token,
When the recipient replies, Then the reply lands on that same conversation, sets `last_message_at`, increments `unread_count`, and the conversation now appears in the inbox for the first time.
**[unit]** + end-to-end **[ui]** — send a real campaign to yourself, reply, confirm the thread surfaces.

**P4-21 — Counters stay accurate.**
Given an audience of 11 where 2 are suppressed, 1 has no address for the channel, 7 send successfully and 1 fails,
Then `total_count=8`, `sent_count=7`, `failed_count=1`, `suppressed_count=2`, `no_address_count=1`; and after delivery webhooks, `delivered_count` reflects only delivered messages and never exceeds `sent_count`.
And the five counters plus `total_count` reconcile against the audience size: `total_count + suppressed_count + no_address_count = 11` and `sent_count + failed_count = total_count`.
**[unit]** — assert the two reconciliation identities, not just the individual numbers.

## 4.5 Per-recipient status

**P4-22 — `GET /api/campaigns/[id]/recipients`.**
Returns one row per recipient with contact identity, address, status, error (when failed), and timestamps; paginated for large campaigns.
**[curl]** + **[ui]**: the campaign detail page renders this as a table whose statuses match the `messages` rows.

## 4.6 Unsubscribe

**P4-23 — Bulk email carries unsubscribe headers.**
Given a campaign email send, Then the payload includes `List-Unsubscribe` (pointing at the per-recipient unsubscribe URL) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and the body contains a footer link to the same URL.
**[unit]** asserting the header values on a fake provider.

**P4-24 — 1:1 conversation email carries neither.**
Given a 1:1 send, Then no unsubscribe headers and no footer.
**[unit]**

**P4-25 — Tokens are per-recipient, HMAC-signed, and non-expiring.**
Given two recipients of the same campaign, their unsubscribe tokens differ.
And a token with a tampered payload or signature is rejected.
And tokens are signed with `UNSUBSCRIBE_SECRET` (HMAC, 32+ random bytes) and carry **no expiry** — an unsubscribe link in a two-year-old email must still work, since a dead opt-out link is a compliance failure.
**[unit]** ×3 — flip one character of the signature and assert rejection; verify a token minted with a backdated timestamp still validates.

**P4-26 — GET renders a confirm page and changes nothing.**
Given a valid token, When `GET /api/unsubscribe/[token]` is requested,
Then a human-readable confirmation page renders with a confirm button, and **no** `suppressions` row is written.
**[curl]** + **[sql]** — assert the suppression table is unchanged after the GET. This matters because mail-client link prescanners issue GETs; a GET that unsubscribes would opt people out without their action.

**P4-26b — POST executes the unsubscribe.**
Given a valid token, When `POST /api/unsubscribe/[token]` is issued — either by the confirm button or by an RFC 8058 one-click client sending `List-Unsubscribe=One-Click` —
Then a `suppressions` row `(workspace,'email',address,'unsubscribe')` is created and a confirmation is returned. Posting twice does not error and does not duplicate the row.
**[curl]**:
```bash
curl -i http://localhost:3000/api/unsubscribe/<token>                        # confirm page, no write
curl -i -X POST -d 'List-Unsubscribe=One-Click' \
  http://localhost:3000/api/unsubscribe/<token>                              # executes
```

**P4-26c — The `List-Unsubscribe` header URL accepts the one-click POST.**
The URL placed in the `List-Unsubscribe` header resolves to the POST handler without a redirect or an auth challenge, so Gmail/Apple Mail one-click succeeds.
**[manual]** — send a real campaign to a Gmail account and use its native "Unsubscribe" affordance; confirm the suppression row appears.

**P4-27 — Invalid token is handled.**
Given a garbage or expired token, Then a plain "this link is no longer valid" page renders (not a stack trace, not a 500), and no suppression is written.
**[curl]**

**P4-28 — Unsubscribing takes effect immediately.**
After unsubscribing, a subsequent campaign to that address is blocked and counted in `suppressed_count`; a 1:1 email still sends with a warning.
**[unit]**

## 4.7 Opt-out list UI

- [ ] **P4-29** `/api/suppressions` GET lists workspace suppressions (filterable by channel); POST adds a manual entry (reason `manual`, address normalized per P1-31); DELETE removes one. All tenant-scoped. **[curl]**
- [ ] **P4-30** The SMS section's Opt-outs tab renders the list and supports manual add/remove; adding an already-suppressed address shows a friendly message rather than a constraint-violation error. **[ui]**
- [ ] **P4-31** Removing an SMS `stop` suppression from the UI carries a warning about the compliance implications (the operator is overriding a recipient's opt-out). **[ui]**

## Definition of done — Phase 4

- A real campaign of ≥3 recipients (including one suppressed and one address-less) sends end to end; both reconciliation identities in P4-21 hold, with `suppressed_count` and `no_address_count` reported separately; the recipient table matches reality.
- Resumability proven: kill the processor mid-run, re-invoke, no duplicate sends (P4-15); the iteration cap bounds a permanently-failing run (P4-14b).
- Processor verified to operate on the campaign's workspace rather than the fallback tenant returned by the env-key auth path (P4-16c).
- A campaign blast to a contact with an active thread leaves that thread's position and unread count untouched (P4-19b).
- One-click unsubscribe from a real email client results in a suppression row, and the next campaign skips that address; a bare GET of the same link writes nothing (P4-26).
- Merge-tag escaping test (P4-17) green.
- Templates CRUD works from both Email and SMS sections.
- `npm run test:run` green; `npm run build` clean.

---

# Phase 5 — Polish & hardening

## 5.1 Settings

- [ ] **P5-01** `GET/PUT /api/messaging/settings` reads and writes `workspace_channels.config`, tenant-scoped, with validation (email: `from_local_part` matches a safe local-part pattern; sms: `phone_number` is E.164). Invalid input → `400`, no write. **[unit]**
- [ ] **P5-01b** `GET /api/messaging/settings` **idempotently creates** the workspace's default `workspace_channels` rows (email + sms) on first read, then returns them (A-16 — this replaces migration-time seeding). Calling GET twice yields the same row ids and creates no duplicates; concurrent first-reads are safe via the `UNIQUE (workspace_id, channel)` constraint rather than surfacing a 500. **[unit]** — including a concurrent double-GET test.
- [ ] **P5-01c** A brand-new workspace can reach every messaging screen without a manual seed step. **[ui]** — exercise with a workspace that has no `workspace_channels` rows.
- [ ] **P5-02** Email → Settings tab shows sender identity (editable) and the sending-domain status. **[ui]**
- [ ] **P5-03** SMS → Settings tab shows the toll-free number and its verification status. **[ui]**
- [ ] **P5-04** Saving settings changes the `From` header on the next send. **[ui]** end-to-end.

## 5.2 Environment & config

- [ ] **P5-05** `.env.local.example` documents all eight new vars — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`, `MESSAGING_EMAIL_DOMAIN`, `MESSAGING_REPLY_DOMAIN`, `UNSUBSCRIBE_SECRET` — plus the previously-missing `RESEND_API_KEY`. `ALIGNO_API_KEY` is reused, not newly introduced, but must appear in the example file if it does not already. **[code]** — diff against `grep -rho 'process\.env\.[A-Z_]*' src/ | sort -u`; every referenced var is documented.
- [ ] **P5-05b** `UNSUBSCRIBE_SECRET` is ≥32 random bytes and the app refuses to mint or verify unsubscribe tokens when it is unset (fails closed rather than signing with an empty key). **[unit]**
- [ ] **P5-05c** `ALIGNO_API_KEY` is set in the deployed environment, so `internal-auth.ts` never takes its dev-open branch in production (see P4-16b). **[manual]** — check the Vercel environment, not just `.env.local`.
- [ ] **P5-06** No secret has a committed default value; every example entry is empty or an obvious placeholder. **[code]**

## 5.3 Rate limiting

**P5-07 — 1:1 send routes cap at 60 messages/min/workspace.**
Given 60 outbound messages already created for workspace W in the trailing 60 seconds,
When a 61st request hits `/api/messages/send` or `/api/conversations/[id]/messages`,
Then it returns `429` with a `Retry-After` header, no provider call is made, and no `messages` row is created.
And after the window rolls forward, sending resumes.
**[unit]** + **[curl]** loop of 61 requests.

- [ ] **P5-07b** The limit is enforced by counting `messages` rows created in the trailing 60s for the workspace — one indexed query, no in-memory counter (which would not hold across serverless instances) and no new infrastructure (A-13). **[code]**
- [ ] **P5-07c** The counting query is covered by the `(workspace_id, created_at DESC)` index from P1-06 and does not table-scan. **[sql]** `EXPLAIN` the limiter's query and confirm index usage.
- [ ] **P5-07d** The limit is scoped **per workspace**, not globally or per IP: workspace A exhausting its budget does not `429` workspace B. **[unit]**
- [ ] **P5-07e** The two 1:1 routes share one limiter budget (60/min total across both, not 60 each). **[unit]** — 30 sends through each route trips the 61st.
- [ ] **P5-07f** `/api/campaigns/[id]/send` is **not** subject to the 60/min 1:1 limit — bulk sends would trivially exceed it. Campaign throughput is governed by the chunked processor (P4-14) and provider-side rate limits instead. **[code]** confirm the limiter is not applied there.

## 5.4 Empty, loading, and error states

- [ ] **P5-08** Conversations with no threads, a campaign with no recipients, an empty template list, and an empty opt-out list each render a purposeful empty state rather than a blank pane. **[ui]**
- [ ] **P5-09** A failed send surfaces an inline error with the reason; the composer retains the drafted text rather than clearing it. **[ui]**
- [ ] **P5-10** List and thread views show loading skeletons/spinners; no layout shift on load. **[ui]**
- [ ] **P5-11** A failed campaign (`status='failed'`) is visibly distinguished in the campaign list with the failure reason reachable. **[ui]**

## 5.5 Test suite

Required automated coverage, all under `src/__tests__/` and green in `npm run test:run`:

- [ ] **P5-12** Webhook signature verification — valid accepted, invalid rejected, missing secret fails closed — for all four routes.
- [ ] **P5-13** Webhook idempotency — duplicate delivery is a no-op — for all four routes.
- [ ] **P5-14** Suppression logic — the full matrix in §1.5 (P1-28 through P1-32), with `bounce`-blocks-1:1 (P1-30) as its own case.
- [ ] **P5-15** E.164 normalization — P1-13 through P1-16.
- [ ] **P5-16** Reply-token routing — valid token routes, unknown token 200-drops.
- [ ] **P5-17** Merge-tag HTML escaping (P4-17).
- [ ] **P5-18** Campaign resumability (P4-15), double-send rejection (P4-13), iteration cap (P4-14b), and processor workspace derivation (P4-16c).
- [ ] **P5-18b** Unsubscribe GET/POST split — GET writes nothing, POST suppresses (P4-26, P4-26b).
- [ ] **P5-18c** Rate limiter — 429 at the 61st send, per-workspace scoping (P5-07, P5-07d).
- [ ] **P5-19** Cross-tenant isolation on conversation, campaign, template, and suppression routes.
- [ ] **P5-20** No test hits a live provider — `setEmailProvider()` / `setSmsProvider()` fakes throughout. **[code]** grep the test dir for real API keys or network calls.
- [ ] **P5-21** New tests live in `src/__tests__/` and are picked up by `vitest` without pulling in e2e specs (the arrangement fixed in commit 2661fc6). **[code]**

## Definition of done — Phase 5

- `npm run test:run` green with all suites P5-12 through P5-19 present.
- `npm run build` clean; no new lint errors.
- `.env.local.example` complete and verified against actual `process.env` usage.
- Rate limits documented in this file and enforced in code.
- Every screen in the feature has been opened with an empty dataset and with an error injected.
- Security requirements doc walked line by line against the implementation, with any deviation recorded.

---

# Cross-cutting edge cases

Each of these is called out in the plan and must have a passing check before the feature ships.

| Edge case | Expected behavior | Verify |
|---|---|---|
| Duplicate webhook delivery | No-op, `200` | P2-05 **[unit]** |
| Unknown reply token | `200`, dropped, logged, never bounced | P2-13 **[unit]** |
| Unknown inbound SMS number | Contact auto-created, phone only, `source:sms-inbound` | P2-18 **[unit]** |
| Inbound email with attachments | Indicator only, no bytes stored | P2-16 **[unit]**+**[ui]** |
| Legacy non-E.164 contact phone | Matched at inbound time via normalization | P1-13/P2-17 **[unit]** |
| Contact with email but no phone | SMS composer disabled with explanation | P3-14 **[ui]** |
| SMS-suppressed contact, 1:1 send | Blocked, no override | P1-28 **[unit]** |
| Email `unsubscribe`/`complaint`, 1:1 send | Allowed with warning | P1-29 **[unit]** |
| Email `bounce`, 1:1 send | **Blocked** — undeliverable is undeliverable | P1-30 **[unit]** |
| Email-suppressed contact, campaign | Blocked, counted | P1-29 **[unit]** |
| STOP swallowed by Advanced Opt-Out | Reconciled via error 21610 | P2-19b **[unit]** |
| Open/click events with no enum slot | `opened_at`/`clicked_at`, status unchanged | P2-08b **[unit]** |
| Campaign blast to a contact with a live thread | Thread not reordered, not unread-badged | P4-19b **[unit]** |
| Token-holder conversation, no messages yet | Hidden from inbox until a reply arrives | P3-04b **[unit]** |
| Prescanner GETs the unsubscribe link | Confirm page only, no suppression written | P4-26 **[curl]** |
| Processor runs under the env API key | Uses campaign's workspace, not fallback | P4-16c **[unit]** |
| Campaign re-sent by double-click | `409`, no duplicate rows | P4-13 **[unit]** |
| Processor killed mid-campaign | Resumes, no re-sends | P4-15 **[unit]** |
| Processor wedged on permanent failure | Stops at iteration cap, campaign `failed` | P4-14b **[unit]** |
| 61st 1:1 send in a minute | `429` + `Retry-After`, no send | P5-07 **[unit]** |
| Non-English quoted reply | Not stripped — documented v1 gap | P2-24b **[unit]** |
| `scheduled_at` set on a campaign | Column stores it; no scheduling behavior in v1 | **[code]** — confirm no cron/scheduler was added |

---
# Ambiguities

**Resolved 2026-08-05 — see `tasks/plan-email-sms-infrastructure.md` §Ambiguity resolutions.**

All seventeen open questions (A-1…A-17) raised against the plan were ruled on by the orchestrator and folded into the criteria above; nothing in this document is blocked on a pending decision. Where a criterion exists because of a ruling, it cites the ruling inline (for example P1-30 cites A-6, P4-16c cites A-5).

Two rulings changed behavior rather than merely clarifying it, and are the places to look first if implementation and criteria appear to disagree:

- **A-6** — `bounce` now hard-blocks 1:1 email, not just campaigns. Only `unsubscribe` and `complaint` remain warn-allow on the 1:1 path.
- **A-14** — campaign exclusions split into `suppressed_count` and `no_address_count`; no single combined "skipped" figure.

New questions arising during implementation belong in the plan's resolutions section, not here — this document tracks verifiable criteria only.
