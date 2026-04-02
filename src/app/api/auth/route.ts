import { createAuthRouteHandlers } from "@insforge/nextjs/api";

// Handles POST/GET/DELETE to /api/auth (base path)
// InsforgeBrowserProvider calls POST /api/auth for sync-token
// and DELETE /api/auth for sign-out
const handlers = createAuthRouteHandlers({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
});

export const POST = handlers.POST;
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
