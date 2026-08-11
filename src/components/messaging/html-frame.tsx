"use client";

import { useMemo, useState } from "react";
import { ImageOff } from "lucide-react";

interface HtmlFrameProps {
  /** Already server-sanitized HTML (sanitize-html on write, REQ-SEC-11). */
  html: string;
}

/**
 * Renders inbound email HTML inside a locked-down iframe (REQ-SEC-13, contract a).
 *
 * - `sandbox=""` (empty string): no scripts, no forms, no same-origin, no
 *   top-navigation, no plugins. `allow-scripts` + `allow-same-origin` together
 *   equal no sandbox, so NEITHER is ever added.
 * - `referrerPolicy="no-referrer"`: the frame leaks no referrer.
 * - Remote images are BLOCKED by default (contract c): opening a thread must not
 *   silently confirm a read-receipt or leak the reader's IP to the sender. A
 *   per-message "Load images" affordance re-renders with images restored. The
 *   block is done by rewriting `img[src]` here — never by re-sanitizing the
 *   stored value (which stays the sanitized original).
 *
 * The HTML only ever reaches the DOM through the iframe's `srcDoc` — never a raw
 * innerHTML sink — so a sanitizer bypass still cannot execute.
 */
export function HtmlFrame({ html }: HtmlFrameProps) {
  const [imagesLoaded, setImagesLoaded] = useState(false);

  const hasRemoteImages = useMemo(() => /<img\b[^>]*\bsrc=/i.test(html), [html]);

  const doc = useMemo(() => {
    const body = imagesLoaded ? html : blockRemoteImages(html);
    return wrapDocument(body, imagesLoaded);
  }, [html, imagesLoaded]);

  return (
    <div className="overflow-hidden rounded-lg border border-[#e7e7ea] bg-white">
      {hasRemoteImages && !imagesLoaded && (
        <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f2] bg-[#fafafa] px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12px] text-zinc-500">
            <ImageOff size={13} strokeWidth={1.8} className="shrink-0" />
            Remote images blocked to protect your privacy.
          </span>
          <button
            onClick={() => setImagesLoaded(true)}
            className="shrink-0 rounded-md bg-white px-2 py-1 text-[12px] font-medium text-[#5b21b6] ring-1 ring-[#e3d5f8] transition-colors hover:bg-[#f4eefc]"
          >
            Load images
          </button>
        </div>
      )}
      <iframe
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={doc}
        title="Message content"
        className="h-[420px] w-full border-0 bg-white"
      />
    </div>
  );
}

/**
 * Strip the `src` off every `<img>` so nothing is fetched, dropping the URL
 * entirely (the original is restored by re-rendering from the untouched `html`
 * when the user opts in). Operates on already-sanitized HTML for display only —
 * it is not a security boundary (the sandbox and CSP are); it prevents the
 * tracking-pixel IP leak.
 */
function blockRemoteImages(html: string): string {
  return html.replace(/(<img\b[^>]*?)\ssrc=(["']).*?\2/gi, '$1 data-blocked="1"');
}

/**
 * Wrap the message body in a minimal, script-free document with readable defaults.
 * A per-frame CSP `<meta>` makes image-blocking BROWSER-ENFORCED rather than only
 * regex-based (MEDIUM #3): an `srcdoc` frame otherwise inherits the parent CSP,
 * whose `img-src https:` would permit the very remote images we strip. With
 * `default-src 'none'` here, nothing loads except inline styles, and `img-src`
 * flips with the load-images state — the regex strip becomes defense-in-depth.
 */
function wrapDocument(body: string, allowImages: boolean): string {
  const frameCsp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${
    allowImages ? "https: data:" : "'none'"
  }`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${frameCsp}"><style>
    html,body{margin:0;padding:12px;background:#fff;color:#18181b;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;word-break:break-word;}
    img{max-width:100%;height:auto;}
    a{color:#6c2bd9;}
    table{max-width:100%;}
  </style></head><body>${body}</body></html>`;
}
