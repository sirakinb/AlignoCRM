"use client";

import { SWRConfig } from "swr";
import { InsforgeBrowserProvider } from "@insforge/nextjs";
import type { InitialAuthState } from "@insforge/nextjs";
import { insforge } from "@/lib/insforge/client";
import { ServerAuthProvider } from "@/components/auth/server-auth-context";

const swrDefaults = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
};

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: InitialAuthState;
}) {
  const metadata =
    ((initialState?.user as { metadata?: Record<string, unknown> } | null)?.metadata ??
      {}) as Record<string, unknown>;
  const profile = {
    ...metadata,
    ...(((initialState?.user?.profile as Record<string, unknown> | null) ?? {})),
  };
  const serverUser = initialState?.user
    ? {
        id: (initialState.userId ?? initialState.user.id) as string,
        email: initialState.user.email as string,
        profile: Object.keys(profile).length > 0 ? profile : null,
      }
    : null;

  return (
    <SWRConfig value={swrDefaults}>
      <InsforgeBrowserProvider
        client={insforge}
        afterSignInUrl="/dashboard"
        initialState={initialState}
      >
        <ServerAuthProvider user={serverUser}>
          {children}
        </ServerAuthProvider>
      </InsforgeBrowserProvider>
    </SWRConfig>
  );
}
