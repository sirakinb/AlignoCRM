import { task } from "@trigger.dev/sdk";
import { moveDealStage } from "@/lib/data/deals";
import { insforge } from "@/lib/insforge/client";
import type { MoveDealStageConfig } from "@/types/workflow";

export const executeMoveDealStage = task({
  id: "execute-move-deal-stage",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    workspaceId: string;
    recordId: string;
    nodeConfig: MoveDealStageConfig;
  }) => {
    const { workspaceId, recordId, nodeConfig } = payload;

    // Find the deal associated with this contact
    const { data: deals, error } = await insforge.database
      .from("deals")
      .select()
      .eq("contact_id", recordId)
      .eq("pipeline_id", nodeConfig.pipelineId)
      .limit(1);

    if (error) throw error;

    if (!deals || deals.length === 0) {
      return {
        action: "move_deal_stage",
        skipped: true,
        reason: "no_deal_found",
        contactId: recordId,
      };
    }

    const deal = deals[0];
    const updatedDeal = await moveDealStage(deal.id, nodeConfig.stageId);

    return {
      action: "move_deal_stage",
      dealId: updatedDeal.id,
      previousStageId: deal.stage_id,
      newStageId: nodeConfig.stageId,
    };
  },
});
