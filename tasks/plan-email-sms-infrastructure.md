# Email & SMS Infrastructure — Implementation Plan (v2, refined)

**Status:** Approved direction (interview 2026-08-05). Standalone messaging system — does NOT touch the workflow engine, the Trigger.dev task tree, or the Automations UI.

**Companion docs:**
- `tasks/acceptance-criteria-email-sms.md` — acceptance criteria (owned by acceptance agent)
- `tasks/security-requirements-email-sms.md` — security requirements (owned by security agent, governs all implementation)

## Decisions (locked)

| Decision | Choice |
|---|---|
| Email transport | Resend platform sends (v1). User-connected mailboxes deferred. |
| SMS transport | Twilio, **toll-free number first** (fast verification); local 10DLC later if wanted. |
| Direction | **Two-way from day one** — inbound email + SMS land as conversations. |
| Product shape | GoHighLevel-style: **Email section + SMS section + unified Conversations inbox**. |
| Bulk | **Campaigns/blasts included in this phase** (audience picker, per-recipient status, opt-out enforcement). |
| Tenancy | Build for Aki's workspace first, but every table keyed by `workspace_id` (TEXT — live DB convention) with a per-workspace channel config table so multi-tenant provisioning later is additive. |
| Email inbound mechanics | Send from `send.alignocrm.com`, Reply-To per-conversation token `r+<token>@reply.alignocrm.com`, Resend Inbound webhook routes replies to the conversation. |
| Notifications | In-app unread badges only. |
| Workflow engine | Untouched. `message_logs` stays as-is for the workflow path; new system gets its own tables. |

## External setup (user tasks — do these first, approval time is the long pole)

### Twilio (new account — can be created via AgentMail address; payment + identity verification requires Aki)
1. Create account at twilio.com, upgrade out of trial (trial can only text verified numbers).
2. Buy a **toll-free number** (~$2/mo).
3. Submit **toll-free verification**: business name/address/website, use-case description ("CRM customer conversations and appointment/marketing messages to opted-in contacts"), sample messages, opt-in method description. Approval typically 1–5 business days.
4. Create a **Messaging Service**, add the number to its sender pool, enable **Advanced Opt-Out** (auto STOP/HELP handling).
5. Collect: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`.

### Resend (existing account)
1. Verify domain `send.alignocrm.com` (SPF + DKIM records).
2. Set up **Resend Inbound** on `reply.alignocrm.com` (MX record) and an inbound webhook endpoint.
3. Create a delivery-events webhook (sent/delivered/bounced/complained/opened/clicked); collect the signing secret.
4. DNS note: alignocrm.com nameservers are on **Vercel** — all records via `npx vercel dns` (see `docs/email-dns-setup.md`).

### New env vars
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
RESEND_WEBHOOK_SECRET=
RESEND_INBOUND_WEBHOOK_SECRET=
MESSAGING_EMAIL_DOMAIN=send.alignocrm.com
MESSAGING_REPLY_DOMAIN=reply.alignocrm.com
UNSUBSCRIBE_SECRET=            # 32+ bytes random; HMAC for unsubscribe tokens
```

**New dependencies:** `twilio` (official SDK), `svix` (Resend webhook signature verification), `sanitize-html` (string-based server-side sanitizer — no jsdom needed), `libphonenumber-js` (E.164).
Also: add the already-required `RESEND_API_KEY` to `.env.local.example` (currently missing).

## Data model

New migration under `src/lib/db/migrations/` (verify live schema first — `workspace_id` is TEXT everywhere, no `workspaces` FK; see the correction note in `migrations/20260704073712_fix-testimonials-workspace-id.sql`).

### `workspace_channels`
Per-workspace channel config. `id UUID PK`, `workspace_id TEXT NOT NULL`, `organization_id UUID`, `channel TEXT CHECK (channel IN ('email','sms'))`, `config JSONB NOT NULL DEFAULT '{}'` (email: `from_name`, `from_local_part`; sms: `phone_number`, `messaging_service_sid`), `status TEXT DEFAULT 'active'`, timestamps. `UNIQUE (workspace_id, channel)`.

