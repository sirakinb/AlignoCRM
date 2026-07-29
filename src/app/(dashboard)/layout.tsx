import { getAuthFromCookies } from "@insforge/nextjs";
import type { ServerUser } from "@/components/auth/server-auth-context";
import { ServerAuthProvider } from "@/components/auth/server-auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { SubscriptionProvider } from "@/components/auth/subscription-context";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { AgentProvider } from "@/components/agent/agent-provider";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = await getAuthFromCookies();
  const metadata =
    ((initialState?.user as { metadata?: Record<string, unknown> } | null)
      ?.metadata ?? {}) as Record<string, unknown>;
  const profile = {
    ...metadata,
    ...(((initialState?.user?.profile as Record<string, unknown> | null) ?? {})),
  };
  const serverUser: ServerUser | null = initialState?.user
    ? {
        id: (initialState.userId ?? initialState.user.id) as string,
        email: initialState.user.email as string,
        profile: Object.keys(profile).length > 0 ? profile : null,
      }
    : null;

  return (
    <ServerAuthProvider user={serverUser}>
      <SubscriptionProvider>
        <SubscriptionGate>
          <AgentProvider>
            <AppShell>{children}</AppShell>
          </AgentProvider>
        </SubscriptionGate>
      </SubscriptionProvider>
    </ServerAuthProvider>
  );
}
