# Messaging Center — Go-Live Checklist (Gate 5 approved 2026-08-05)

Gate 5 PASS: cleared to deploy conditional on the below. All Gate 1–5 findings closed.

## Already verified (the two "expensive if wrong" items)
- [x] **BYPASSRLS / FORCE RLS**: `012_enable_rls.sql` is already applied to prod (security incident fix), uses FORCE, app works → `project_admin` bypassrls confirmed live. The messaging migration's own REVOKE+ENABLE RLS rides the same role.
- [x] **IR-1 endpoint probe**: `/api/auth/sessions/current` returns 401 for anon key, ik_ key, and garbage — verified during remediation. IR-1 empirically closed.

## Blocking config at deploy (Vercel prod env — values captured in job wiring notes)
- [ ] `MESSAGING_TOKEN_SECRET` — ≥32 random chars, DISTINCT from ALIGNO_API_KEY + all provider creds (signs unsubscribe + campaign job tokens).
- [ ] `MESSAGING_PUBLIC_BASE_URL` — exact prod origin, byte-identical to the Twilio console URL (no trailing slash). Load-bearing for Twilio signature validation AND campaign self-invocation.
- [ ] `INSFORGE_API_KEY` = rotated ik_ key (server only); `NEXT_PUBLIC_INSFORGE_ANON_KEY` = real anon_ key. Old admin key grace ends 8/12 — confirm out of rotation. (Already set in prod from the security redeploy.)
- [ ] `RESEND_WEBHOOK_SECRET` + `RESEND_INBOUND_WEBHOOK_SECRET` — both set, distinct, rotated from dev.
- [ ] `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID` (MGceddccf…) / number +18778388671 — Pentridge prod values; webhooks pointed at PROD, not a preview.
- [ ] `MESSAGING_EMAIL_DOMAIN=contact.alignocrm.com`, `MESSAGING_REPLY_DOMAIN=contact.alignocrm.com`.
- [ ] `ALIGNO_API_KEY` set in Vercel (pre-existing agent/lead-webhook routes).

## Deploy steps
- [ ] Rehearse the updated messaging migration (now has claim_token, claimed_at, UNIQUE(campaign_id,contact_id) partial index) on a fresh InsForge branch — the unique index fails to build if dup (campaign_id,contact_id) rows exist (none in prod yet, so clean on empty).
- [ ] Apply the messaging migration to prod via `db query -- "$(cat ...)"` (NOT `db migrations up`).
- [ ] Resend: set up delivery webhook + inbound (MX on contact.alignocrm.com for reply routing) → capture the two Svix secrets.
- [ ] Deploy `feat/agent-layer` to prod (activates all webhooks). Commit the branch first.

## Twilio console (operator-only)
- [ ] Geo Permissions restricted to US/CA (highest-leverage anti-pumping control).
- [ ] Advanced Opt-Out enabled; spend alert + monthly cap configured.
- [ ] Toll-free verification APPROVED (submitted 2026-08-05, sid HHe1945d…, pending review — SMS full-volume gated on this).

## Post-deploy verification (before announcing)
- [ ] Anon-key probe → 401/empty on contacts/deals/api_keys AND the 6 messaging tables.
- [ ] Forged-cookie request to a messaging route → 401.
- [ ] One real inbound email + one real inbound SMS end-to-end; confirm the iframe renders (residual #3) and no body/address/token in Vercel logs.
- [ ] Send a campaign to a 2-person internal audience; confirm List-Unsubscribe present on it and absent on a 1:1 reply.

## LOW residuals (non-blocking, fix eventually)
- token.ts lacks `import "server-only"` (no leak path; one line).
- internal-auth.ts dev auto-authorize branch (inert in prod; remove eventually).
- frame-src 'self' vs srcdoc — 30-sec browser check on first real inbound email.

Recommendation: keep messaging routes behind Deployment Protection until the deploy config above is green.
