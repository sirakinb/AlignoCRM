import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config.mjs";

/**
 * MEDIUM #4 — the app CSP + companion security headers. setup.ts sets
 * NEXT_PUBLIC_INSFORGE_URL=https://test.insforge.app, and vitest runs with
 * NODE_ENV !== "production", so this exercises the dev branch + directive shape.
 */
async function cspValue(): Promise<string> {
  const groups = await (nextConfig as { headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>> }).headers();
  const all = groups.flatMap((g) => g.headers);
  return all.find((h) => h.key === "Content-Security-Policy")!.value;
}

describe("next.config security headers", () => {
  it("scopes connect-src to self + the InsForge origin, not a blanket https:", async () => {
    const csp = await cspValue();
    expect(csp).toContain("connect-src 'self' https://test.insforge.app");
    expect(csp).not.toContain("connect-src 'self' https:;");
  });

  it("allows the billing hub in connect-src (SubscriptionGate must reach it)", async () => {
    const csp = await cspValue();
    expect(csp).toContain("https://3nm75tby.us-east.insforge.app");
  });

  it("allows Google Fonts in style-src + font-src", async () => {
    const csp = await cspValue();
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });

  it("keeps the hardening directives", async () => {
    const csp = await cspValue();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("includes 'unsafe-eval' only in the dev (non-production) branch", async () => {
    const csp = await cspValue();
    // vitest env is non-production → dev branch keeps unsafe-eval for the Next runtime.
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("ships the companion headers", async () => {
    const groups = await (nextConfig as { headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>> }).headers();
    const keys = groups.flatMap((g) => g.headers).map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Strict-Transport-Security",
      ])
    );
  });
});
