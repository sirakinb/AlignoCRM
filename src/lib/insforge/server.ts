// Build error if this module is ever pulled into a client bundle — turns the
// client/server boundary from a convention into a compiler-enforced guarantee.
import "server-only";
import { createClient } from "@insforge/sdk";

type InsforgeClient = ReturnType<typeof createClient>;

/**
 * Server-side InsForge client, authenticated with the project API key
 * (`project_admin`). This role bypasses RLS, so every caller remains
 * responsible for its own `organization_id` / `workspace_id` filtering —
 * RLS protects the browser's anon key, not this one.
 *
 * Never import this from a module that reaches a "use client" boundary — the
 * `import "server-only"` above makes that a build error.
 */

let cached: InsforgeClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Server-side InsForge ` +
        `access needs the project API key; see .env.local.example.`
    );
  }
  return value;
}

function build(): InsforgeClient {
  const baseUrl = requireEnv("NEXT_PUBLIC_INSFORGE_URL");
  const apiKey = requireEnv("INSFORGE_API_KEY");

  // Project API keys are `ik_`; this project's anon key is `anon_`. Putting the
  // anon key here silently downgrades every server route to anonymous access
  // once RLS is on — which reads as "queries return nothing", not as an error.
  // Assert the format we want rather than blocklisting the ones we don't.
  if (!apiKey.startsWith("ik_")) {
    throw new Error(
      apiKey.startsWith("anon_")
        ? "INSFORGE_API_KEY is set to the anon key. It must be the project API " +
          "key (ik_...); server routes would lose their privileges."
        : "INSFORGE_API_KEY must be a project API key (ik_...)."
    );
  }

  return createClient({ baseUrl, anonKey: apiKey });
}

export const insforge: InsforgeClient = new Proxy({} as InsforgeClient, {
  get(_target, property, receiver) {
    cached ??= build();
    return Reflect.get(cached, property, receiver);
  },
});
