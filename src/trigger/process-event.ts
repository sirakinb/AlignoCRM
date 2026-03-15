import { task } from "@trigger.dev/sdk";
import { insforge } from "@/lib/insforge/client";
import { matchEventToWorkflows } from "@/lib/workflows/trigger-matcher";
import { markEventProcessed } from "@/lib/events/emitter";
import type { BusinessEvent } from "@/types/events";
import type { WorkflowVersion } from "@/types/workflow";
import { enrollAndRunTask } from "./enroll-and-run";

export const processEventTask = task({
  id: "process-event",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: { eventId: string; workspaceId: string }) => {
    const { data: eventData, error } = await insforge.database
      .from("business_events")
      .select()
      .eq("id", payload.eventId)
      .single();

    if (error || !eventData) {
      return { status: "failed", reason: "event_not_found" };
    }

    const event = eventData as BusinessEvent;
    const workflows = await matchEventToWorkflows(event);

    const triggered: string[] = [];

    for (const workflow of workflows) {
      const { data: version, error: vError } = await insforge.database
        .from("workflow_versions")
        .select()
        .eq("workflow_id", workflow.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      if (vError || !version) continue;
      const wfVersion = version as WorkflowVersion;

      await enrollAndRunTask.trigger({
        workflowId: workflow.id,
        workflowVersionId: wfVersion.id,
        recordId: event.record_id,
        recordType: event.record_type,
        workspaceId: event.workspace_id,
      });

      triggered.push(workflow.id);
    }

    await markEventProcessed(payload.eventId);

    return { status: "processed", workflowsTriggered: triggered.length };
  },
});
