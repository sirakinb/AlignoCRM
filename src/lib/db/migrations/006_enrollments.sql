-- Enrollment schema migration
-- Creates tables for workflow enrollment and execution tracking

-- Enums
CREATE TYPE enrollment_status AS ENUM ('active', 'paused', 'completed', 'failed', 'canceled');
CREATE TYPE step_outcome AS ENUM ('completed', 'failed', 'skipped', 'waiting', 'canceled');

-- Workflow enrollments table
CREATE TABLE workflow_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  current_node_id VARCHAR(255),
  status enrollment_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Execution steps table
CREATE TABLE execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES workflow_enrollments(id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  node_type VARCHAR(100) NOT NULL,
  outcome step_outcome NOT NULL DEFAULT 'waiting',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  provider_response JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_enrollments_workspace_id ON workflow_enrollments(workspace_id);
CREATE INDEX idx_enrollments_workflow_id ON workflow_enrollments(workflow_id);
CREATE INDEX idx_enrollments_status ON workflow_enrollments(status);
CREATE INDEX idx_enrollments_record_id ON workflow_enrollments(record_id);
CREATE INDEX idx_enrollments_workflow_version ON workflow_enrollments(workflow_version_id);
CREATE INDEX idx_execution_steps_enrollment_id ON execution_steps(enrollment_id);

-- Apply updated_at trigger
CREATE TRIGGER set_enrollments_updated_at
  BEFORE UPDATE ON workflow_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
