# Coordinated Security Redeploy — Execution Runbook

**Deadline:** 2026-08-12 02:51 UTC — the burned admin key's grace expires. Prod
authenticates with it (browser + server), so **production breaks at that moment**
unless this redeploy ships first. Today is 2026-08-05 → ~7 days.

**Run this WITH the user watching** (it applies RLS to prod, rotates JWT_SECRET =
logs all users out, and expires the old key). Do not run autonomously.

Secret VALUES are never written in this file. Source of truth: local `.env.local`
(the new `anon_` and `ik_` keys are already there) and the InsForge/Resend
dashboards. Redact when echoing.

---

## Pre-flight decisions (confirm with user before step 1)

- [ ] **What deploys?** The security fix (session.ts + client/server split) is
  UNCOMMITTED on `feat/agent-layer`, intermixed with the dormant messaging
  Phase 1 code. Options: (A) commit + deploy the whole branch — messaging code
  ships but is dormant (no routes wired, migration unapplied, tables absent so
  its queries are unreachable); simplest, and it's the exact tree that passed
  260 tests + clean build. (B) cherry-pick the security files onto main. **Rec: A.**
- [ ] **Deploy target:** merge `feat/agent-layer` → `main` (prod tracks main), or
  promote a branch deployment. Confirm which the Vercel project uses.
- [ ] **Timing:** pick a low-traffic window; the 3 users get logged out (JWT_SECRET).
- [ ] **Resend key rotation:** decide whether to mint a NEW Resend API key in the
  Resend dashboard (true rotation) vs. leave it (values were never dumped via
  /api/secrets — see incident notes). If rotating, it must be updated in BOTH
  Vercel env AND the InsForge `RESEND_API_KEY` secret.

## Current prod Vercel env (recon 2026-08-05)

Present: `EMAIL_FROM`, `RESEND_API_KEY`, `INSFORGE_PROJECTS_CONFIG`,
`PENTRIDGE_ADMIN_API_KEY`, `NEXT_PUBLIC_INSFORGE_ANON_KEY` (= burned admin key!),
`NEXT_PUBLIC_INSFORGE_URL`, `TRIGGER_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`.
**Missing (must add):** `INSFORGE_API_KEY`.
Note: `INSFORGE_PROJECTS_CONFIG` also embeds the burned key + 3 other projects'
admin keys (dead config, unused in code — clean up separately).

InsForge platform secrets to rotate (via `insforge secrets` / dashboard, NOT
Vercel): `JWT_SECRET`, `SMTP_PASSWORD`, `CAL_WEBHOOK_SECRET`, and `RESEND_API_KEY`
(if rotating — lives in both places).

---

## Ordered steps

### 1. Commit the fix (needs user OK to commit)
- [ ] `git add -A` the security + messaging Phase 1 work on `feat/agent-layer`,
  review `git status`, commit. (Confirm `.env.local`, `.insforge/project.json`,
  `scripts/rls-check.mjs` are gitignored — they are.)

### 2. Update Vercel env (BEFORE deploying)
- [ ] `vercel env rm NEXT_PUBLIC_INSFORGE_ANON_KEY production` then
  `vercel env add NEXT_PUBLIC_INSFORGE_ANON_KEY production` → paste the real
  `anon_` value (from `.env.local`).
- [ ] `vercel env add INSFORGE_API_KEY production` → paste the new `ik_` value
  (from `.env.local`). Server-only; no NEXT_PUBLIC prefix.
- [ ] (If rotating Resend) update `RESEND_API_KEY` in Vercel to the new value.

### 3. Apply RLS to prod DB — BEFORE the deploy (zero-downtime ordering)
Why before: the running build uses the admin key (BYPASSRLS), so enabling RLS
changes nothing for it — no downtime. Deploy-first would put the public anon key
against an RLS-off DB (the original exposure, fresh credential).
- [ ] Confirm `.insforge/project.json` has the NEW key (done 2026-08-05 re-link).
- [ ] `npx @insforge/cli db migrations up` (NOT `db query` — it rejects BEGIN/COMMIT
  and mis-parses leading `--`). Applies `012_enable_rls.sql`.
- [ ] Verify catalog, not exit code: `db query "SELECT count(*) FROM pg_class WHERE relrowsecurity"` → expect 30.
- [ ] Verify with the real `anon_` key (scripts/rls-check.mjs): contacts/deals/
  api_keys → `42501 permission denied`. `/api/auth/public-config` still 200.
- [ ] Run the §5.1 residual-grant audit → expect exactly `link_clicks → INSERT`
  for anon and authenticated, nothing else.

### 4. Rotate InsForge platform secrets
- [ ] `JWT_SECRET` — rotate (logs everyone out). `SMTP_PASSWORD`,
  `CAL_WEBHOOK_SECRET` — rotate. `RESEND_API_KEY` if decided. Via
  `insforge secrets update <k> --value <v>` or the dashboard.

### 5. Deploy the new build
- [ ] Merge `feat/agent-layer` → `main` (or the confirmed target) and let Vercel
  build, OR `vercel --prod`. This build inlines the `anon_` key only.

### 6. Post-deploy verification
- [ ] Fetch a prod chunk, grep: **zero `ik_` tokens**, `anon_` present.
- [ ] App loads; sign in works (users re-auth after the JWT_SECRET rotation).
- [ ] Smoke-test the `link-stats` edge function: POST with the correct `STATS_KEY`
  → expect `{ok:true}` (it uses ANON_KEY + a SECURITY DEFINER rpc; 012 leaves
  function EXECUTE for anon intact, so it survives — verify, don't assume).
- [ ] Confirm at least one **rollback-capable deployment built with the NEW keys**
  now exists (pre-rotation deployments bake in the old key and become useless
  rollback targets after 8/12).

### 7. Expire the old key (final — closes the exposure)
- [ ] Only after prod is verified healthy on the new keys:
  `npx @insforge/cli secrets rotate api-key --grace-hours 0` (or dashboard) to
  kill the burned `ik_53d34…` immediately. Re-run scripts/rls-check.mjs with the
  OLD key → expect 401/failure.

---

## Rollback plan
- If step 5/6 fails: redeploy the last known-good deployment **that was built with
  the new keys** (see 6, last box). A pre-rotation rollback restores the burned
  key in the bundle and (after 8/12) authenticates with a dead key.
- RLS apply (step 3) rollback: `012` is additive; if it breaks server reads
  unexpectedly, `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` per table restores
  prior behavior (should not be needed — rehearsed clean, admin has BYPASSRLS).

## Ongoing control (post-redeploy, recurring)
- Run the residual-grant audit (§5.1) before every schema-touching deploy.
  Dashboard/table-API-created tables can silently reintroduce anon grants that no
  migration can revoke; the audit is the only durable detection.

## Not in this redeploy (deferred)
- Messaging env (`TWILIO_*`, `MESSAGING_*`, token secrets) — added when messaging
  Phase 2+ ships.
- The messaging migration (`20260805120000_messaging-center.sql`) — its RLS block
  must be branch-rehearsed before it applies (note in its header).