### `conversations`
One per (workspace, contact). `id UUID PK`, `workspace_id TEXT NOT NULL`, `organization_id UUID`, `contact_id UUID NOT NULL`, `reply_token TEXT UNIQUE NOT NULL` (crypto-random, ≥128-bit, for email reply routing), `subject TEXT` (latest email subject), `last_message_at TIMESTAMPTZ`, `last_message_preview TEXT`, `last_message_channel TEXT`, `last_message_direction TEXT`, `unread_count INT DEFAULT 0`, `status TEXT DEFAULT 'open'`, timestamps. `UNIQUE (workspace_id, contact_id)`; index on `(workspace_id, last_message_at DESC)`.

### `messages`
Unified log for both channels/directions. `id UUID PK`, `workspace_id TEXT NOT NULL`, `organization_id UUID`, `conversation_id UUID` (**nullable — NULL for campaign sends**), `contact_id UUID NOT NULL`, `channel TEXT`, `direction TEXT CHECK (direction IN ('inbound','outbound'))`, `status TEXT CHECK (status IN ('queued','sent','delivered','failed','bounced','received'))`, `subject TEXT`, `body_text TEXT`, `body_html TEXT` (sanitized before storage for inbound), `from_address TEXT`, `to_address TEXT`, `provider TEXT`, `provider_id TEXT` (Resend email id / Twilio Message SID / inbound Message-ID), `provider_response JSONB`, `error TEXT`, `campaign_id UUID`, `email_message_id TEXT` (RFC 5322 Message-ID for threading), `sent_at`, `delivered_at`, `created_at`. Indexes: `(conversation_id, created_at)`, `(workspace_id, created_at DESC)`, `(campaign_id)`, unique partial on `(provider, provider_id)` for webhook idempotency.

### `campaigns`
`id`, `workspace_id`, `organization_id`, `channel`, `name`, `subject`, `body`, `template_id UUID` (FK `message_templates`), `audience JSONB` (`{tagIds: [], statuses: [], all: bool}`), `status TEXT CHECK (status IN ('draft','sending','sent','failed'))`, `scheduled_at TIMESTAMPTZ` (column now, scheduling UI deferred), `total_count INT`, `sent_count INT`, `delivered_count INT`, `failed_count INT`, `suppressed_count INT`, timestamps.

### `suppressions`
`id`, `workspace_id`, `channel`, `address TEXT` (lowercased email or E.164 phone), `reason TEXT CHECK (reason IN ('unsubscribe','stop','bounce','complaint','manual'))`, `source_message_id UUID`, `created_at`. `UNIQUE (workspace_id, channel, address)`.

### Reused
- **`message_templates`** — orphaned CRUD in `src/lib/data/templates.ts` finally gets UI + API.
- **`message_logs`** — untouched, remains the workflow engine's log.

## Transport layer (`src/lib/messaging/`)

- **`sms-service.ts`** — `TwilioSmsProvider` mirroring the swappable-provider pattern of `email-service.ts` (`setSmsProvider()` for tests). Sends via Messaging Service SID with `statusCallback` set to our webhook.
- **`phone.ts`** — E.164 normalization (default +1 US), applied at send time and in inbound matching. Also normalize on contact create/update.
- **`send-message.ts`** — single entry `sendConversationMessage()`: resolve channel config → suppression check → find/create conversation → insert `messages` row (`queued`) → provider send → update status/provider_id → bump conversation (`last_message_*`, preview). Outbound email sets:
  - `From: "{from_name}" <{from_local_part}@send.alignocrm.com>`
  - `Reply-To: r+{reply_token}@reply.alignocrm.com`
  - `In-Reply-To` / `References` from the last inbound `email_message_id` so recipients' clients thread correctly.
- **Suppression semantics:** SMS — STOP suppresses everything (1:1 and bulk), no override. Email — `unsubscribe`/`complaint` hard-block campaigns but 1:1 conversation sends show a warning and are allowed (unsubscribe is from marketing, not conversation); **`bounce` hard-blocks everywhere** (undeliverable is undeliverable — repeat sends damage domain reputation).
- **Cleanup while here:** remove personal-address fallbacks (`aki.b@pentridgemedia.com`) → resolution order `workspace_channels.config` → `EMAIL_FROM` → hard error.

