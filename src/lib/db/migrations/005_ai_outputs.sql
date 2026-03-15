-- AI outputs table for logging all AI-generated content
CREATE TYPE ai_output_status AS ENUM ('success', 'error');

CREATE TABLE ai_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  enrollment_id UUID,
  node_id VARCHAR,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  model VARCHAR NOT NULL,
  usage JSONB,
  status ai_output_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_outputs_workspace_id ON ai_outputs (workspace_id);
CREATE INDEX idx_ai_outputs_enrollment_id ON ai_outputs (enrollment_id);
CREATE INDEX idx_ai_outputs_node_id ON ai_outputs (node_id);
CREATE INDEX idx_ai_outputs_status ON ai_outputs (status);
