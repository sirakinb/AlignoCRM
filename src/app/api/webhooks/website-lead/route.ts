import { leadWebhookOptions, leadWebhookPost } from "@/lib/api/lead-webhook";

export const OPTIONS = leadWebhookOptions;

export function POST(request: Request) {
  return leadWebhookPost(request, "/api/webhooks/website-lead");
}
