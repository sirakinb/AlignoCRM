import { task } from "@trigger.dev/sdk";
import { createTask } from "@/lib/data/tasks";
import type { CreateTaskConfig } from "@/types/workflow";

export const executeCreateTask = task({
  id: "execute-create-task",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    workspaceId: string;
    recordId: string;
    nodeConfig: CreateTaskConfig;
  }) => {
    const { workspaceId, recordId, nodeConfig } = payload;

    let dueDate: string | undefined;
    if (nodeConfig.dueInDays) {
      const date = new Date();
      date.setDate(date.getDate() + nodeConfig.dueInDays);
      dueDate = date.toISOString();
    }

    const crmTask = await createTask({
      workspace_id: workspaceId,
      title: nodeConfig.title,
      description: nodeConfig.description,
      assignee_id: nodeConfig.assigneeId,
      contact_id: recordId,
      due_date: dueDate,
    });

    return {
      action: "create_task",
      taskId: crmTask.id,
      title: crmTask.title,
      dueDate: crmTask.due_date,
    };
  },
});
