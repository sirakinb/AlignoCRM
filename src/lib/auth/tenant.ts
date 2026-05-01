import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import {
  FALLBACK_WORKSPACE_ID,
  getTenantContextForUser,
  type TenantContext,
} from "@/lib/data/organizations";

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireTenantContext(): Promise<TenantContext> {
  const user = await getAuthenticatedUser();
  if (!user) throw new UnauthorizedError();
  return getTenantContextForUser(user);
}

export async function getOptionalTenantContext(): Promise<TenantContext> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      organizationId: null,
      workspaceId: FALLBACK_WORKSPACE_ID,
      role: null,
      organization: null,
    };
  }

  return getTenantContextForUser(user);
}

export function tenantErrorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return null;
}

