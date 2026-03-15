import { task } from "@trigger.dev/sdk";
import { enrollRecord } from "@/lib/workflows/trigger-matcher";
import { advanceWorkflowTask } from "./advance-workflow";

export const enrollAndRunTask = task({
  id: "enroll-and-run",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    workflowId: string;
    workflowVersionId: string;
    recordId: string;
    recordType: string;
    workspaceId: string;
  }) => {
    const enrollment = await enrollRecord(
      payload.workflowId,
      payload.workflowVersionId,
      payload.recordId,
      payload.recordType,
      payload.workspaceId
    );

    if (!enrollment) {
      return { status: "skipped", reason: "already_enrolled" };
    }

    await advanceWorkflowTask.trigger(
      { enrollmentId: enrollment.id },
      {
        queue: `contact-${payload.recordId}`,
      }
    );

    return { status: "triggered", enrollmentId: enrollment.id };
  },
});
