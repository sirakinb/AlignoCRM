export type MessageChannel = "email" | "sms";

export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced";

export interface MessageTemplate {
  id: string;
  workspace_id: string;
  name: string;
  subject: string | null;
  body: string;
  variables: string[];
  channel: MessageChannel;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageLog {
  id: string;
  workspace_id: string;
  template_id: string | null;
  contact_id: string;
  channel: MessageChannel;
  to_address: string;
  subject: string | null;
  body: string;
  status: MessageStatus;
  provider_id: string | null;
  provider_response: Record<string, unknown> | null;
  enrollment_id: string | null;
  sent_at: string | null;
  created_at: string;
}

export type CreateTemplateInput = Pick<
  MessageTemplate,
  "workspace_id" | "name" | "body"
> &
  Partial<
    Pick<MessageTemplate, "subject" | "variables" | "channel" | "created_by">
  >;

export type UpdateTemplateInput = Partial<
  Pick<MessageTemplate, "name" | "subject" | "body" | "variables" | "channel">
>;

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  contactId: string;
  enrollmentId?: string;
  templateId?: string;
}
