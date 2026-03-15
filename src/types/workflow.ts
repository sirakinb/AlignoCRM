// Workflow enums

export enum WorkflowStatus {
  Draft = "draft",
  Published = "published",
  Archived = "archived",
}

export enum NodeType {
  Trigger = "trigger",
  SendEmail = "send_email",
  SendSms = "send_sms",
  AddTag = "add_tag",
  RemoveTag = "remove_tag",
  MoveDealStage = "move_deal_stage",
  CreateTask = "create_task",
  Webhook = "webhook",
  StopWorkflow = "stop_workflow",
  Wait = "wait",
  Condition = "condition",
  Approval = "approval",
  AiAnalyze = "ai_analyze",
  AiRoute = "ai_route",
  AiDraftMessage = "ai_draft_message",
}

// Node config types

export interface TriggerConfig {
  triggerType: string;
  filters?: Record<string, unknown>;
}

export interface SendEmailConfig {
  templateId?: string;
  to: string;
  subject: string;
  body: string;
}

export interface SendSmsConfig {
  to: string;
  message: string;
}

export interface AddTagConfig {
  tagId: string;
  tagName: string;
}

export interface RemoveTagConfig {
  tagId: string;
  tagName: string;
}

export interface MoveDealStageConfig {
  pipelineId: string;
  stageId: string;
}

export interface CreateTaskConfig {
  title: string;
  description?: string;
  assigneeId?: string;
  dueInDays?: number;
}

export interface WebhookConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface StopWorkflowConfig {
  reason?: string;
}

export interface WaitConfig {
  duration: number;
  unit: "minutes" | "hours" | "days";
}

export interface ConditionRule {
  field: string;
  operator: string;
  value: unknown;
}

export interface ConditionConfig {
  conditionName: string;
  logicOperator: "AND" | "OR";
  rules: ConditionRule[];
}

export interface ApprovalConfig {
  description: string;
  assigneeId?: string;
}

export interface AiAnalyzeConfig {
  promptTemplate: string;
  contextFields: string[];
  outputField: string;
}

export interface AiRouteConfig {
  promptTemplate: string;
  contextFields: string[];
  routes: Array<{ label: string; description: string }>;
}

export interface AiDraftMessageConfig {
  promptTemplate: string;
  contextFields: string[];
  outputFormat: "email" | "sms" | "note";
  requireApproval: boolean;
}

// Union of all node config types
export type NodeConfig =
  | TriggerConfig
  | SendEmailConfig
  | SendSmsConfig
  | AddTagConfig
  | RemoveTagConfig
  | MoveDealStageConfig
  | CreateTaskConfig
  | WebhookConfig
  | StopWorkflowConfig
  | WaitConfig
  | ConditionConfig
  | ApprovalConfig
  | AiAnalyzeConfig
  | AiRouteConfig
  | AiDraftMessageConfig;

// Core interfaces

export interface Workflow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger_type: string | null;
  trigger_config: Record<string, unknown>;
  allow_re_enrollment: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  definition: WorkflowDefinition;
  published_at: string;
  published_by: string;
}

export interface WorkflowNode<T extends NodeConfig = NodeConfig> {
  id: string;
  workflow_id: string;
  type: NodeType;
  position_x: number;
  position_y: number;
  config: T;
  created_at: string;
  updated_at: string;
}

export interface WorkflowEdge {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  label: string | null;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// Input types for creating/updating

export interface CreateWorkflowInput {
  workspace_id: string;
  name: string;
  description?: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  allow_re_enrollment?: boolean;
  created_by: string;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  allow_re_enrollment?: boolean;
}
