import sanitizeHtml from "sanitize-html";

/**
 * Server-side allowlist sanitizer for inbound email HTML (REQ-SEC-11, T3).
 *
 * Chosen over DOMPurify+jsdom: sanitize-html is server-native (htmlparser2, no
 * DOM emulation), an order of magnitude lighter in a serverless cold start, and
 * fails closed — unknown tags/attributes are dropped by default. We render the
 * stored result in a sandboxed iframe (REQ-SEC-13), not by re-serializing into
 * a live document, so mXSS-on-reserialization is not the relevant threat model.
 *
 * Sanitize ON WRITE and store only the result. Never store raw + "sanitize on
 * render" — someone eventually renders the raw column. Sanitize AFTER quoted-
 * reply stripping, never before, so the stripper cannot reassemble markup that
 * the sanitizer already removed.
 */
/**
 * Sanitize author-written campaign/template HTML before it is sent from the
 * verified sending domain (Gate-4 #6). The campaign body is author-controlled but
 * a stored-XSS payload sitting in a template must not ship to recipients as if it
 * came from us — same allowlist as inbound. Merge VALUES are escaped separately
 * by interpolateTemplate("html"); this covers the body markup itself. Sanitize
 * the TEMPLATE (before interpolation) so escaped merge entities are never
 * re-parsed.
 */
export function sanitizeOutboundHtml(dirty: string): string {
  return sanitizeInboundHtml(dirty);
}

export function sanitizeInboundHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p", "br", "hr", "div", "span", "blockquote", "pre", "code",
      "b", "strong", "i", "em", "u", "s", "sub", "sup", "small",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
      "a", "img",
    ],
    // Explicitly NOT allowed: script, style, iframe, object, embed, form,
    // input, button, base, link, meta, svg, math, template, noscript.
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan", "align", "valign"],
      th: ["colspan", "rowspan", "align", "valign", "scope"],
      "*": ["style"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    // data: URIs banned outright — no data:text/html, and no inline images.
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/, /^[a-zA-Z]+$/],
        "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/, /^[a-zA-Z]+$/],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "font-size": [/^\d{1,3}(px|pt|em|rem|%)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
        padding: [/^[\d\s]{1,20}(px|pt|em|%)?$/],
        margin: [/^[\d\s]{1,20}(px|pt|em|%)?$/],
      },
    },
    transformTags: {
      // Every surviving link opens externally and leaks no referrer.
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
    // Drop the *contents* of removed script/style, not just the tags.
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    disallowedTagsMode: "discard",
  });
}