## Webhooks (new API routes — all signature-verified, all idempotent by provider event/message id)

| Route | Source | Behavior |
|---|---|---|
| `POST /api/webhooks/resend` | Resend delivery events (Svix signature) | Update message status via `provider_id`; `bounced`/`complained` → suppression row + campaign counter |
| `POST /api/webhooks/resend/inbound` | Resend Inbound (Svix signature) | Parse `r+<token>` recipient → conversation; unknown/invalid token → 200 + drop (log). Strip quoted history for `body_text`, sanitize HTML server-side before storing `body_html`, store `email_message_id`, increment `unread_count` |
| `POST /api/webhooks/twilio/inbound` | Twilio incoming SMS (X-Twilio-Signature) | Normalize `From` → match contact by phone; no match → auto-create contact (phone only, tag `source:sms-inbound`). Find/create conversation, store message, bump unread. STOP/UNSTOP keywords → suppression add/remove (carrier-level blocking already handled by Advanced Opt-Out) |
| `POST /api/webhooks/twilio/status` | Twilio status callbacks (X-Twilio-Signature) | Update message status (`sent`→`delivered`/`failed`) |

Local dev: webhooks need a public URL — ngrok/cloudflared tunnel, or test against a deployed preview.

## App API surface

| Route | Methods | Purpose |
|---|---|---|
| `/api/conversations` | GET | List threads: filters `channel`, `unread`, `q`; sorted by `last_message_at` |
| `/api/conversations/unread-count` | GET | Nav badge (count of conversations with unread > 0) |
| `/api/conversations/[id]` | GET | Thread + paginated messages |
| `/api/conversations/[id]/read` | POST | Zero `unread_count` |
| `/api/conversations/[id]/messages` | POST | Send within thread (`channel`, `subject?`, `body`) |
| `/api/messages/send` | POST | Compose-new (`contact_id`, `channel`, …) → find/create conversation |
| `/api/templates`, `/api/templates/[id]` | GET/POST/PATCH/DELETE | Wire orphaned `src/lib/data/templates.ts` |
| `/api/campaigns`, `/api/campaigns/[id]` | GET/POST/PATCH/DELETE | Campaign CRUD (draft editing) |
| `/api/campaigns/[id]/send` | POST | Materialize recipients → kick processor |
| `/api/campaigns/[id]/process` | POST | Chunk processor (internal-auth key), safe to re-invoke |
| `/api/campaigns/[id]/recipients` | GET | Per-recipient status table |
| `/api/messaging/settings` | GET/PUT | `workspace_channels` config |
| `/api/suppressions` | GET/POST/DELETE | Opt-out list management |
| `/api/unsubscribe/[token]` | GET/POST | Public unsubscribe. **GET renders a confirm page only** (mail scanners prefetch GETs — must not unsubscribe); **POST executes** (both the RFC 8058 `List-Unsubscribe=One-Click` header target and the confirm-page button). HMAC-signed per-recipient token (`UNSUBSCRIBE_SECRET`), no expiry |

All dashboard routes go through `requireTenantContext()` and filter by `tenant.workspaceId` (same pattern as existing routes).

## Bulk send engine (no Trigger.dev — standalone per decision)

1. `POST /api/campaigns/[id]/send` resolves the audience (tags/status/all), dedupes, drops suppressed + missing-address contacts (counted as `suppressed_count`), and inserts one `queued` `messages` row per recipient (batched inserts). Sets campaign `sending`.
2. Processor endpoint claims chunks of queued rows (Resend batch API ≤100/call; Twilio via Messaging Service which handles its own queuing/rate), interpolates merge tags per recipient via existing `interpolation.ts` (HTML-escaped), updates rows as it goes, self-re-invokes until drained, then marks campaign `sent`. Crash-safe: re-invoking resumes from remaining `queued` rows.
3. Bulk email compliance: `List-Unsubscribe` + `List-Unsubscribe-Post` headers and footer link → `/api/unsubscribe/[token]` (signed per-recipient token) → suppression row. 1:1 conversation emails skip the footer.
4. Campaign messages never appear in conversation timelines (`conversation_id` stays NULL on campaign message rows) — but replies to them DO land in Conversations. Mechanism: campaign send **finds-or-creates the contact's conversation row as a token holder only** (no message write, no `last_message_*` bump, no unread change); the Conversations inbox only lists conversations with `last_message_at IS NOT NULL`, so token-holder rows stay invisible until a real message (e.g. a reply to the blast) arrives.
5. If volumes outgrow route-based processing, this slots into a Trigger.dev task later without schema changes.

