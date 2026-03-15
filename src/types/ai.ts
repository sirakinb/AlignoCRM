// AI service types

export interface AiGenerateInput {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiGenerateOutput {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface AiProvider {
  generate(input: AiGenerateInput): Promise<AiGenerateOutput>;
}

// AI output log record
export interface AiOutput {
  id: string;
  workspace_id: string;
  enrollment_id: string | null;
  node_id: string | null;
  prompt: string;
  response: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
  status: "success" | "error";
  error_message: string | null;
  created_at: string;
}

export interface LogAiOutputInput {
  workspace_id: string;
  enrollment_id?: string | null;
  node_id?: string | null;
  prompt: string;
  response: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number } | null;
  status: "success" | "error";
  error_message?: string | null;
}

// Draft message executor types
export interface DraftMessageContext {
  contact_name?: string;
  contact_email?: string;
  company_name?: string;
  deal_name?: string;
  deal_value?: number;
  deal_stage?: string;
  sender_name?: string;
  sender_title?: string;
  [key: string]: unknown;
}

export interface DraftMessageResult {
  draftContent: string;
  requiresApproval: boolean;
  aiOutputId: string;
}
