import { createClient } from "@insforge/sdk";

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL!;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!;

// Browser client. Whatever is in `anonKey` is inlined into the JS bundle and
// served to every visitor, so it must be the public `anon_` key and nothing
// else. A project API key here is a full backend compromise — that is exactly
// what shipped in production until 2026-08-05. Positively REQUIRE the anon_
// prefix (allowlist, not blocklist): this rejects the ik_ admin key, a stray
// JWT, AND an unset/empty value that would otherwise build a client with
// anonKey: undefined. Fail the build rather than publish the wrong thing.
if (!anonKey?.startsWith("anon_")) {
  throw new Error(
    "NEXT_PUBLIC_INSFORGE_ANON_KEY must be the public anon key (anon_...). " +
      "Got " +
      (anonKey ? `a value starting "${anonKey.slice(0, 3)}"` : "an empty value") +
      ". A project API key (ik_...) grants project_admin and must never be " +
      "published in the browser bundle; it belongs in the server-only " +
      "INSFORGE_API_KEY."
  );
}

export const insforge = createClient({ baseUrl, anonKey });
