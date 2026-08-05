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

// ── Messaging center (conversations, unified messages) ──────────────────────
// Distinct from the workflow engine's MessageLog above.

export type MessageDirection = "inbound" | "outbound";

export type ConversationMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "received";

export type MessageProvider = "resend" | "twilio";

export interface Conversation {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  contact_id: string;
  reply_token: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_channel: MessageChannel | null;
  last_message_direction: MessageDirection | null;
  unread_count: number;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  conversation_id: string | null;
  contact_id: string;
  campaign_id: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  status: ConversationMessageStatus;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  from_address: string | null;
  to_address: string | null;
  provider: MessageProvider | null;
  provider_id: string | null;
  provider_response: Record<string, unknown> | null;
  error: string | null;
  email_message_id: string | null;
  sender_verified: boolean;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}
