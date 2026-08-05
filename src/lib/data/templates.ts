import { insforge } from "@/lib/insforge/server";
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

// by-id reads/writes are fetch-by-id-AND-workspace, never fetch-then-compare
// (REQ-SEC-15.2). The server client bypasses RLS, so this workspace filter is
// the actual tenant boundary once these are wired to /api/templates/[id].
export async function getTemplate(id: string, workspaceId: string) {
  const { data, error } = await insforge.database
    .from("message_templates")
    .select()
    .eq("id", id)
    .eq("workspace_id", workspaceId)
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

export async function updateTemplate(
  id: string,
  workspaceId: string,
  input: UpdateTemplateInput
) {
  const { data, error } = await insforge.database
    .from("message_templates")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) throw error;
  return data as MessageTemplate;
}

export async function deleteTemplate(id: string, workspaceId: string) {
  const { error } = await insforge.database
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw error;
}
