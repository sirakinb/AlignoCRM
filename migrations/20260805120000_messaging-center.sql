-- Messaging Center — email + SMS, two-way, campaigns.
-- Standalone from the workflow engine (message_logs stays with workflows).
-- Tenant-scoped like every other business table: workspace_id TEXT (no
-- workspaces FK — the live schema relaxed 001's UUID+FK design), plus a
-- nullable organization_id backfilled by the shared set_org_from_workspace()
-- trigger. See migrations/20260704073712_fix-testimonials-workspace-id.sql.

-- ── conversations ───────────────────────────────────────────────────────────
-- One thread per (workspace, contact). Mixes email + SMS in one timeline.
-- reply_token routes inbound email replies back to the right conversation.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reply_token TEXT NOT NULL UNIQUE,
  subject TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_channel TEXT CHECK (last_message_channel IN ('email', 'sms')),
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  unread_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_organization_id ON conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_reply_token ON conversations(reply_token);
-- Inbox ordering; also the "token-holder rows stay hidden" filter (last_message_at IS NOT NULL).
CREATE INDEX IF NOT EXISTS idx_conversations_ws_last_msg ON conversations(workspace_id, last_message_at DESC);

-- ── campaigns ───────────────────────────────────────────────────────────────
-- Bulk email/SMS blasts. suppressed_count and no_address_count are split
-- (opted-out vs. no-address-on-file are operationally different — A-14).
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {tagIds:[], statuses:[], all:bool}
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,                     -- column now; scheduling UI later
  total_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  suppressed_count INT NOT NULL DEFAULT 0,      -- recipients skipped: opted out
  no_address_count INT NOT NULL DEFAULT 0,      -- recipients skipped: no email/phone
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_id ON campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(workspace_id, status);

-- ── messages ────────────────────────────────────────────────────────────────
-- Unified log for both channels + both directions. conversation_id is NULLABLE:
-- campaign sends leave it NULL (marketing rows never appear in a thread).
-- (provider, provider_id) is unique for webhook idempotency.
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced', 'received')),
  subject TEXT,
  body_text TEXT,
  body_html TEXT,                 -- sanitized before storage for inbound
  from_address TEXT,
  to_address TEXT,
  provider TEXT CHECK (provider IN ('resend', 'twilio')),
  provider_id TEXT,               -- Resend email id / Twilio Message SID / inbound Message-ID
  provider_response JSONB,
  error TEXT,
  email_message_id TEXT,          -- RFC 5322 Message-ID for threading
  -- REQ-SEC-07: for INBOUND email, true iff the From address matched the
  -- conversation's contact (the reply token only routes, it does not authenticate).
  -- Outbound rows never set this, so the default MUST be true — an outbound
  -- message is authored by the workspace and is not "unverified". Inbound writes
  -- it explicitly (webhook-store.insertInboundMessage), so the default only ever
  -- governs outbound/other rows.
  sender_verified BOOLEAN NOT NULL DEFAULT true,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,          -- Resend "opened" (A-8: recorded, UI later)
  clicked_at TIMESTAMPTZ,         -- Resend "clicked"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_id ON messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_organization_id ON messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_ws_created ON messages(workspace_id, created_at DESC);
-- Webhook idempotency, scoped PER WORKSPACE. Must NOT be global on
-- (provider, provider_id): for inbound email provider_id is the sender-supplied
-- RFC 5322 Message-ID, so a global unique index lets one tenant pick a
-- Message-ID that then blocks a different tenant's legitimate inbound (a
-- cross-tenant denial primitive). Event-level replay dedup lives in
-- messaging_webhook_events below.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_ws_provider_id
  ON messages(workspace_id, provider, provider_id) WHERE provider_id IS NOT NULL;
-- Rate-limit query support: count of outbound rows per workspace in a window.
CREATE INDEX IF NOT EXISTS idx_messages_ws_dir_created
  ON messages(workspace_id, direction, created_at);
-- Campaign bulk-send chunk claim (Phase 4 Gate-4 #4/#2). A dedicated claim
-- marker, NOT provider_id (overloading provider_id was fragile and coupled the
-- claim to the webhook-idempotency index). claimed_at lets the processor
-- self-heal: a chunk whose claimer crashed mid-send is reclaimed once its claim
-- goes stale (~10 min), so rows never wedge as claimed-but-unsent forever.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS claim_token TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_messages_campaign_claim
  ON messages(campaign_id, status, claim_token);
-- Backstop against a concurrent double-materialize (Phase 4 Gate/QA HIGH #1):
-- even if two /send calls both reach the insert, a contact can be materialized
-- at most once per campaign. Partial so it never touches 1:1 conversation rows
-- (campaign_id NULL).
-- ⚠️ PRE-APPLY REHEARSAL: build will fail if a campaign already holds duplicate
-- (campaign_id, contact_id) rows; dedupe first on live data.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_campaign_contact
  ON messages(campaign_id, contact_id) WHERE campaign_id IS NOT NULL;

-- ── suppressions ────────────────────────────────────────────────────────────
-- Opt-out / bounce / complaint list. Enforced in the transport layer on every
-- send. Address is normalized (email lowercased, phone E.164).
CREATE TABLE IF NOT EXISTS suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  address TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'stop', 'bounce', 'complaint', 'manual')),
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, address)
);

