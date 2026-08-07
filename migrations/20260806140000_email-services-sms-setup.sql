-- GoHighLevel-style email services + SMS setup.
-- Milestone 1: workspace-scoped Gmail/Outlook OAuth connections.
-- Phone numbers and SMS compliance tables are pre-staged for Milestones 2-3.
-- Tenant-scoped like every other business table: workspace_id TEXT, nullable
-- organization_id backfilled by set_org_from_workspace().

-- ── workspace_email_connections ──────────────────────────────────────────────
-- OAuth-connected email accounts (Gmail, Outlook/Office365) and optional SMTP.
CREATE TABLE IF NOT EXISTS workspace_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'smtp')),
  email TEXT NOT NULL,
  display_name TEXT,
  signature TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  sync_history_id TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_workspace_email_connections_workspace_id
  ON workspace_email_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_email_connections_organization_id
  ON workspace_email_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_email_connections_status
  ON workspace_email_connections(workspace_id, status);
-- Default lookup for the send path.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_email_connections_default
  ON workspace_email_connections(workspace_id) WHERE is_default = true;

-- ── workspace_phone_numbers ──────────────────────────────────────────────────
-- Twilio-provisioned phone numbers used as SMS senders.
CREATE TABLE IF NOT EXISTS workspace_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  number_type TEXT NOT NULL CHECK (number_type IN ('local', 'tollfree', 'mobile')),
  twilio_sid TEXT NOT NULL,
  twilio_friendly_name TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_phone_numbers_workspace_id
  ON workspace_phone_numbers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_phone_numbers_organization_id
  ON workspace_phone_numbers(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_phone_numbers_default
  ON workspace_phone_numbers(workspace_id) WHERE is_default = true;

-- ── workspace_sms_profiles ───────────────────────────────────────────────────
-- A2P 10DLC brand + campaign registration status and TrustHub SIDs.
CREATE TABLE IF NOT EXISTS workspace_sms_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL UNIQUE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  business_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_profile_sid TEXT,
  trust_product_sid TEXT,
  brand_sid TEXT,
  campaign_sid TEXT,
  brand_status TEXT CHECK (brand_status IN ('draft', 'pending', 'approved', 'rejected')),
  campaign_status TEXT CHECK (campaign_status IN ('draft', 'pending', 'approved', 'rejected')),
  status_callback_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_sms_profiles_workspace_id
  ON workspace_sms_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_sms_profiles_organization_id
  ON workspace_sms_profiles(organization_id);

-- ── workspace_tollfree_verifications ─────────────────────────────────────────
-- Toll-free verification submissions and Twilio TFV status.
CREATE TABLE IF NOT EXISTS workspace_tollfree_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number_id UUID NOT NULL REFERENCES workspace_phone_numbers(id) ON DELETE CASCADE,
  tfv_sid TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_REVIEW', 'TWILIO_APPROVED', 'TWILIO_REJECTED')),
  business_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejection_reasons JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_tollfree_verifications_workspace_id
  ON workspace_tollfree_verifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tollfree_verifications_organization_id
  ON workspace_tollfree_verifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tollfree_verifications_phone_number_id
  ON workspace_tollfree_verifications(phone_number_id);

-- ── messages.provider check constraint ───────────────────────────────────────
-- Outbound emails can now be sent via connected Gmail or Outlook accounts.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_provider_check;
ALTER TABLE messages ADD CONSTRAINT messages_provider_check
  CHECK (provider IN ('resend', 'twilio', 'google', 'microsoft'));

-- ── organization_id backfill triggers ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_workspace_email_connections_set_org ON workspace_email_connections;
CREATE TRIGGER trg_workspace_email_connections_set_org
  BEFORE INSERT OR UPDATE ON workspace_email_connections
  FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_workspace_phone_numbers_set_org ON workspace_phone_numbers;
CREATE TRIGGER trg_workspace_phone_numbers_set_org
  BEFORE INSERT OR UPDATE ON workspace_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_workspace_sms_profiles_set_org ON workspace_sms_profiles;
CREATE TRIGGER trg_workspace_sms_profiles_set_org
  BEFORE INSERT OR UPDATE ON workspace_sms_profiles
  FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_workspace_tollfree_verifications_set_org ON workspace_tollfree_verifications;
CREATE TRIGGER trg_workspace_tollfree_verifications_set_org
  BEFORE INSERT OR UPDATE ON workspace_tollfree_verifications
  FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

-- ── org-membership policies ──────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspace_email_connections',
    'workspace_phone_numbers',
    'workspace_sms_profiles',
    'workspace_tollfree_verifications'
  ]
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

-- ── Self-contained RLS enablement ────────────────────────────────────────────
-- REVOKE removes default grants so the published anon key has no read path even
-- if RLS is off. ENABLE RLS is the second layer. Internal-only tables get no
-- app-role policy, so RLS + no policy = deny to anon/authenticated.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspace_email_connections',
    'workspace_phone_numbers',
    'workspace_sms_profiles',
    'workspace_tollfree_verifications'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
