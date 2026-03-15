"use client";

import { InsforgeBrowserProvider } from "@insforge/nextjs";
import type { InitialAuthState } from "@insforge/nextjs";
import { insforge } from "@/lib/insforge/client";

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: InitialAuthState;
}) {
  return (
    <InsforgeBrowserProvider
      client={insforge}
      afterSignInUrl="/"
      initialState={initialState}
    >
      {children}
    </InsforgeBrowserProvider>
  );
}
