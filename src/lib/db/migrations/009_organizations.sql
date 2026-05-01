-- Organization tenancy for AlignoCRM.
-- Every business record gets an organization_id and is backfilled into the
-- existing default tenant before RLS can be enabled.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  default_workspace_id TEXT NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  invited_by UUID,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID NOT NULL,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_organization_invites_org_id ON organization_invites(organization_id);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE contact_tags ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE workflow_edges ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE workflow_versions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE workflow_enrollments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE execution_steps ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE business_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE ai_outputs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE approval_actions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id ON workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_deals_organization_id ON deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_organization_id ON contact_tags(organization_id);
CREATE INDEX IF NOT EXISTS idx_tags_organization_id ON tags(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_organization_id ON activity_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_organization_id ON pipelines(organization_id);
CREATE INDEX IF NOT EXISTS idx_stages_organization_id ON stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_organization_id ON workflow_nodes(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_organization_id ON workflow_edges(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_organization_id ON workflow_versions(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_enrollments_organization_id ON workflow_enrollments(organization_id);
CREATE INDEX IF NOT EXISTS idx_execution_steps_organization_id ON execution_steps(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_events_organization_id ON business_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_organization_id ON message_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_organization_id ON message_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_organization_id ON ai_outputs(organization_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_organization_id ON approval_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_approval_actions_organization_id ON approval_actions(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id ON api_keys(organization_id);

WITH owner_user AS (
  SELECT user_id
  FROM api_keys
  WHERE revoked_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
),
default_org AS (
  INSERT INTO organizations (name, default_workspace_id, created_by)
  SELECT 'AlignoCRM Workspace', 'default', owner_user.user_id
  FROM owner_user
  WHERE NOT EXISTS (
    SELECT 1 FROM organizations WHERE default_workspace_id = 'default'
  )
  RETURNING id, created_by
),
resolved_org AS (
  SELECT id, created_by FROM default_org
  UNION ALL
  SELECT id, created_by FROM organizations WHERE default_workspace_id = 'default'
  LIMIT 1
)
INSERT INTO organization_members (organization_id, user_id, email, role, status)
SELECT resolved_org.id, resolved_org.created_by, 'owner@alignocrm.local', 'owner', 'active'
FROM resolved_org
WHERE resolved_org.created_by IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

UPDATE workspaces SET organization_id = org.id
FROM organizations org
WHERE workspaces.organization_id IS NULL AND workspaces.id::text = org.default_workspace_id;

UPDATE contacts SET organization_id = org.id
FROM organizations org
WHERE contacts.organization_id IS NULL AND contacts.workspace_id = org.default_workspace_id;

UPDATE deals SET organization_id = org.id
FROM organizations org
WHERE deals.organization_id IS NULL AND deals.workspace_id = org.default_workspace_id;

UPDATE tasks SET organization_id = org.id
FROM organizations org
WHERE tasks.organization_id IS NULL AND tasks.workspace_id = org.default_workspace_id;

UPDATE tags SET organization_id = org.id
FROM organizations org
WHERE tags.organization_id IS NULL AND tags.workspace_id = org.default_workspace_id;

UPDATE activity_logs SET organization_id = org.id
FROM organizations org
WHERE activity_logs.organization_id IS NULL AND activity_logs.workspace_id = org.default_workspace_id;

UPDATE pipelines SET organization_id = org.id
FROM organizations org
WHERE pipelines.organization_id IS NULL AND pipelines.workspace_id = org.default_workspace_id;

UPDATE workflows SET organization_id = org.id
FROM organizations org
WHERE workflows.organization_id IS NULL AND workflows.workspace_id = org.default_workspace_id;

UPDATE workflow_enrollments SET organization_id = org.id
FROM organizations org
WHERE workflow_enrollments.organization_id IS NULL AND workflow_enrollments.workspace_id = org.default_workspace_id;

UPDATE business_events SET organization_id = org.id
FROM organizations org
WHERE business_events.organization_id IS NULL AND business_events.workspace_id = org.default_workspace_id;

UPDATE message_templates SET organization_id = org.id
FROM organizations org
WHERE message_templates.organization_id IS NULL AND message_templates.workspace_id = org.default_workspace_id;

UPDATE message_logs SET organization_id = org.id
FROM organizations org
WHERE message_logs.organization_id IS NULL AND message_logs.workspace_id = org.default_workspace_id;

UPDATE ai_outputs SET organization_id = org.id
FROM organizations org
WHERE ai_outputs.organization_id IS NULL AND ai_outputs.workspace_id = org.default_workspace_id;

UPDATE approval_requests SET organization_id = org.id
FROM organizations org
WHERE approval_requests.organization_id IS NULL AND approval_requests.workspace_id = org.default_workspace_id;

UPDATE api_keys SET organization_id = org.id
FROM organizations org
WHERE api_keys.organization_id IS NULL AND org.default_workspace_id = 'default';

UPDATE stages SET organization_id = pipelines.organization_id
FROM pipelines
WHERE stages.organization_id IS NULL AND stages.pipeline_id = pipelines.id;

UPDATE contact_tags SET organization_id = contacts.organization_id
FROM contacts
WHERE contact_tags.organization_id IS NULL AND contact_tags.contact_id = contacts.id;

UPDATE workflow_nodes SET organization_id = workflows.organization_id
FROM workflows
WHERE workflow_nodes.organization_id IS NULL AND workflow_nodes.workflow_id = workflows.id;

UPDATE workflow_edges SET organization_id = workflows.organization_id
FROM workflows
WHERE workflow_edges.organization_id IS NULL AND workflow_edges.workflow_id = workflows.id;

UPDATE workflow_versions SET organization_id = workflows.organization_id
FROM workflows
WHERE workflow_versions.organization_id IS NULL AND workflow_versions.workflow_id = workflows.id;

UPDATE execution_steps SET organization_id = workflow_enrollments.organization_id
FROM workflow_enrollments
WHERE execution_steps.organization_id IS NULL AND execution_steps.enrollment_id = workflow_enrollments.id;

UPDATE approval_actions SET organization_id = approval_requests.organization_id
FROM approval_requests
WHERE approval_actions.organization_id IS NULL AND approval_actions.request_id = approval_requests.id;

CREATE OR REPLACE FUNCTION set_org_from_workspace()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT id INTO NEW.organization_id
    FROM organizations
    WHERE default_workspace_id = NEW.workspace_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_stage_org_from_pipeline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM pipelines
    WHERE id = NEW.pipeline_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_contact_tag_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM contacts
    WHERE id = NEW.contact_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_workflow_child_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM workflows
    WHERE id = NEW.workflow_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_execution_step_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM workflow_enrollments
    WHERE id = NEW.enrollment_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_approval_action_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM approval_requests
    WHERE id = NEW.request_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_set_org ON contacts;
CREATE TRIGGER trg_contacts_set_org BEFORE INSERT OR UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_deals_set_org ON deals;
CREATE TRIGGER trg_deals_set_org BEFORE INSERT OR UPDATE ON deals
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_tasks_set_org ON tasks;
CREATE TRIGGER trg_tasks_set_org BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_tags_set_org ON tags;
CREATE TRIGGER trg_tags_set_org BEFORE INSERT OR UPDATE ON tags
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_activity_logs_set_org ON activity_logs;
CREATE TRIGGER trg_activity_logs_set_org BEFORE INSERT OR UPDATE ON activity_logs
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_pipelines_set_org ON pipelines;
CREATE TRIGGER trg_pipelines_set_org BEFORE INSERT OR UPDATE ON pipelines
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_workflows_set_org ON workflows;
CREATE TRIGGER trg_workflows_set_org BEFORE INSERT OR UPDATE ON workflows
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_workflow_enrollments_set_org ON workflow_enrollments;
CREATE TRIGGER trg_workflow_enrollments_set_org BEFORE INSERT OR UPDATE ON workflow_enrollments
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_business_events_set_org ON business_events;
CREATE TRIGGER trg_business_events_set_org BEFORE INSERT OR UPDATE ON business_events
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_message_templates_set_org ON message_templates;
CREATE TRIGGER trg_message_templates_set_org BEFORE INSERT OR UPDATE ON message_templates
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_message_logs_set_org ON message_logs;
CREATE TRIGGER trg_message_logs_set_org BEFORE INSERT OR UPDATE ON message_logs
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_ai_outputs_set_org ON ai_outputs;
CREATE TRIGGER trg_ai_outputs_set_org BEFORE INSERT OR UPDATE ON ai_outputs
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_approval_requests_set_org ON approval_requests;
CREATE TRIGGER trg_approval_requests_set_org BEFORE INSERT OR UPDATE ON approval_requests
FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();

DROP TRIGGER IF EXISTS trg_stages_set_org ON stages;
CREATE TRIGGER trg_stages_set_org BEFORE INSERT OR UPDATE ON stages
FOR EACH ROW EXECUTE FUNCTION set_stage_org_from_pipeline();

DROP TRIGGER IF EXISTS trg_contact_tags_set_org ON contact_tags;
CREATE TRIGGER trg_contact_tags_set_org BEFORE INSERT OR UPDATE ON contact_tags
FOR EACH ROW EXECUTE FUNCTION set_contact_tag_org();

DROP TRIGGER IF EXISTS trg_workflow_nodes_set_org ON workflow_nodes;
CREATE TRIGGER trg_workflow_nodes_set_org BEFORE INSERT OR UPDATE ON workflow_nodes
FOR EACH ROW EXECUTE FUNCTION set_workflow_child_org();

DROP TRIGGER IF EXISTS trg_workflow_edges_set_org ON workflow_edges;
CREATE TRIGGER trg_workflow_edges_set_org BEFORE INSERT OR UPDATE ON workflow_edges
FOR EACH ROW EXECUTE FUNCTION set_workflow_child_org();

DROP TRIGGER IF EXISTS trg_workflow_versions_set_org ON workflow_versions;
CREATE TRIGGER trg_workflow_versions_set_org BEFORE INSERT OR UPDATE ON workflow_versions
FOR EACH ROW EXECUTE FUNCTION set_workflow_child_org();

DROP TRIGGER IF EXISTS trg_execution_steps_set_org ON execution_steps;
CREATE TRIGGER trg_execution_steps_set_org BEFORE INSERT OR UPDATE ON execution_steps
FOR EACH ROW EXECUTE FUNCTION set_execution_step_org();

DROP TRIGGER IF EXISTS trg_approval_actions_set_org ON approval_actions;
CREATE TRIGGER trg_approval_actions_set_org BEFORE INSERT OR UPDATE ON approval_actions
FOR EACH ROW EXECUTE FUNCTION set_approval_action_org();

CREATE OR REPLACE FUNCTION is_org_member(target_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_org_admin(target_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable these policies after app routes use the user's edge token for all DB
-- access. Until then, the app-level tenant resolver prevents client-driven
-- cross-org queries without breaking existing server routes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'org_member_select_organizations'
  ) THEN
    CREATE POLICY org_member_select_organizations
    ON organizations FOR SELECT
    USING (is_org_member(id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'org_admin_update_organizations'
  ) THEN
    CREATE POLICY org_admin_update_organizations
    ON organizations FOR UPDATE
    USING (is_org_admin(id))
    WITH CHECK (is_org_admin(id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
      AND policyname = 'org_member_select_members'
  ) THEN
    CREATE POLICY org_member_select_members
    ON organization_members FOR SELECT
    USING (is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
      AND policyname = 'org_admin_manage_members'
  ) THEN
    CREATE POLICY org_admin_manage_members
    ON organization_members FOR ALL
    USING (is_org_admin(organization_id))
    WITH CHECK (is_org_admin(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_invites'
      AND policyname = 'org_member_select_invites'
  ) THEN
    CREATE POLICY org_member_select_invites
    ON organization_invites FOR SELECT
    USING (is_org_member(organization_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_invites'
      AND policyname = 'org_admin_manage_invites'
  ) THEN
    CREATE POLICY org_admin_manage_invites
    ON organization_invites FOR ALL
    USING (is_org_admin(organization_id))
    WITH CHECK (is_org_admin(organization_id));
  END IF;
END $$;

DO $$
DECLARE
  tenant_table TEXT;
  tenant_tables TEXT[] := ARRAY[
    'workspaces',
    'contacts',
    'deals',
    'tasks',
    'contact_tags',
    'tags',
    'activity_logs',
    'pipelines',
    'stages',
    'workflows',
    'workflow_nodes',
    'workflow_edges',
    'workflow_versions',
    'workflow_enrollments',
    'execution_steps',
    'business_events',
    'message_templates',
    'message_logs',
    'ai_outputs',
    'approval_requests',
    'approval_actions',
    'api_keys'
  ];
BEGIN
  FOREACH tenant_table IN ARRAY tenant_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tenant_table
        AND policyname = 'org_member_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY org_member_all ON %I FOR ALL USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id))',
        tenant_table
      );
    END IF;
  END LOOP;
END $$;
