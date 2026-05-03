"use client";

import { insforge } from "@/lib/insforge/client";

export async function syncServerSession() {
  const result = await insforge.auth.getCurrentSession();
  const session = result.data?.session;

  if (!session?.accessToken || !session.user) {
    return false;
  }

  const response = await fetch("/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      action: "sync-token",
      user: session.user,
    }),
    cache: "no-store",
    credentials: "same-origin",
  });

  return response.ok;
}

export function getSafeRedirectPath(redirect: string | null) {
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/dashboard";
  }

  return redirect;
}
