import "@testing-library/jest-dom/vitest";

// The InsForge client modules assert their keys at import time (client.ts
// requires an anon_ key; server.ts requires an ik_ key). Provide inert,
// correctly-prefixed test values so those guards pass without real credentials.
process.env.NEXT_PUBLIC_INSFORGE_URL ??= "https://test.insforge.app";
process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??= "anon_test_key_for_vitest_only";
process.env.INSFORGE_API_KEY ??= "ik_test_key_for_vitest_only";
