import { getTwilioClient } from "./twilio-client";
import { twilioStatusCallbackUrl } from "./urls";

export interface SmsSendResult {
  id: string; // Twilio Message SID
  success: boolean;
}

export interface SmsProvider {
  /**
   * Send an SMS. Prefer `from` when the workspace has a purchased number;
   * otherwise fall back to TWILIO_MESSAGING_SERVICE_SID.
   */
  send(input: { to: string; body: string; from?: string | null }): Promise<SmsSendResult>;
}

/**
 * Real Twilio provider. Uses a workspace purchased `from` number when provided;
 * otherwise sends through the account Messaging Service (sender pool / Advanced
 * Opt-Out). Lazily initializes the client on first send.
 *
 * Mirrors the swappable-provider shape of email-service.ts so tests can inject
 * a fake via setSmsProvider() and never hit the network (REQ P5-20).
 */
export class TwilioSmsProvider implements SmsProvider {
  async send(input: {
    to: string;
    body: string;
    from?: string | null;
  }): Promise<SmsSendResult> {
    // MUST come from MESSAGING_PUBLIC_BASE_URL — the same base twilio/status
    // validates the signature against. Any other source (e.g. NEXT_PUBLIC_APP_URL)
    // drifts and makes every status callback 403 (HIGH finding).
    const statusCallback = twilioStatusCallbackUrl() ?? undefined;

    const createParams: {
      to: string;
      body: string;
      from?: string;
      messagingServiceSid?: string;
      statusCallback?: string;
    } = {
      to: input.to,
      body: input.body,
      ...(statusCallback ? { statusCallback } : {}),
    };

    if (input.from) {
      createParams.from = input.from;
    } else {
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      if (!messagingServiceSid) {
        throw new Error(
          "No workspace phone number and TWILIO_MESSAGING_SERVICE_SID is not set"
        );
      }
      createParams.messagingServiceSid = messagingServiceSid;
    }

    const msg = await getTwilioClient().messages.create(createParams);
    return { id: msg.sid, success: true };
  }
}

let provider: SmsProvider = new TwilioSmsProvider();

export function setSmsProvider(p: SmsProvider) {
  provider = p;
}

export function getSmsProvider(): SmsProvider {
  return provider;
}
