"use client";

import { InsforgeBrowserProvider } from "@insforge/nextjs";
import type { InitialAuthState } from "@insforge/nextjs";
import { insforge } from "@/lib/insforge/client";
import { ServerAuthProvider } from "@/components/auth/server-auth-context";

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: InitialAuthState;
}) {
  const serverUser = initialState?.user
    ? {
        id: initialState.userId as string,
        email: initialState.user.email as string,
        profile: (initialState.user.profile as Record<string, unknown>) || null,
      }
    : null;

  return (
    <InsforgeBrowserProvider
      client={insforge}
      afterSignInUrl="/"
      initialState={initialState}
    >
      <ServerAuthProvider user={serverUser}>
        {children}
      </ServerAuthProvider>
    </InsforgeBrowserProvider>
  );
}
