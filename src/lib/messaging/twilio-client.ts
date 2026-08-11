import "server-only";
import twilio from "twilio";

let client: twilio.Twilio | null = null;

/** Shared Twilio REST client (Account SID + Auth Token from env). */
export function getTwilioClient(): twilio.Twilio {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set");
    }
    client = twilio(sid, token);
  }
  return client;
}

/** Test helper — reset the cached client between suites. */
export function resetTwilioClientForTests(): void {
  client = null;
}
