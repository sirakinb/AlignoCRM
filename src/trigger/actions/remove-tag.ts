import { task } from "@trigger.dev/sdk";
import { removeTagFromContact } from "@/lib/data/tags";
import type { RemoveTagConfig } from "@/types/workflow";

export const executeRemoveTag = task({
  id: "execute-remove-tag",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    workspaceId: string;
    recordId: string;
    nodeConfig: RemoveTagConfig;
  }) => {
    const { recordId, nodeConfig } = payload;

    await removeTagFromContact(recordId, nodeConfig.tagId);

    return {
      action: "remove_tag",
      contactId: recordId,
      tagId: nodeConfig.tagId,
      tagName: nodeConfig.tagName,
    };
  },
});
