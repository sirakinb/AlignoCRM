export enum BusinessEventType {
  ContactCreated = "contact_created",
  TagAdded = "tag_added",
  DealStageChanged = "deal_stage_changed",
  TaskCreated = "task_created",
  FormSubmitted = "form_submitted",
}

export interface ContactCreatedPayload {
  contactId: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

export interface TagAddedPayload {
  contactId: string;
  tagId: string;
  tagName: string;
}

export interface DealStageChangedPayload {
  dealId: string;
  previousStageId: string;
  newStageId: string;
  pipelineId: string;
}

export interface TaskCreatedPayload {
  taskId: string;
  title: string;
  assigneeId: string | null;
  contactId?: string | null;
  dealId?: string | null;
}

export interface FormSubmittedPayload {
  formId: string;
  contactId: string;
  data: Record<string, unknown>;
}

export type BusinessEventPayload =
  | ContactCreatedPayload
  | TagAddedPayload
  | DealStageChangedPayload
  | TaskCreatedPayload
  | FormSubmittedPayload;

export interface BusinessEvent {
  id: string;
  workspace_id: string;
  event_type: BusinessEventType;
  record_id: string;
  record_type: string;
  payload: BusinessEventPayload;
  idempotency_key: string;
  processed: boolean;
  created_at: string;
}

export type CreateBusinessEventInput = Pick<
  BusinessEvent,
  "workspace_id" | "event_type" | "record_id" | "record_type" | "payload"
>;
