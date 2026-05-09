import { insforge } from "@/lib/insforge/client";
import type { App, CreateAppInput, UpdateAppInput } from "@/types/crm";

function isTableMissing(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return (
    err?.code === "42P01" ||
    /relation .* does not exist/i.test(err?.message ?? "")
  );
}

export async function getApps(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("apps")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isTableMissing(error)) return [] as App[];
    throw error;
  }
  return data as App[];
}

export async function getApp(id: string) {
  const { data, error } = await insforge.database
    .from("apps")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as App;
}

export async function createApp(input: CreateAppInput) {
  const { data, error } = await insforge.database
    .from("apps")
    .insert({ id: crypto.randomUUID(), ...input })
    .select()
    .single();

  if (error) throw error;
  return data as App;
}

export async function updateApp(id: string, input: UpdateAppInput) {
  const { data, error } = await insforge.database
    .from("apps")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as App;
}

export async function deleteApp(id: string) {
  const { error } = await insforge.database
    .from("apps")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
