-- Pretty reply addresses: one stable, human-readable alias per workspace
-- (e.g. pentridge@contact.alignocrm.com) used as the Reply-To local part
-- instead of the raw r+<token> form. Inbound routes alias → workspace, then
-- sender email → contact, then the (workspace, contact) conversation.
-- Legacy r+<token> addresses keep routing via conversations.reply_token.

CREATE TABLE IF NOT EXISTS workspace_email_aliases (
  -- Local part of the reply address. Lowercase letters/digits/hyphens only;
  -- cannot start with a hyphen. Global uniqueness is the point of the PK.
  alias TEXT PRIMARY KEY CHECK (alias ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  workspace_id TEXT NOT NULL UNIQUE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_email_aliases_organization_id
  ON workspace_email_aliases(organization_id);

CREATE TRIGGER trg_workspace_email_aliases_set_org
  BEFORE INSERT ON workspace_email_aliases
  FOR EACH ROW EXECUTE FUNCTION set_org_from_workspace();
