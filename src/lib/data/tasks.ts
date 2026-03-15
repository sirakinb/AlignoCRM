import { insforge } from "@/lib/insforge/client";
import type { Task, CreateTaskInput, UpdateTaskInput } from "@/types/crm";
import { emitEvent } from "@/lib/events/emitter";
import { BusinessEventType } from "@/types/events";

export async function getTasks(workspaceId: string) {
  const { data, error } = await insforge.database
    .from("tasks")
    .select()
    .eq("workspace_id", workspaceId)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return data as Task[];
}

export async function getTask(id: string) {
  const { data, error } = await insforge.database
    .from("tasks")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Task;
}

export async function createTask(input: CreateTaskInput) {
  const { data, error } = await insforge.database
    .from("tasks")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  const task = data as Task;

  await emitEvent({
    workspace_id: task.workspace_id,
    event_type: BusinessEventType.TaskCreated,
    record_id: task.id,
    record_type: "task",
    payload: {
      taskId: task.id,
      title: task.title,
      assigneeId: task.assignee_id,
      contactId: task.contact_id,
      dealId: task.deal_id,
    },
  });

  return task;
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const { data, error } = await insforge.database
    .from("tasks")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}
