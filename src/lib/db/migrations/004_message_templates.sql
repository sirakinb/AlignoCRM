-- Message templates and message logs for email campaigns

-- Channel type enum
CREATE TYPE message_channel AS ENUM ('email', 'sms');

-- Message delivery status enum
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'bounced');

-- Message templates table
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  subject VARCHAR,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  channel message_channel NOT NULL DEFAULT 'email',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_templates_workspace_id ON message_templates (workspace_id);
CREATE INDEX idx_message_templates_channel ON message_templates (channel);

-- Message logs table
CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL,
  channel message_channel NOT NULL,
  to_address VARCHAR NOT NULL,
  subject VARCHAR,
  body TEXT NOT NULL,
  status message_status NOT NULL DEFAULT 'pending',
  provider_id VARCHAR,
  provider_response JSONB,
  enrollment_id UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_logs_workspace_id ON message_logs (workspace_id);
CREATE INDEX idx_message_logs_contact_id ON message_logs (contact_id);
CREATE INDEX idx_message_logs_template_id ON message_logs (template_id);
CREATE INDEX idx_message_logs_status ON message_logs (status);
CREATE INDEX idx_message_logs_enrollment_id ON message_logs (enrollment_id);
