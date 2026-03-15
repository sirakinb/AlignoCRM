import { task } from "@trigger.dev/sdk";
import { addTagToContact } from "@/lib/data/tags";
import type { AddTagConfig } from "@/types/workflow";

export const executeAddTag = task({
  id: "execute-add-tag",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    workspaceId: string;
    recordId: string;
    nodeConfig: AddTagConfig;
  }) => {
    const { workspaceId, recordId, nodeConfig } = payload;

    // Don't pass workspaceId to avoid emitting TagAdded event (prevents re-triggering workflows)
    await addTagToContact(recordId, nodeConfig.tagId);

    return {
      action: "add_tag",
      contactId: recordId,
      tagId: nodeConfig.tagId,
      tagName: nodeConfig.tagName,
    };
  },
});
