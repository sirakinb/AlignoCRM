import { task } from "@trigger.dev/sdk";
import { getContact } from "@/lib/data/contacts";
import { sendEmail } from "@/lib/messaging/email-service";
import { interpolateTemplate } from "@/lib/messaging/interpolation";
import type { SendEmailConfig } from "@/types/workflow";

export const executeSendEmail = task({
  id: "execute-send-email",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: {
    workspaceId: string;
    enrollmentId: string;
    recordId: string;
    nodeConfig: SendEmailConfig;
  }) => {
    const { workspaceId, enrollmentId, recordId, nodeConfig } = payload;

    const contact = await getContact(recordId);

    const context: Record<string, unknown> = {
      contact: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
      },
    };

    const { text: subject } = interpolateTemplate(nodeConfig.subject, context);
    // body is rendered as HTML email — escape merge values (REQ-SEC-12).
    const { text: body } = interpolateTemplate(nodeConfig.body, context, {
      mode: "html",
    });
    const { text: toInterpolated } = interpolateTemplate(nodeConfig.to, context);
    const to = toInterpolated || contact.email;

    if (!to) {
      throw new Error(`No email address for contact ${recordId}`);
    }

    const messageLog = await sendEmail(workspaceId, {
      to,
      subject,
      body,
      contactId: recordId,
      enrollmentId,
      templateId: nodeConfig.templateId,
    });

    return {
      messageLogId: messageLog.id,
      to,
      subject,
      status: messageLog.status,
    };
  },
});
