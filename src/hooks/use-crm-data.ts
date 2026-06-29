"use client";

import useSWR, { mutate as globalMutate, type MutatorCallback } from "swr";
import {
  fetchContacts,
  fetchContactsSummary,
  fetchDeals,
  fetchPipelines,
  fetchStages,
  fetchTags,
  type ContactsSummary,
} from "@/lib/api/crm";
import { swrKeys } from "@/lib/api/swr-keys";
import type { Deal } from "@/types/crm";

const defaultOptions = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
};

export function usePipelines() {
  return useSWR(swrKeys.pipelines, fetchPipelines, defaultOptions);
}

export function useStages(pipelineId: string | null | undefined) {
  return useSWR(
    pipelineId ? swrKeys.stages(pipelineId) : null,
    () => fetchStages(pipelineId!),
    defaultOptions
  );
}

export function useDeals() {
  return useSWR(swrKeys.deals, fetchDeals, defaultOptions);
}

export function useContacts() {
  return useSWR(swrKeys.contacts, fetchContacts, defaultOptions);
}

export function useContactsSummary() {
  return useSWR(swrKeys.contactsSummary, fetchContactsSummary, defaultOptions);
}

export function useTags() {
  return useSWR(swrKeys.tags, fetchTags, defaultOptions);
}

export function invalidateCrmCache() {
  return Promise.all([
    globalMutate(swrKeys.pipelines),
    globalMutate(swrKeys.deals),
    globalMutate(swrKeys.contacts),
    globalMutate(swrKeys.contactsSummary),
    globalMutate(swrKeys.tags),
  ]);
}

export function mutateDeals(updater?: MutatorCallback<Deal[]>) {
  return globalMutate(swrKeys.deals, updater);
}

export function mutateContactsSummary(
  updater?: MutatorCallback<ContactsSummary>
) {
  return globalMutate(swrKeys.contactsSummary, updater);
}

export function useAllStages(pipelines: { id: string }[]) {
  const pipelineIds = pipelines.map((p) => p.id).join(",");

  return useSWR(
    pipelineIds ? `stages-all:${pipelineIds}` : null,
    async () => {
      const all = await Promise.all(
        pipelines.map((pipeline) => fetchStages(pipeline.id))
      );
      return all.flat();
    },
    defaultOptions
  );
}
