import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// The InsForge client modules assert their keys at import time (client.ts
// requires an anon_ key; server.ts requires an ik_ key). Provide inert,
// correctly-prefixed test values so those guards pass without real credentials.
process.env.NEXT_PUBLIC_INSFORGE_URL ??= "https://test.insforge.app";
process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??= "anon_test_key_for_vitest_only";
process.env.INSFORGE_API_KEY ??= "ik_test_key_for_vitest_only";

// Token encryption key for Milestone 1 email-provider tests.
process.env.OAUTH_TOKEN_ENCRYPTION_KEY ??= Buffer.from(
  "a".repeat(32),
  "utf8"
).toString("base64");

// server-only is a no-op in tests.
vi.mock("server-only", () => ({}));
