export interface Workspace {
  id: string;
  organization_id?: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export type ContactStatus = "active" | "archived";

export interface Contact {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  status: ContactStatus;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  organization_id?: string | null;
  pipeline_id: string;
  name: string;
  position: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export type DealStatus = "open" | "won" | "lost";

export interface Deal {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  title: string;
  value: number;
  owner_id: string | null;
  status: DealStatus;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  name: string;
  color: string | null;
  created_at: string;
}

export interface ContactTag {
  contact_id: string;
  tag_id: string;
  organization_id?: string | null;
}

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  organization_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

// Input types for creating/updating entities
export type CreateContactInput = Pick<
  Contact,
  "workspace_id" | "first_name" | "last_name"
> &
  Partial<Pick<Contact, "organization_id" | "email" | "phone" | "company" | "notes" | "status" | "owner_id">>;

export type UpdateContactInput = Partial<
  Pick<
    Contact,
    "first_name" | "last_name" | "email" | "phone" | "company" | "notes" | "status" | "owner_id"
  >
>;

export type CreateDealInput = Pick<
  Deal,
  "workspace_id" | "pipeline_id" | "stage_id" | "title"
> &
  Partial<Pick<Deal, "organization_id" | "contact_id" | "value" | "owner_id" | "status">>;

export type UpdateDealInput = Partial<
  Pick<Deal, "title" | "value" | "contact_id" | "owner_id" | "status">
>;

export type CreatePipelineInput = Pick<Pipeline, "workspace_id" | "name"> &
  Partial<Pick<Pipeline, "organization_id" | "description" | "position">>;

export type CreateStageInput = Pick<Stage, "pipeline_id" | "name"> &
  Partial<Pick<Stage, "organization_id" | "position" | "color">>;

export type CreateTagInput = Pick<Tag, "workspace_id" | "name"> &
  Partial<Pick<Tag, "organization_id" | "color">>;

export type CreateTaskInput = Pick<Task, "workspace_id" | "title"> &
  Partial<
    Pick<
      Task,
      | "organization_id"
      | "contact_id"
      | "deal_id"
      | "description"
      | "status"
      | "assignee_id"
      | "due_date"
    >
  >;

export type UpdateTaskInput = Partial<
  Pick<
    Task,
    "title" | "description" | "status" | "assignee_id" | "due_date"
  >
>;

export type CreateActivityLogInput = Pick<
  ActivityLog,
  "workspace_id" | "entity_type" | "entity_id" | "action"
> &
  Partial<Pick<ActivityLog, "organization_id" | "metadata" | "actor_id">>;
