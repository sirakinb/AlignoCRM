import { insforge } from "@/lib/insforge/client";
import type {
  MessageTemplate,
  CreateTemplateInput,
  UpdateTemplateInput,
} from "@/types/messaging";

export async function getTemplates(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("message_templates")
    .select()
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as MessageTemplate[];
}

export async function getTemplate(id: string) {
  const { data, error } = await insforge.database
    .from("message_templates")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as MessageTemplate;
}

export async function createTemplate(input: CreateTemplateInput) {
  const { data, error } = await insforge.database
    .from("message_templates")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as MessageTemplate;
}

export async function updateTemplate(id: string, input: UpdateTemplateInput) {
  const { data, error } = await insforge.database
    .from("message_templates")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as MessageTemplate;
}

export async function deleteTemplate(id: string) {
  const { error } = await insforge.database
    .from("message_templates")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
