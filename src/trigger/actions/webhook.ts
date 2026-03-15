import { task, retry } from "@trigger.dev/sdk";
import type { WebhookConfig } from "@/types/workflow";

export const executeWebhook = task({
  id: "execute-webhook",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: {
    workspaceId: string;
    recordId: string;
    enrollmentId: string;
    nodeConfig: WebhookConfig;
  }) => {
    const { nodeConfig, recordId, enrollmentId } = payload;

    const result = await retry.onThrow(
      async () => {
        const response = await fetch(nodeConfig.url, {
          method: nodeConfig.method,
          headers: {
            "Content-Type": "application/json",
            ...nodeConfig.headers,
          },
          body: nodeConfig.method !== "GET"
            ? JSON.stringify({
                ...nodeConfig.body,
                _meta: { recordId, enrollmentId },
              })
            : undefined,
        });

        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Webhook returned ${response.status}`);
        }

        const responseBody = await response.text();

        return {
          action: "webhook",
          url: nodeConfig.url,
          method: nodeConfig.method,
          status: response.status,
          responseBody: responseBody.slice(0, 1000),
          success: response.ok,
        };
      },
      { maxAttempts: 3 }
    );

    return result;
  },
});
