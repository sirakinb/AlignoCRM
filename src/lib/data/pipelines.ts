import { insforge } from "@/lib/insforge/client";
import { getPurpleScaleColor } from "@/lib/design/aligno-theme";
import type {
  Pipeline,
  Stage,
  CreatePipelineInput,
  CreateStageInput,
} from "@/types/crm";

function normalizeStage(stage: Stage): Stage {
  return {
    ...stage,
    color: getPurpleScaleColor(stage.position),
  };
}

export async function getPipelines(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("pipelines")
    .select()
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data as Pipeline[];
}

export async function getPipeline(id: string) {
  const { data, error } = await insforge.database
    .from("pipelines")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Pipeline;
}

export async function createPipeline(input: CreatePipelineInput) {
  const { data, error } = await insforge.database
    .from("pipelines")
    .insert({ id: crypto.randomUUID(), ...input })
    .select()
    .single();

  if (error) throw error;
  return data as Pipeline;
}

export async function getStage(id: string) {
  const { data, error } = await insforge.database
    .from("stages")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return normalizeStage(data as Stage);
}

export async function getStages(pipelineId: string) {
  const { data, error } = await insforge.database
    .from("stages")
    .select()
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data as Stage[]).map(normalizeStage);
}

export async function createStage(input: CreateStageInput) {
  const normalizedColor = getPurpleScaleColor(input.position ?? 0);
  const { data, error } = await insforge.database
    .from("stages")
    .insert({ id: crypto.randomUUID(), ...input, color: normalizedColor })
    .select()
    .single();

  if (error) throw error;
  return normalizeStage(data as Stage);
}
