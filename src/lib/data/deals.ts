import { insforge } from "@/lib/insforge/client";
import type { Deal, CreateDealInput, UpdateDealInput } from "@/types/crm";
import { createActivityLog } from "./activity-logs";
import { getStage } from "./pipelines";
import { emitEvent } from "@/lib/events/emitter";
import { BusinessEventType } from "@/types/events";

export async function getDeals(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("deals")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Deal[];
}

export async function getDeal(id: string) {
  const { data, error } = await insforge.database
    .from("deals")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function createDeal(input: CreateDealInput) {
  const { data, error } = await insforge.database
    .from("deals")
    .insert({ id: crypto.randomUUID(), name: input.title, ...input })
    .select()
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function updateDeal(id: string, input: UpdateDealInput) {
  const { data, error } = await insforge.database
    .from("deals")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Deal;
}

export async function deleteDeal(id: string) {
  const { error } = await insforge.database
    .from("deals")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function moveDealStage(
  dealId: string,
  stageId: string,
  actorId?: string
) {
  const [deal, stage] = await Promise.all([getDeal(dealId), getStage(stageId)]);

  // Derive deal status from stage name
  const stageLower = stage.name.toLowerCase();
  let status: "open" | "won" | "lost" = "open";
  if (stageLower.includes("won") || stageLower.includes("closed won")) {
    status = "won";
  } else if (stageLower.includes("lost") || stageLower.includes("closed lost")) {
    status = "lost";
  }

  const { data, error } = await insforge.database
    .from("deals")
    .update({ stage_id: stageId, status, updated_at: new Date().toISOString() })
    .eq("id", dealId)
    .select()
    .single();

  if (error) throw error;

  await createActivityLog({
    workspace_id: deal.workspace_id,
    entity_type: "deal",
    entity_id: dealId,
    action: "stage_changed",
    metadata: {
      from_stage_id: deal.stage_id,
      to_stage_id: stageId,
    },
    actor_id: actorId ?? null,
  });

  const updatedDeal = data as Deal;

  await emitEvent({
    workspace_id: deal.workspace_id,
    event_type: BusinessEventType.DealStageChanged,
    record_id: dealId,
    record_type: "deal",
    payload: {
      dealId,
      previousStageId: deal.stage_id,
      newStageId: stageId,
      pipelineId: deal.pipeline_id,
    },
  });

  return updatedDeal;
}
