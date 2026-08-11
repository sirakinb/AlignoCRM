import { createHash } from "crypto";
import { cookies } from "next/headers";

export interface AuthenticatedUser {
  id: string;
  email: string;
  profile?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Session identity is derived from InsForge's answer to
 * `GET /api/auth/sessions/current`, never from a cookie the client controls.
 * The `insforge-user` cookie is display state written by the browser and is
 * not an input here: `@insforge/nextjs`'s sync-token handler sets it straight
 * from the request body without checking the token, so it proves nothing.
 */

const SESSION_ENDPOINT = "/api/auth/sessions/current";

/** Positive results are cached briefly so a page render costs one round trip. */
const VALID_TTL_MS = 30_000;
/** Rejections are cached for less, so a revoked token stops working promptly. */
const INVALID_TTL_MS = 5_000;
/** Bounds memory on a long-lived serverless instance. */
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  user: AuthenticatedUser | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function writeCache(key: string, user: AuthenticatedUser | null) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, {
    user,
    expiresAt: Date.now() + (user ? VALID_TTL_MS : INVALID_TTL_MS),
  });
}

export function clearSessionCache() {
  cache.clear();
}

function mergeProfile(user: {
  profile?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const merged = { ...(user.metadata ?? {}), ...(user.profile ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * Exchange a session token for the user InsForge says it belongs to.
 * Returns null for anything that is not an affirmative, well-formed answer —
 * including network and 5xx failures, which fail closed on purpose.
 */
export async function validateSessionToken(
  token: string
): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  const key = cacheKey(token);
  const cached = readCache(key);
  if (cached) return cached.user;

  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!baseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_INSFORGE_URL; cannot validate session tokens."
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${SESSION_ENDPOINT}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    // Reachability failure: deny, and do not cache — the next request retries.
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    writeCache(key, null);
    return null;
  }

  if (!response.ok) {
    // 5xx or anything unexpected. Deny without caching.
    return null;
  }

  let payload: { user?: { id?: unknown; email?: unknown } & Record<string, unknown> };
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const user = payload?.user;
  if (typeof user?.id !== "string" || typeof user?.email !== "string") {
    return null;
  }

  const authenticated: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    metadata: (user.metadata as Record<string, unknown> | null) ?? null,
    profile: mergeProfile(user as AuthenticatedUser),
  };

  writeCache(key, authenticated);
  return authenticated;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("insforge-session")?.value;
  if (!token) return null;

  return validateSessionToken(token);
}
