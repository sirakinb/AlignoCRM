import { verifyUnsubToken } from "@/lib/messaging/token";
import { addSuppression } from "@/lib/messaging/suppressions";
import { checkUnsubscribeRateLimit } from "@/lib/messaging/rate-limit";
import { escapeHtml } from "@/lib/html";

/**
 * Public unsubscribe endpoint (REQ-SEC-08, REQ-SEC-09). The token is an
 * HMAC-signed, self-describing payload — the workspace/channel/address come from
 * the token, never from the request, so this route needs no session and cannot be
 * pointed at another tenant. GET renders a confirm page and mutates NOTHING (mail
 * scanners and link-prefetchers issue GETs). POST executes the opt-out — it is
 * both the confirm-button target and the RFC 8058 one-click target. No detail
 * about why a bad token failed is revealed.
 */

function htmlResponse(body: string, status = 200): Response {
  return new Response(page(body), {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function page(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Email preferences</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;background:#f7f7f8;margin:0;padding:48px 16px;color:#27272a}
  .card{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e7e7ea;border-radius:14px;padding:28px 26px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  h1{font-size:18px;margin:0 0 8px}
  p{font-size:14px;line-height:1.5;color:#52525b;margin:0 0 18px}
  button{background:#5b21b6;color:#fff;border:0;border-radius:9px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#4c1d95}
  .muted{font-size:12px;color:#a1a1aa;margin-top:16px}
</style></head><body><div class="card">${inner}</div></body></html>`;
}

function ipOf(request: Request): string {
  // Gate-4 #4: never trust the FIRST X-Forwarded-For entry — a client can prepend
  // arbitrary values to it, letting an attacker rotate the rate-limit key at will.
  // Prefer the platform-set header, else take the RIGHTMOST XFF entry (the hop
  // the trusted proxy actually observed).
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

const INVALID_PAGE =
  `<h1>This link is no longer valid</h1>` +
  `<p>We couldn't process this request. The link may have expired or been mistyped. ` +
  `If you keep receiving unwanted email, reply to any message and ask to be removed.</p>`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!(await checkUnsubscribeRateLimit(ipOf(request)))) {
    return htmlResponse(
      `<h1>Please wait a moment</h1><p>Too many requests. Try again shortly.</p>`,
      429
    );
  }

  const payload = verifyUnsubToken(token);
  if (!payload) {
    return htmlResponse(INVALID_PAGE, 200);
  }

  // Confirm page only — NO write (REQ-SEC-09). The button POSTs to this same URL.
  return htmlResponse(
    `<h1>Unsubscribe from these emails?</h1>` +
      `<p>Click below to stop receiving marketing email from this sender. ` +
      `You'll still get direct replies to conversations you start.</p>` +
      `<form method="POST" action="/api/unsubscribe/${encodeURIComponent(token)}">` +
      `<button type="submit">Unsubscribe</button>` +
      `</form>`
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!(await checkUnsubscribeRateLimit(ipOf(request)))) {
    return htmlResponse(
      `<h1>Please wait a moment</h1><p>Too many requests. Try again shortly.</p>`,
      429
    );
  }

  const payload = verifyUnsubToken(token);
  if (!payload) {
    return htmlResponse(INVALID_PAGE, 200);
  }

  try {
    // Idempotent (unique constraint + upgrade-only precedence). Posting twice
    // does not error or duplicate (P4-26b). Tenant is the token's workspace.
    await addSuppression({
      workspaceId: payload.w,
      channel: payload.c,
      address: payload.a,
      reason: "unsubscribe",
    });
  } catch (err) {
    console.error("POST /api/unsubscribe error:", err instanceof Error ? err.name : "unknown");
    return htmlResponse(
      `<h1>Something went wrong</h1><p>Please try again in a moment.</p>`,
      200
    );
  }

  return htmlResponse(
    `<h1>You're unsubscribed</h1>` +
      `<p>You won't receive further marketing ${escapeHtml(payload.c)} from this sender.</p>` +
      `<p class="muted">Changed your mind? Contact the sender to opt back in.</p>`
  );
}
