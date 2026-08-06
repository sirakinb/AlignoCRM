/**
 * Adversarial QA for Phase 3 (Conversations inbox render path).
 *
 * Added by the QA pass — does NOT modify source. These pin the load-bearing
 * anti-XSS / anti-tracking invariants of the message render path (REQ-SEC-13,
 * P3-13) that had thin or no direct coverage: that attacker-controlled email
 * HTML only ever reaches the DOM through a locked-down `srcDoc` iframe, that the
 * sandbox can never silently widen, and that the default remote-image block does
 * not leak a tracking pixel on thread-open regardless of attribute ordering.
 *
 * Any `it.fails` here would mark a CONFIRMED defect (body asserts correct
 * behavior). As written, all assert invariants the current implementation holds.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HtmlFrame } from "@/components/messaging/html-frame";
import { MessageBubble } from "@/components/messaging/message-bubble";
import type { Message } from "@/types/messaging";

afterEach(() => cleanup());

// A stored (already-sanitizer-passed) email body that STILL carries a script —
// simulates a sanitizer bypass. The render layer must neutralize it on its own.
const POISONED_HTML =
  '<p>hi</p><script>window.__xss__=1</script><img src="https://evil.example/pixel.gif">';

describe("HtmlFrame — the iframe is the only DOM sink (REQ-SEC-13)", () => {
  it("routes foreign HTML through srcDoc, never through a real `src` navigation", () => {
    const { container } = render(<HtmlFrame html={POISONED_HTML} />);
    const iframe = container.querySelector("iframe")!;
    // srcDoc (a script-less about:srcdoc doc under the sandbox), NOT src — a
    // real `src` would give the frame a fetchable, potentially same-site origin.
    expect(iframe.getAttribute("srcdoc")).toBeTruthy();
    expect(iframe.getAttribute("src")).toBeNull();
  });

  it("never injects the foreign markup as live nodes into the parent document", () => {
    const { container } = render(<HtmlFrame html={POISONED_HTML} />);
    // The payload must live only inside the iframe's srcdoc STRING, not as a
    // parsed <script>/<img> element in the host tree.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // and it certainly must not have executed during render.
    expect((window as unknown as { __xss__?: number }).__xss__).toBeUndefined();
  });

  it("keeps sandbox exactly empty before AND after 'Load images' (never gains allow-scripts/allow-same-origin)", () => {
    const { container } = render(<HtmlFrame html={POISONED_HTML} />);
    const before = container.querySelector("iframe")!;
    expect(before.getAttribute("sandbox")).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /Load images/ }));

    const after = container.querySelector("iframe")!;
    const sandbox = after.getAttribute("sandbox") ?? "";
    expect(sandbox).toBe(""); // still empty — the toggle only affects <img src>
    expect(sandbox).not.toMatch(/allow-scripts/);
    expect(sandbox).not.toMatch(/allow-same-origin/);
  });
});

describe("HtmlFrame — remote-image block cannot leak a tracking pixel on open", () => {
  it("blocks EVERY remote image by default, not just the first", () => {
    const html =
      '<img src="https://a.example/1.gif"><p>x</p><img src="https://b.example/2.gif">';
    const { container } = render(<HtmlFrame html={html} />);
    const srcDoc = container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";
    expect(srcDoc).not.toContain("a.example");
    expect(srcDoc).not.toContain("b.example");
    expect(srcDoc.match(/data-blocked="1"/g)).toHaveLength(2);
  });

  it("blocks an image whose src is NOT the first attribute (regex-ordering regression pin)", () => {
    // If detection (hasRemoteImages) and stripping (blockRemoteImages) ever
    // disagree, the banner says 'blocked' while the pixel fires. Pin both.
    const html = '<img alt="a" width="1" src="https://track.example/p.gif" height="1">';
    const { container } = render(<HtmlFrame html={html} />);
    // banner shown (detection agrees there is a remote image)...
    expect(screen.getByRole("button", { name: /Load images/ })).toBeInTheDocument();
    // ...and the src is actually gone from what the frame renders.
    const srcDoc = container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";
    expect(srcDoc).not.toContain("track.example");
    expect(srcDoc).toContain('data-blocked="1"');
  });

  it("restores the real src only after the user explicitly opts in", () => {
    const html = '<img src="https://track.example/p.gif">';
    const { container } = render(<HtmlFrame html={html} />);
    let srcDoc = container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";
    expect(srcDoc).not.toContain("track.example");

    fireEvent.click(screen.getByRole("button", { name: /Load images/ }));

    srcDoc = container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("track.example"); // now (and only now) loadable
  });
});

describe("MessageBubble — channel-correct escaping (P3-13, contract b)", () => {
  function msg(overrides: Partial<Message>): Message {
    return {
      id: "m1",
      workspace_id: "ws-a",
      conversation_id: "c1",
      contact_id: "k1",
      campaign_id: null,
      channel: "email",
      direction: "inbound",
      status: "received",
      subject: null,
      body_text: null,
      body_html: null,
      to_address: null,
      sender_verified: true,
      created_at: new Date().toISOString(),
      ...overrides,
    } as Message;
  }

  it("renders an inbound SMS body as auto-escaped text — no live element from the payload", () => {
    const { container } = render(
      <MessageBubble message={msg({ channel: "sms", body_text: '<img src=x onerror="window.__sms_xss__=1">' })} />
    );
    // The markup shows as literal text, and no <img> node is created in the host DOM.
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { __sms_xss__?: number }).__sms_xss__).toBeUndefined();
    expect(container.textContent).toContain("onerror");
  });

  it("renders an inbound email body only through the sandboxed iframe once expanded", () => {
    const { container } = render(
      <MessageBubble
        message={msg({ channel: "email", subject: "Hello", body_html: "<p>body</p><script>window.__e_xss__=1</script>" })}
      />
    );
    // Collapsed by default: no iframe yet, and nothing executed.
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show message/ }));
    // Expanded: body is in an iframe, never as parent-doc script.
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __e_xss__?: number }).__e_xss__).toBeUndefined();
  });

  it("renders the inbound-sender-mismatch warning when sender_verified is false", () => {
    render(<MessageBubble message={msg({ channel: "email", body_html: "<p>x</p>", sender_verified: false })} />);
    expect(screen.getByText(/didn't match this contact/i)).toBeInTheDocument();
  });
});
