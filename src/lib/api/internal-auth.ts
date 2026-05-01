import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { findActiveApiKey, markApiKeyUsed } from "@/lib/data/api-keys";

const API_KEY_HEADER = "x-api-key";

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
  const expectedKey = process.env.ALIGNO_API_KEY;
  const apiKey = getRequestApiKey(request);

  if (!expectedKey) {
    if (process.env.NODE_ENV !== "production" && !apiKey) return true;
  } else if (apiKey && isSameSecret(apiKey, expectedKey)) {
    return true;
  }

  if (!apiKey) return false;

  const record = await findActiveApiKey(apiKey);
  if (!record) return false;

  await markApiKeyUsed(record.id).catch((error) => {
    console.error("[internal-auth] Failed to mark API key used:", error);
  });

  return true;
}

export function unauthorizedInternalApiResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
