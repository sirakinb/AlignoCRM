/** @type {import('next').NextConfig} */

// Content-Security-Policy is the last line of defense behind the inbound-HTML
// sanitizer and the sandboxed message iframe (REQ-SEC-13, IR-9). Next.js needs
// 'unsafe-inline' (and 'unsafe-eval' in dev) for its bootstrap/runtime, so the
// policy is scoped pragmatically rather than omitted. The message body itself
// renders inside <iframe sandbox="" srcDoc> — script execution there is denied by
// the sandbox regardless of this header.
const isDev = process.env.NODE_ENV !== "production";

// 'unsafe-eval' is only needed by the Next dev runtime; production App Router does
// not require it, so gate it to development (MEDIUM #4). 'unsafe-inline' stays —
// Next's inline bootstrap needs it; the real anti-XSS control is the sandboxed
// message iframe (REQ-SEC-13), not this directive.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// Tighten connect-src to self + the InsForge origin the browser client talks to,
// rather than a blanket https: (MEDIUM #4). MUST also include the Pentridge Labs
// billing hub the SubscriptionGate calls (subscription-context.tsx CHECK_URL) —
// omitting it blocks the subscription check and locks every non-allowlisted user
// out of the app (regression caught in the Phase 3 live run).
const BILLING_HUB_ORIGIN = "https://3nm75tby.us-east.insforge.app";
let insforgeOrigin = "";
try {
  if (process.env.NEXT_PUBLIC_INSFORGE_URL) {
    insforgeOrigin = new URL(process.env.NEXT_PUBLIC_INSFORGE_URL).origin;
  }
} catch {
  insforgeOrigin = "";
}
const connectSrc = ["connect-src 'self'", insforgeOrigin, BILLING_HUB_ORIGIN]
  .filter(Boolean)
  .join(" ");

// Google Fonts: the stylesheet loads from fonts.googleapis.com and the font
// files from fonts.gstatic.com. Allow both explicitly (also caught in the live
// run — the tightened style/font-src was blocking the app's own webfonts).
const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  connectSrc,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.insforge.app",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
