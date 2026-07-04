-- Testimonials Migration
-- Personal testimonial request links + collected testimonials, tenant-scoped
-- like every other business table (workspace_id + organization_id).

-- Requests: one row per personal link sent to a client.
CREATE TABLE IF NOT EXISTS testimonial_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_company TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'archived')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonial_requests_workspace_id ON testimonial_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_organization_id ON testimonial_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_token ON testimonial_requests(token);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_contact_id ON testimonial_requests(contact_id);

-- Collected testimonials (guided 3-question flow).
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  request_id UUID REFERENCES testimonial_requests(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  problem TEXT NOT NULL,   -- Q1: What did we help you with?
  solution TEXT NOT NULL,  -- Q2: How was it working with us?
  result TEXT NOT NULL,    -- Q3: What would you tell someone considering us?
  permission BOOLEAN NOT NULL DEFAULT true,  -- OK to publish with name
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_workspace_id ON testimonials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_organization_id ON testimonials(organization_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_request_id ON testimonials(request_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_contact_id ON testimonials(contact_id);

-- Backfill organization_id from workspace on insert, same as other tables.
DROP TRIGGER IF EXISTS trg_testimonial_requests_set_org ON testimonial_requests;
CREATE TRIGGER trg_testimonial_requests_set_org BEFORE INSERT OR UPDATE ON testimonial_requests
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_testimonials_set_org ON testimonials;
CREATE TRIGGER trg_testimonials_set_org BEFORE INSERT OR UPDATE ON testimonials
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

-- Pre-staged org-membership policies, consistent with the rest of the schema
-- (RLS itself follows the global enablement rollout).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'testimonial_requests'
      AND policyname = 'org_member_all'
  ) THEN
    EXECUTE 'CREATE POLICY org_member_all ON testimonial_requests FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'testimonials'
      AND policyname = 'org_member_all'
  ) THEN
    EXECUTE 'CREATE POLICY org_member_all ON testimonials FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id))';
  END IF;
END $$;
