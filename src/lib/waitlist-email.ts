export const FROM_ADDRESS = "Aligno CRM <aki.b@pentridgemedia.com>";
export const SUBJECT = "You're on the Aligno CRM waitlist";

export function buildHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${SUBJECT}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Geist:wght@300;400;500&family=Geist+Mono:wght@500&display=swap');
    body { margin:0; padding:0; background:#f7f3fb; }
    a { text-decoration:none; }
    @media (max-width: 600px) {
      .container { padding:32px 20px !important; }
      .headline { font-size:34px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#f7f3fb; font-family:'Geist',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:#21173A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f3fb;">
    <tr><td align="center" class="container" style="padding:56px 24px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%;">

        <tr><td style="padding-bottom:32px;">
          <p style="margin:0; font-family:'Geist Mono',ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:0.3em; text-transform:uppercase; color:#6E2ABD;">
            Aligno CRM
          </p>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <h1 class="headline" style="margin:0 0 6px; font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:42px; line-height:1.1; letter-spacing:-0.01em; color:#21173A;">
            You're on the list.
          </h1>
          <h2 class="headline" style="margin:0; font-family:'Fraunces',Georgia,serif; font-weight:500; font-size:42px; line-height:1.1; letter-spacing:-0.01em; color:#44106F;">
            We'll be in touch soon.
          </h2>
        </td></tr>

        <tr><td style="padding-bottom:32px;">
          <p style="margin:0 0 16px; font-size:16px; line-height:1.65; color:#5D5474;">
            Thanks for joining the Aligno CRM waitlist. We're putting the finishing touches on a CRM built for operators — pipeline that works the way you actually sell, AI follow-up with approval gates, and workflow automation that you can trust.
          </p>
          <p style="margin:0; font-size:16px; line-height:1.65; color:#5D5474;">
            You'll hear from us when we open access. In the meantime, no spam — just real progress.
          </p>
        </td></tr>

        <tr><td style="padding-top:8px; padding-bottom:8px;">
          <a href="https://pentridgemedia.com/labs" style="display:inline-block; padding:14px 28px; background:linear-gradient(135deg, #6E2ABD, #A855F7); border-radius:10px; font-family:'Geist',system-ui,sans-serif; font-size:14px; font-weight:600; color:#fff; text-decoration:none;">
            Explore Pentridge Labs
          </a>
        </td></tr>

        <tr><td style="padding-top:40px; border-top:1px solid rgba(68,16,111,0.12);">
          <p style="margin:24px 0 0; font-family:'Geist Mono',ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#7B7590;">
            — Aligno · A Pentridge product
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildText(): string {
  return `You're on the list. We'll be in touch soon.

Thanks for joining the Aligno CRM waitlist. We're putting the finishing touches on a CRM built for operators — pipeline that works the way you actually sell, AI follow-up with approval gates, and workflow automation that you can trust.

You'll hear from us when we open access. In the meantime, no spam — just real progress.

Explore Pentridge Labs: https://pentridgemedia.com/labs

— Aligno · A Pentridge product
`;
}
