import "server-only";
import type { ConversationEmailProvider } from "@/lib/messaging/conversation-email";
import type { EmailConnection } from "@/lib/messaging/email-connections";
import { updateEmailConnectionTokens } from "@/lib/messaging/email-connections";
import { GmailApiEmailProvider } from "./gmail";
import { MicrosoftGraphEmailProvider } from "./outlook";

function makeOnTokensRefreshed(connection: EmailConnection) {
  return async (payload: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt: Date | null;
  }) => {
    await updateEmailConnectionTokens(connection.workspace_id, connection.id, {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
    });
  };
}

export function getEmailProviderForConnection(
  connection: EmailConnection
): ConversationEmailProvider {
  switch (connection.provider) {
    case "google":
      return new GmailApiEmailProvider(connection, {
        onTokensRefreshed: makeOnTokensRefreshed(connection),
      });
    case "microsoft":
      return new MicrosoftGraphEmailProvider(connection, {
        onTokensRefreshed: makeOnTokensRefreshed(connection),
      });
    default:
      throw new Error(`Unsupported email provider: ${connection.provider}`);
  }
}