## UI

Sidebar gains **Conversations** (unread badge, polled), **Email**, **SMS** — `src/components/layout/sidebar.tsx`.

### Conversations — `src/app/(dashboard)/conversations/page.tsx`
Split pane. Left: thread list (contact name/avatar, channel icon(s), preview, relative time, unread dot; filter tabs All / Email / SMS / Unread; search). Right: thread view — mixed email/SMS timeline (bubbles styled per channel; email bubbles show subject + expandable sanitized HTML body), composer with channel toggle (per contact's available email/phone; disabled state explains why), subject field appears in email mode. Opening a thread marks it read.

### Email — `src/app/(dashboard)/email/page.tsx`
Tabs: **Campaigns** (list w/ status + counters → detail w/ per-recipient table; "New campaign" composer: name, audience picker (tags/status/all + live recipient-count preview), template picker, subject/body with merge-tag dropdown reused from workflow forms, test-send-to-self, then Send) · **Templates** (CRUD on `message_templates`, channel-filtered) · **Settings** (sender identity from `workspace_channels`, domain status).

### SMS — `src/app/(dashboard)/sms/page.tsx`
Same tab structure: Campaigns · Templates · Settings (shows toll-free number + verification status) · **Opt-outs** (suppression list, manual add/remove).

### Contact drawer
"Message" action → opens that contact's conversation (deep link `/conversations?contact=<id>`).

Components live in `src/components/messaging/` (`conversation-list.tsx`, `thread-view.tsx`, `message-bubble.tsx`, `composer.tsx`, `campaign-composer.tsx`, `audience-picker.tsx`, `recipient-table.tsx`, `template-editor.tsx`, …). Match existing app conventions (Tailwind 4, lucide-react, existing drawer/panel patterns).

## Edge cases & explicit behaviors

- **Webhook idempotency:** unique `(provider, provider_id)`; duplicate deliveries no-op.
- **Email threading:** store inbound `Message-ID`; set `In-Reply-To`/`References` on replies.
- **Quoted-reply stripping:** heuristic strip (`On … wrote:`, `>` blocks, common delimiters) into `body_text`; full sanitized original retained in `body_html` behind "Show full message".
- **Unknown inbound SMS sender:** auto-create contact (phone only, `source:sms-inbound` tag).
- **Unknown/invalid reply token:** acknowledged (200) and dropped with a log line — never bounce, never guess.
- **Attachments:** deferred. Inbound email with attachments shows a "has attachments" indicator only. No MMS.
- **Scheduling:** `scheduled_at` column exists; v1 UI is send-now only (scheduling needs a cron — later).
- **Phone storage:** normalize to E.164 on contact write going forward; normalize at match time for legacy rows.

## Security requirements (governed by `tasks/security-requirements-email-sms.md`)

Non-negotiables baked into the design: signature verification on all four webhooks (Svix for Resend, `X-Twilio-Signature` with exact-URL reconstruction for Twilio); tenant scoping on every route; server-side sanitization of inbound HTML before storage AND sanitized rendering (no raw `dangerouslySetInnerHTML` of foreign HTML); HTML-escaping of all merge-tag interpolation into email HTML (fixing the class of bug that exists in `invites/route.ts`); high-entropy unguessable reply tokens; signed unsubscribe tokens; Twilio/Resend secrets server-only; rate limiting on send endpoints; suppression enforcement as a compliance control. The security agent may extend this list; its doc wins conflicts.

## Build phases

1. **Foundation** — migration, seed `workspace_channels` for the default workspace, `phone.ts`, `sms-service.ts`, `send-message.ts`, sender-fallback cleanup. *(User files Twilio verification + DNS in parallel.)*
2. **Two-way plumbing** — four webhook routes, reply-token routing, quoted-reply stripping, sanitization, suppression writes, idempotency.
3. **Conversations UI** — inbox, thread view, 1:1 send both channels, unread badges, contact-drawer entry.
4. **Email & SMS sections** — templates UI/API, campaign composer, bulk processor, per-recipient status, unsubscribe/opt-out enforcement, opt-out list UI.
5. **Polish & hardening** — settings pages, `.env.local.example` update, rate limiting, empty/error states, tests (webhook signature + idempotency, suppression logic, E.164, token routing).

## Ambiguity resolutions (2026-08-05, responding to acceptance agent A-1…A-17)

- **A-1 (migration home):** New migration goes in root `migrations/` with timestamp naming — that's the directory the live DB actually applies (the two testimonial migrations there are the most recent applied). Verify live schema via insforge-cli before writing DDL. The numbered `src/lib/db/migrations/` set is historical record only.
- **A-2/A-3 (campaigns vs conversations):** `messages.conversation_id` is nullable; campaign message rows always NULL. Campaign sends find-or-create the contact's conversation as a **token holder only**; inbox filters to `last_message_at IS NOT NULL`. (Plan body updated.)
- **A-4 (unsubscribe):** GET = confirm page only; POST = executes (RFC 8058 one-click + confirm button). `UNSUBSCRIBE_SECRET` env var added; tokens don't expire.
- **A-5 (processor auth/self-invocation):** Reuse the existing `ALIGNO_API_KEY` internal-auth pattern (same as `emitter.ts` → `/api/events/process`). Self-re-invoke via fetch to own absolute URL with the key; hard iteration cap = `ceil(total/chunk_size) + 5`; each invocation also stops at ~250s to stay under the 300s function limit.
- **A-6 (bounce on 1:1):** Changed — `bounce` hard-blocks 1:1 email too. Only `unsubscribe`/`complaint` are warn-allow on 1:1. (Plan body updated.)
- **A-7 (Advanced Opt-Out swallowing STOP):** Belt and suspenders: handle STOP in the inbound webhook AND reconcile via Twilio status-callback error `21610` (attempt to blocked number → write suppression). Verify actual webhook behavior with the live number during Phase 2.
- **A-8 (missing statuses):** No enum growth. `opened_at`/`clicked_at` TIMESTAMPTZ columns added to `messages`; `complained` → suppression row + `provider_response`, status remains `delivered`.
- **A-9 (quote-strip delimiters):** Explicit v1 list: `^On .* wrote:$`, `-----Original Message-----`, `From:`/`Sent:` header blocks, leading-`>` line runs, `________________` separators. English-only v1; mis-strips recoverable via "Show full message" (full sanitized HTML always retained).
- **A-10 (search scope):** `?q=` searches contact name, email, phone, and `last_message_preview` only. No body full-text in v1.
- **A-11 (organization_id):** Nullable, populated via the existing conditional-spread idiom + migration-009 triggers. **`workspace_id` alone is the tenancy boundary for queries** — same as every existing route.
- **A-12 (audience combination):** `all: true` is exclusive (UI radio). Within `tagIds`: union (any tag). `tagIds` × `statuses`: intersection (must match both dimensions).
- **A-13 (rate limits):** 60 outbound 1:1 messages/min/workspace on `/api/messages/send` + `/api/conversations/[id]/messages`. Backing store: count of `messages` rows created in the trailing 60s per workspace (one indexed query, serverless-safe, no new infra).
- **A-14 (suppressed_count):** Split into `suppressed_count` and `no_address_count`. Campaign UI shows both.
- **A-15 (unread on outbound):** Outbound sends leave `unread_count` untouched. Confirmed.
- **A-16 (workspace_channels seed):** Not a migration. `GET /api/messaging/settings` idempotently creates the default row on first read. Portable across environments.
- **A-17 (dependencies):** `twilio`, `svix`, `sanitize-html`, `libphonenumber-js`. (Plan body updated.)

## Out of scope (explicitly)

Workflow-engine consolidation, `send_sms` workflow node, AI nodes, Automations un-hiding, user-connected mailboxes (Gmail/Outlook), browser push, per-workspace number provisioning UI, local 10DLC registration, MMS/attachments, campaign scheduling UI, open/click analytics dashboards (statuses are recorded; UI later).
