-- Approval requests and actions for AI review system
-- Creates tables for managing AI-generated content approval workflow

-- Enums
CREATE TYPE approval_content_type AS ENUM ('email_draft', 'sms_draft', 'ai_analysis', 'ai_route');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'edited');
CREATE TYPE approval_action_type AS ENUM ('approved', 'rejected', 'edited');

-- Approval requests table
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  enrollment_id UUID REFERENCES workflow_enrollments(id) ON DELETE SET NULL,
  node_id VARCHAR(255),
  content_type approval_content_type NOT NULL,
  content JSONB NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  status approval_status NOT NULL DEFAULT 'pending',
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval actions table
CREATE TABLE approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  action approval_action_type NOT NULL,
  edited_content JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_approval_requests_workspace_id ON approval_requests(workspace_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_enrollment_id ON approval_requests(enrollment_id);
CREATE INDEX idx_approval_requests_assigned_to ON approval_requests(assigned_to);
CREATE INDEX idx_approval_actions_request_id ON approval_actions(request_id);

-- Apply updated_at trigger
CREATE TRIGGER set_approval_requests_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
