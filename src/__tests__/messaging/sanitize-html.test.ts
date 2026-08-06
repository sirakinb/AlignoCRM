import { describe, it, expect } from "vitest";
import { sanitizeInboundHtml } from "@/lib/messaging/sanitize-html";

// REQ-SEC-11 / P2-15 — every payload must survive with no executable vector.
const PAYLOADS: Array<[string, string]> = [
  ["plain script", "<script>alert(1)</script>"],
  ["img onerror", '<img src=x onerror=alert(1)>'],
  ["javascript href", '<a href="javascript:alert(1)">x</a>'],
  ["data:text/html href", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  ["svg animate onbegin", "<svg><animate onbegin=alert(1) attributeName=x dur=1s>"],
  ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>">'],
  ["style @import", "<style>@import 'http://evil'</style>"],
  ["base href", '<base href="http://evil/">'],
  ["form action", '<form action="http://evil"><input>'],
  ["css url(javascript)", '<div style="background:url(javascript:alert(1))">x</div>'],
  ["mXSS mglyph", "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>"],
  ["noscript breakout", '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
];

describe("sanitizeInboundHtml", () => {
  for (const [name, dirty] of PAYLOADS) {
    it(`neutralizes: ${name}`, () => {
      const clean = sanitizeInboundHtml(dirty);
      expect(clean).not.toMatch(/<script/i);
      expect(clean).not.toMatch(/on[a-z]+\s*=/i);
      expect(clean).not.toMatch(/javascript:/i);
      expect(clean).not.toMatch(/data:/i);
      expect(clean).not.toMatch(/<iframe/i);
      expect(clean).not.toMatch(/<style/i);
      expect(clean).not.toMatch(/<base/i);
      expect(clean).not.toMatch(/<form/i);
    });
  }

  it("keeps benign formatting and links (rewritten safe)", () => {
    const clean = sanitizeInboundHtml('<p>Hi <strong>Bob</strong> <a href="https://ok.com">link</a></p>');
    expect(clean).toContain("<strong>Bob</strong>");
    expect(clean).toContain('href="https://ok.com"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
    expect(clean).toContain('target="_blank"');
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeInboundHtml("")).toBe("");
  });
});
