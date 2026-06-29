export const swrKeys = {
  pipelines: "/api/pipelines",
  stages: (pipelineId: string) =>
    `/api/pipelines?pipelineId=${encodeURIComponent(pipelineId)}`,
  deals: "/api/deals",
  contacts: "/api/contacts",
  contactsSummary: "/api/contacts/summary",
  tags: "/api/tags",
} as const;
