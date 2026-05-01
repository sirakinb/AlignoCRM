import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { findActiveApiKey, markApiKeyUsed } from "@/lib/data/api-keys";
import {
  FALLBACK_WORKSPACE_ID,
  getTenantContextForOrganizationId,
  getTenantContextForUser,
  type TenantContext,
} from "@/lib/data/organizations";

const API_KEY_HEADER = "x-api-key";

export interface InternalApiAuthContext {
  authorized: boolean;
  userId: string | null;
  tenant: TenantContext;
}

function getRequestApiKey(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  return request.headers.get(API_KEY_HEADER) ?? bearerToken;
}

function isSameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export async function isInternalApiRequestAuthorized(request: Request) {
  const authContext = await getInternalApiAuthContext(request);
  return authContext.authorized;
}

export async function getInternalApiAuthContext(
  request: Request
): Promise<InternalApiAuthContext> {
  const expectedKey = process.env.ALIGNO_API_KEY;
  const apiKey = getRequestApiKey(request);
  const fallbackTenant = {
    organizationId: null,
    workspaceId: FALLBACK_WORKSPACE_ID,
    role: null,
    organization: null,
  };

  if (!expectedKey) {
    if (process.env.NODE_ENV !== "production" && !apiKey) {
      return {
        authorized: true,
        userId: null,
        tenant: fallbackTenant,
      };
    }
  } else if (apiKey && isSameSecret(apiKey, expectedKey)) {
    return {
      authorized: true,
      userId: null,
      tenant: fallbackTenant,
    };
  }

  if (!apiKey) {
    return { authorized: false, userId: null, tenant: fallbackTenant };
  }

  const record = await findActiveApiKey(apiKey);
  if (!record) {
    return { authorized: false, userId: null, tenant: fallbackTenant };
  }

  await markApiKeyUsed(record.id).catch((error) => {
    console.error("[internal-auth] Failed to mark API key used:", error);
  });

  if (record.organization_id) {
    const tenant = await getTenantContextForOrganizationId(record.organization_id);
    return {
      authorized: true,
      userId: record.user_id,
      tenant,
    };
  }

  const tenant = await getTenantContextForUser({
    id: record.user_id,
    email: "api-key-user@alignocrm.local",
  });

  return {
    authorized: true,
    userId: record.user_id,
    tenant,
  };
}

export function unauthorizedInternalApiResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
