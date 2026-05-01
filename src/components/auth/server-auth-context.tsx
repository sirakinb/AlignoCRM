"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface ServerUser {
  id: string;
  email: string;
  profile: Record<string, unknown> | null;
}

function isSameUser(a: ServerUser | null, b: ServerUser | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface ServerAuthContextValue {
  user: ServerUser | null;
  setUser: (user: ServerUser | null) => void;
  refreshUser: () => Promise<ServerUser | null>;
}

const ServerAuthContext = createContext<ServerAuthContextValue>({
  user: null,
  setUser: () => {},
  refreshUser: async () => null,
});

export function ServerAuthProvider({
  user,
  children,
}: {
  user: ServerUser | null;
  children: React.ReactNode;
}) {
  const [currentUser, setCurrentUser] = useState<ServerUser | null>(user);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const refreshedUser = (data.user ?? null) as ServerUser | null;
      setCurrentUser((previousUser) =>
        isSameUser(previousUser, refreshedUser) ? previousUser : refreshedUser
      );
      return refreshedUser;
    } catch {
      return null;
    }
  }, []);

  return (
    <ServerAuthContext.Provider
      value={{ user: currentUser, setUser: setCurrentUser, refreshUser }}
    >
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
