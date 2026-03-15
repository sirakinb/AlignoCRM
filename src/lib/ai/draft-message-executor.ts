import { AiDraftMessageConfig } from "@/types/workflow";
import {
  DraftMessageContext,
  DraftMessageResult,
  AiGenerateOutput,
} from "@/types/ai";
import { generateAiContent } from "./ai-service";
import { logAiOutput } from "./ai-logger";
import { interpolateTemplate } from "@/lib/messaging/interpolation";

interface ExecuteDraftMessageInput {
  config: AiDraftMessageConfig;
  context: DraftMessageContext;
  workspaceId: string;
  enrollmentId?: string;
  nodeId?: string;
}

export async function executeDraftMessage(
  input: ExecuteDraftMessageInput
): Promise<DraftMessageResult> {
  const { config, context, workspaceId, enrollmentId, nodeId } = input;

  // Build the context subset from contextFields
  const filteredContext: Record<string, unknown> = {};
  for (const field of config.contextFields) {
    if (field in context) {
      filteredContext[field] = context[field];
    }
  }

  // Interpolate the prompt template with context
  const { text: interpolatedPrompt } = interpolateTemplate(config.promptTemplate, context);

  // Build the full prompt with context data
  const fullPrompt = `${interpolatedPrompt}\n\nContext:\n${JSON.stringify(filteredContext, null, 2)}`;

  const systemPrompt = `You are a CRM assistant. Generate a professional ${config.outputFormat} message based on the prompt and context provided.`;

  let aiOutput: AiGenerateOutput;
  let logRecord;

  try {
    aiOutput = await generateAiContent({
      prompt: fullPrompt,
      systemPrompt,
      maxTokens: 1024,
      temperature: 0.7,
    });

    logRecord = await logAiOutput({
      workspace_id: workspaceId,
      enrollment_id: enrollmentId ?? null,
      node_id: nodeId ?? null,
      prompt: fullPrompt,
      response: aiOutput.content,
      model: aiOutput.model,
      usage: aiOutput.usage ?? null,
      status: "success",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logRecord = await logAiOutput({
      workspace_id: workspaceId,
      enrollment_id: enrollmentId ?? null,
      node_id: nodeId ?? null,
      prompt: fullPrompt,
      response: "",
      model: "unknown",
      usage: null,
      status: "error",
      error_message: errorMessage,
    });

    throw error;
  }

  return {
    draftContent: aiOutput.content,
    requiresApproval: config.requireApproval,
    aiOutputId: logRecord.id,
  };
}
