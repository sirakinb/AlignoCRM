/** Scopes requested for Microsoft Graph mailbox connect + send/sync. */
export const MICROSOFT_GRAPH_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
] as const;

export const MICROSOFT_GRAPH_SCOPE_STRING = MICROSOFT_GRAPH_SCOPES.join(" ");
