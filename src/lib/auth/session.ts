import { cookies } from "next/headers";

export interface AuthenticatedUser {
  id: string;
  email: string;
  profile?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export function parseUserCookie(cookieValue?: string): AuthenticatedUser | null {
  if (!cookieValue) return null;

  try {
    const user = JSON.parse(cookieValue) as AuthenticatedUser;
    if (typeof user.id !== "string" || typeof user.email !== "string") return null;
    return user;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("insforge-session")?.value;
  const user = parseUserCookie(cookieStore.get("insforge-user")?.value);

  if (!token || !user) return null;
  return user;
}

