import twilio from "twilio";
import { twilioStatusCallbackUrl } from "./urls";

export interface SmsSendResult {
  id: string; // Twilio Message SID
  success: boolean;
}

export interface SmsProvider {
  send(input: { to: string; body: string }): Promise<SmsSendResult>;
}

/**
 * Real Twilio provider. Sends through a Messaging Service (not a bare number)
 * so the toll-free number, sender pool, and Advanced Opt-Out are managed in the
 * Twilio console. Lazily initializes the client on first send.
 *
 * Mirrors the swappable-provider shape of email-service.ts so tests can inject
 * a fake via setSmsProvider() and never hit the network (REQ P5-20).
 */
export class TwilioSmsProvider implements SmsProvider {
  private client: twilio.Twilio | null = null;

  private getClient(): twilio.Twilio {
    if (!this.client) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) {
        throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set");
      }
      this.client = twilio(sid, token);
    }
    return this.client;
  }

  async send(input: { to: string; body: string }): Promise<SmsSendResult> {
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (!messagingServiceSid) {
      throw new Error("TWILIO_MESSAGING_SERVICE_SID is not set");
    }

    // MUST come from MESSAGING_PUBLIC_BASE_URL — the same base twilio/status
    // validates the signature against. Any other source (e.g. NEXT_PUBLIC_APP_URL)
    // drifts and makes every status callback 403 (HIGH finding).
    const statusCallback = twilioStatusCallbackUrl() ?? undefined;

    const msg = await this.getClient().messages.create({
      to: input.to,
      body: input.body,
      messagingServiceSid,
      ...(statusCallback ? { statusCallback } : {}),
    });

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
