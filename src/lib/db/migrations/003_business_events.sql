-- Business Events table for tracking CRM events
CREATE TABLE business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  event_type VARCHAR NOT NULL,
  record_id UUID NOT NULL,
  record_type VARCHAR NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  idempotency_key VARCHAR UNIQUE NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_events_workspace_id ON business_events (workspace_id);
CREATE INDEX idx_business_events_event_type ON business_events (event_type);
CREATE INDEX idx_business_events_idempotency_key ON business_events (idempotency_key);
CREATE INDEX idx_business_events_processed ON business_events (processed);