CREATE INDEX IF NOT EXISTS idx_suppressions_workspace_id ON suppressions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suppressions_organization_id ON suppressions(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppressions_lookup ON suppressions(workspace_id, channel, address);

-- ── workspace_channels ──────────────────────────────────────────────────────
-- Per-workspace channel config (sender identity, Twilio number/service).
-- Makes per-workspace provisioning additive later. Seeded lazily by
-- GET /api/messaging/settings, not by this migration (portable across envs).
CREATE TABLE IF NOT EXISTS workspace_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_workspace_channels_workspace_id ON workspace_channels(workspace_id);

-- ── messaging_webhook_events ────────────────────────────────────────────────
-- Event-level idempotency + replay defense (REQ-SEC-04). uq_messages_ws_provider_id
-- dedupes MESSAGES, not EVENTS: a replayed Twilio status callback (its signature
-- carries no timestamp, so replay is unbounded) reuses a message but is a new
-- event. Record each processed provider event id here and reject repeats.
CREATE TABLE IF NOT EXISTS messaging_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('resend', 'twilio')),
  event_id TEXT NOT NULL,         -- provider event id / Svix msg id / Twilio callback signature digest
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- ── messaging_rate_counters ─────────────────────────────────────────────────
-- DB-backed fixed-window rate limiting (serverless-safe; in-memory counters
-- reset per lambda instance). See REQ-SEC-17.
CREATE TABLE IF NOT EXISTS messaging_rate_counters (
  bucket_key TEXT NOT NULL,       -- e.g. 'send:ws_abc' | 'unsub:1.2.3.4'
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- ── contacts dedup guard for concurrent inbound-SMS auto-create (finding #14) ──
-- Two concurrent first-inbound messages from the same unknown number both see
-- "no match" and both try to create a contact. createInboundSmsContact()'s
-- insert-conflict re-select is the PRIMARY guard, but it only works if a unique
-- constraint actually rejects the second insert — hence this partial index.
-- Because inbound auto-created rows are written in E.164, the raw-phone index
-- dedupes them (both writes use the identical string).
--
-- ⚠️ PRE-APPLY REHEARSAL REQUIRED. `contacts` is a LIVE table that may already
-- hold duplicate (workspace_id, phone) rows and many NULL phones. This index is
-- partial (WHERE phone IS NOT NULL) to ignore the NULLs, but it will FAIL to
-- build if existing duplicates remain. Before applying to production: rehearse on
-- a branch, run a dedupe pass on existing (workspace_id, phone) duplicates, THEN
-- create the index. Do NOT assume this applies cleanly to live.
-- DEFERRED at go-live 2026-08-05: prod `contacts` has 4 duplicate
-- (workspace_id, phone) groups, so this index can't build yet.
-- CAVEAT: the re-select guard in webhook-store.createInboundSmsContact is NOT an
-- independent replacement for this index — it only fires on the unique violation
-- this index would raise. Until the index exists, a concurrent first-inbound SMS
-- from the same new number can create duplicate contacts (data-integrity risk,
-- no security/authz impact). Follow-up: dedupe the 4 groups, then create the
-- index (this is a destructive contact merge — get explicit sign-off first):
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_ws_phone
--     ON contacts(workspace_id, phone) WHERE phone IS NOT NULL;

-- ── organization_id backfill triggers (same pattern as every other table) ────
DROP TRIGGER IF EXISTS trg_conversations_set_org ON conversations;
CREATE TRIGGER trg_conversations_set_org BEFORE INSERT OR UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_campaigns_set_org ON campaigns;
CREATE TRIGGER trg_campaigns_set_org BEFORE INSERT OR UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_messages_set_org ON messages;
CREATE TRIGGER trg_messages_set_org BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_suppressions_set_org ON suppressions;
CREATE TRIGGER trg_suppressions_set_org BEFORE INSERT OR UPDATE ON suppressions
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_workspace_channels_set_org ON workspace_channels;
CREATE TRIGGER trg_workspace_channels_set_org BEFORE INSERT OR UPDATE ON workspace_channels
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

-- ── pre-staged org-membership policies (RLS enablement follows the global
--    rollout handled by the security-remediation track — NOT enabled here) ────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations','campaigns','messages','suppressions','workspace_channels']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'org_member_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY org_member_all ON %I FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ── Self-contained RLS enablement (finding #1) ───────────────────────────────
-- Do NOT rely on 010_enable_rls.sql running before or after this migration.
-- REVOKE is the load-bearing control and does not depend on the admin role's
-- BYPASSRLS status: with default grants removed, the published anon key has no
-- read path even if RLS were somehow off. ENABLE RLS is the second layer. The
-- two internal tables (webhook_events, rate_counters) get no app-role policy at
-- all, so RLS + no policy = deny to anon/authenticated; only the server's
-- privileged client (which bypasses RLS) touches them.
-- PREMISE CONFIRMED 2026-08-05 (RLS branch, finding #9): project_admin has
-- rolbypassrls=true AND owns these tables, so server writes stay alive under
-- ENABLE/FORCE RLS. This REVOKE+ENABLE block, however, was NOT itself exercised
-- against real data on that branch (the branch predated this migration). Before
-- this migration is applied to production, rehearse it on a branch:
-- `insforge branch reset`, apply 012_enable_rls.sql + this file, then probe the
-- six tables with the real anon_ key expecting 42501, and confirm server routes
-- still read/write. Do NOT apply to prod unrehearsed.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conversations','campaigns','messages','suppressions',
    'workspace_channels','messaging_webhook_events','messaging_rate_counters'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
