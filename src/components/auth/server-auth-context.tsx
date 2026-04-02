"use client";

import { createContext, useContext } from "react";

interface ServerUser {
  id: string;
  email: string;
  profile: Record<string, unknown> | null;
}

interface ServerAuthContextValue {
  user: ServerUser | null;
}

const ServerAuthContext = createContext<ServerAuthContextValue>({ user: null });

export function ServerAuthProvider({
  user,
  children,
}: {
  user: ServerUser | null;
  children: React.ReactNode;
}) {
  return (
    <ServerAuthContext.Provider value={{ user }}>
      {children}
    </ServerAuthContext.Provider>
  );
}

/**
 * Returns the user data from the server-side cookie.
 * This is NOT overwritten by the SDK's client-side session refresh,
 * so it always has the email from the original sign-in.
 */
export function useServerUser() {
  return useContext(ServerAuthContext);
}
