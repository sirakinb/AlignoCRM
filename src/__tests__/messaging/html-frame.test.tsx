import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HtmlFrame } from "@/components/messaging/html-frame";

afterEach(() => cleanup());

describe("HtmlFrame — sandboxed render (REQ-SEC-13, contract a/c)", () => {
  it("renders the body in an iframe with an EMPTY sandbox and no-referrer", () => {
    const { container } = render(<HtmlFrame html="<p>hello</p>" />);
    const iframe = container.querySelector("iframe")!;
    expect(iframe).toBeInTheDocument();
    // Empty sandbox string: script execution, forms, same-origin all denied.
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe).not.toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("blocks remote images by default and offers a Load images affordance", () => {
    const html = '<p>hi</p><img src="https://tracker.example/pixel.gif">';
    const { container } = render(<HtmlFrame html={html} />);
    const srcDoc = container.querySelector("iframe")!.getAttribute("srcdoc") ?? "";
    expect(srcDoc).not.toContain("https://tracker.example/pixel.gif");
    expect(srcDoc).toContain('data-blocked="1"');
    expect(screen.getByRole("button", { name: /Load images/ })).toBeInTheDocument();
  });

  it("does not offer the affordance when there are no remote images", () => {
    render(<HtmlFrame html="<p>plain text only</p>" />);
    expect(screen.queryByRole("button", { name: /Load images/ })).not.toBeInTheDocument();
  });

  it("embeds a per-frame CSP meta whose img-src flips with the load-images state (MEDIUM #3)", () => {
    const html = '<p>hi</p><img src="https://tracker.example/pixel.gif">';
    const { container } = render(<HtmlFrame html={html} />);
    const frame = container.querySelector("iframe")!;
    let srcDoc = frame.getAttribute("srcdoc") ?? "";
    // Browser-enforced block: default-src none + img-src 'none' before opt-in.
    expect(srcDoc).toContain("Content-Security-Policy");
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc).toContain("img-src 'none'");

    fireEvent.click(screen.getByRole("button", { name: /Load images/ }));
    srcDoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("img-src https: data:");
  });
});
