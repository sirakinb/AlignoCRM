import { fetchJson } from "@/lib/api/fetch-json";
import type { Contact, Deal, Pipeline, Stage, Tag } from "@/types/crm";

export async function fetchPipelines(): Promise<Pipeline[]> {
  const payload = await fetchJson<{ pipelines: Pipeline[] }>("/api/pipelines");
  return payload.pipelines ?? [];
}

export async function fetchStages(pipelineId: string): Promise<Stage[]> {
  const payload = await fetchJson<{ stages: Stage[] }>(
    `/api/pipelines?pipelineId=${encodeURIComponent(pipelineId)}`
  );
  return payload.stages ?? [];
}

export async function fetchDeals(): Promise<Deal[]> {
  const payload = await fetchJson<{ deals: Deal[] }>("/api/deals");
  return payload.deals ?? [];
}

export async function fetchContacts(): Promise<Contact[]> {
  const payload = await fetchJson<{ contacts: Contact[] }>("/api/contacts");
  return payload.contacts ?? [];
}

export interface ContactsSummary {
  contacts: Contact[];
  tags: Tag[];
  contactTagsMap: Record<string, Tag[]>;
}

export async function fetchContactsSummary(): Promise<ContactsSummary> {
  const payload = await fetchJson<ContactsSummary>("/api/contacts/summary");
  return {
    contacts: payload.contacts ?? [],
    tags: payload.tags ?? [],
    contactTagsMap: payload.contactTagsMap ?? {},
  };
}

export async function fetchTags(): Promise<Tag[]> {
  const payload = await fetchJson<{ tags: Tag[] }>("/api/tags");
  return payload.tags ?? [];
}

export async function seedDefaultPipeline(): Promise<void> {
  await fetchJson("/api/pipelines/seed", { method: "POST" });
}

export async function moveDeal(dealId: string, stageId: string): Promise<void> {
  await fetchJson("/api/deals/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, stageId, userId: "user" }),
  });
}

export async function createDeal(input: {
  title: string;
  value: number;
  contact_id: string | null;
  pipeline_id: string;
  stage_id: string;
}): Promise<Deal> {
  const payload = await fetchJson<{ deal: Deal }>("/api/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return payload.deal;
}

export async function updateDeal(
  id: string,
  fields: {
    title?: string;
    value?: number;
    contact_id?: string | null;
    status?: string;
  }
): Promise<Deal> {
  const payload = await fetchJson<{ deal: Deal }>("/api/deals", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...fields }),
  });
  return payload.deal;
}

export async function deleteDeal(dealId: string): Promise<void> {
  await fetchJson(`/api/deals?id=${encodeURIComponent(dealId)}`, {
    method: "DELETE",
  });
}

export async function createPipeline(input: {
  name: string;
  stages: { name: string; color: string }[];
}): Promise<{ pipeline: Pipeline; stages: Stage[] }> {
  return fetchJson<{ pipeline: Pipeline; stages: Stage[] }>("/api/pipelines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      stages: input.stages,
    }),
  });
}
