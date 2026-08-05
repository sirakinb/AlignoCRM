import { insforge } from "@/lib/insforge/server";
import { AiOutput, LogAiOutputInput } from "@/types/ai";

export async function logAiOutput(input: LogAiOutputInput): Promise<AiOutput> {
  const { data, error } = await insforge.database
    .from("ai_outputs")
    .insert({
      workspace_id: input.workspace_id,
      enrollment_id: input.enrollment_id ?? null,
      node_id: input.node_id ?? null,
      prompt: input.prompt,
      response: input.response,
      model: input.model,
      usage: input.usage ?? null,
      status: input.status,
      error_message: input.error_message ?? null,
    })
    .single();

  if (error) {
    throw error;
  }

  return data as AiOutput;
}
