# Remediation plan — IR-1 (session forgery) and IR-2 (database exposure)

**Owner:** secfix agent. **Status:** design + partial local implementation.
**Baseline:** branch `feat/agent-layer`, live project `AlignoCRM` (`https://uvf4r7ds.us-east.insforge.app`), inspected 2026-08-05.
**Nothing in this document has been applied to the live database.** Every live-side step is listed in §6 awaiting the user's sign-off.

> **Update 2026-08-05, post-rotation.** The admin key has been rotated by the team lead with user authorization (`insforge secrets rotate api-key --grace-hours 168`). The leaked key keeps working until **2026-08-12 02:51**, so production is not broken during the window. Local `.env.local` now carries the real anon key and the new admin key. **RLS is now the remaining data-exposure fix** — see §3.1.

---

## 0. The finding that reframes IR-2

IR-2 is recorded as "RLS policies exist but were never enabled; the DB is reachable with a public key." That is true but it is not the actual vulnerability, and fixing it as written would not have closed the hole.

**`NEXT_PUBLIC_INSFORGE_ANON_KEY` does not contain an anon key. It contains the InsForge project *admin* API key.**

Verified 2026-08-05:

| Check | Result |
|---|---|
| Value in `.env.local` vs `api_key` in `.insforge/project.json` | byte-identical (`ik_53d34…`, 35 chars) |
| Key format | `ik_` opaque admin token. This project's real anon key is `anon_…` (69 chars) — **not** a JWT; see the correction below |
| Present in production browser bundle | yes — `https://www.alignocrm.com/_next/static/chunks/app/layout-cc67a7b9b6a4c3cf.js` |
| `GET /api/auth/users` with that key | **200 — full user list, all 3 accounts with email addresses** |
| Same request with no auth | 401 `"No admin token provided"` — confirming the key *is* the admin token |
| `GET /api/secrets` | 200 — project secrets inventory |
| `GET /api/database/tables`, `/api/functions`, `/api/storage/buckets`, `/api/metadata` | 200 |

The consequence: the anonymous `.select()` that returned real rows was not "RLS is off." It was **`project_admin` access**. Per InsForge's access-control model there are three roles — `anon`, `authenticated`, and `project_admin` — and `project_admin` **bypasses RLS by design**. Enabling RLS would have produced a clean-looking verification against the anon role while the published key continued to read and write everything.

This changes the fix order. IR-2's stated order ("enable RLS, verify anonymously, then rotate `api_keys`") is backwards. **Credential rotation is step one.** RLS is still required — it is what makes the *real* anon key safe to publish — but it is the second layer, not the fix.

A second-order consequence worth stating plainly: because every database call the app has ever made ran as `project_admin`, **the application has never executed against RLS**. Expect the enablement step to surface breakage that no amount of code review predicts.

### Correction: InsForge key formats on this project

An earlier draft of this document asserted that the anon key is a JWT (`eyJ…`), on the strength of the InsForge SSR docs. That is wrong for this project and it made a code guard useless. Measured directly from `.env.local`:

| Variable | Prefix | Length |
|---|---|---|
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` (real anon key) | `anon_` | 69 |
| `INSFORGE_API_KEY` (new admin key) | `ik_` | 67 |
| the leaked admin key (old) | `ik_` | 35 |

Two things follow. The guard in `server.ts` originally rejected `eyJ…`, which nothing on this project ever produces — dead code that looked like a control. It now *positively asserts* `ik_` (§2). And note the new admin key is 67 chars where the old was 35, so length alone does not distinguish key types; only the prefix does.

### What the exposure did and did not reach

Checked read-only after rotation: the new anon key is correctly **denied** on `/api/auth/users` (401), confirming that endpoint is admin-gated and is closed by rotation alone. `/api/secrets` returns secret **names with zero populated values**, so app secret values were not trivially dumped through that endpoint. That narrows the blast radius but does not eliminate it — a full `project_admin` could plausibly reach those values by another route, so `JWT_SECRET`, `RESEND_API_KEY`, and `SMTP_PASSWORD` remain **rotate-recommended**, not cleared.

---

## 1. IR-1 — server-side session validation

### The bug

`getAuthenticatedUser()` read the `insforge-user` cookie, `JSON.parse`d it, checked that `id` and `email` were strings, and returned it. The `insforge-session` token was checked for presence only.

This is not just the app's own code. Two vendor-level paths have the same weakness, which is why the fix has to live at the read side:

- `@insforge/nextjs`'s own `auth()` helper (`dist/esm/server/auth.js`) does exactly the same thing — cookie in, identity out, no validation.
- The cookie-*writing* route is worse. `createAuthRouteHandlers`' `sync-token` action (`dist/esm/api/route-handlers.js:117-133`) sets the auth cookies straight from the request body whenever the body supplies `user.id` and `user.email`, and only falls through to real token validation when the body omits them. So the endpoint that mints the session cookie does not verify the token either.

Fixing the write side would mean patching a dependency. Fixing the read side is sufficient and is under our control.

### The correct InsForge call

`GET /api/auth/sessions/current` with `Authorization: Bearer <token>`. Verified against the live backend:

| Token | Response |
|---|---|
| garbage string | `401 {"error":"AUTH_UNAUTHORIZED","message":"Invalid token"}` |
| the project admin key | `401` — **an admin key cannot impersonate a user here**, which is the property we want |
| absent | `401 {"error":"AUTH_INVALID_CREDENTIALS","message":"No token provided"}` |
| valid user JWT | `200 { user: { id, email, emailVerified, providers, createdAt, updatedAt, profile, metadata } }` |

This is not a guess: `src/app/api/profile/route.ts:28` already calls this exact endpoint successfully, and the response shape matches `getCurrentSessionResponseSchema` in `@insforge/shared-schemas`.

Two alternatives were considered and rejected. Local JWT verification would be faster but InsForge exposes no JWKS endpoint (checked `/.well-known/jwks.json`, `/api/auth/jwks`) — tokens are HS256 against a `JWT_SECRET` that is a *reserved* project secret, so local verification would mean copying the backend's signing key into the app, adding a second catastrophic-blast-radius secret to save a cached round trip. `insforge.auth.getCurrentUser()` from the SDK looks right but is not: with `edgeFunctionToken` set, the SDK stores `{ accessToken, user: {} }` in its token manager (`dist/index.mjs:1856-1861`) and `getCurrentUser()` returns that stored value **without any network call**. It would validate nothing.

### The implementation — DONE LOCALLY

`src/lib/auth/session.ts` is rewritten. Behaviour:

- Reads only `insforge-session`. The `insforge-user` cookie is no longer an input at all; `parseUserCookie` is deleted (no remaining references).
- Calls `GET /api/auth/sessions/current` and derives `id`, `email`, `profile`, `metadata` from the validated response.
- Caches on `sha256(token)`, never on the raw token. Positive results 30s, rejections 5s (so a revoked session stops working promptly while still blunting brute force). Cache is bounded at 500 entries with oldest-first eviction, because a warm serverless instance is long-lived.
- **Fails closed.** A network error or a 5xx returns `null` *and is not cached*, so the next request retries rather than pinning a denial. Only an explicit 401/403 is cached as a rejection. Failing open here would reintroduce the exact bug being fixed.
- Exports `validateSessionToken(token)` for callers that hold a token directly, and `clearSessionCache()` for tests.

`requireTenantContext()` and `getOptionalTenantContext()` in `src/lib/auth/tenant.ts` need no change — they call `getAuthenticatedUser()` and inherit the fix.

**Tests:** `src/__tests__/auth/session.test.ts`, 10 cases, all passing. The load-bearing one supplies both cookies the way the IR-1 exploit does — a forged `insforge-user` naming a victim, plus an arbitrary session token — and asserts the returned identity comes from the validated response, not the cookie.

### Residual risk

A 30-second cache means a session revoked at InsForge stays valid in this app for up to 30s. That is a deliberate trade; drop `VALID_TTL_MS` to 0 if the messaging center's spend exposure makes it unacceptable, at the cost of one HTTP round trip per authenticated request.

---

## 2. IR-2 — architecture

### Recommendation: a server-side admin client (option i), not per-user edge tokens (option ii)

**Recommended.** Split the single shared client into two:

- `src/lib/insforge/client.ts` — browser only, real anon key. Used by exactly 6 modules, all of which call `insforge.auth.*` and nothing else.
- `src/lib/insforge/server.ts` — server only, `INSFORGE_API_KEY` (`project_admin`). Used by the other 47 modules.

Justification specific to this codebase:

1. **Most server callers have no user to borrow a token from.** The 47 modules include `src/trigger/*` (Trigger.dev background tasks), `src/lib/workflows/executor.ts`, `src/lib/events/emitter.ts`, and the whole future webhook surface. These run with no session by construction. Per-user edge tokens have nothing to offer them, so option (ii) would need option (i) alongside it anyway — it is strictly more work, not an alternative.

2. **The org bootstrap is chicken-and-egg under user-token RLS.** `createOrganizationForUser()` (`src/lib/data/organizations.ts:165`) inserts into `organizations` and `organization_members` for a user who is not yet a member of anything. Under `is_org_member(organization_id)` with a user token, the `WITH CHECK` on both inserts fails — the user cannot be a member of the org being created. That path requires elevated access regardless of what the rest of the app does.

3. **The data layer has no request context to thread a token through.** The 47 modules are plain exported functions (`getContacts(workspaceId)`, `createDeal(...)`) called from routes, tasks, and cron. Option (ii) means adding a token parameter to every signature and every call site, or introducing async-local-storage request context. That is a large, risky refactor whose only benefit over option (i) is defence against a bug in our own tenant filtering — which the RLS policies in §3 provide anyway, once anything does use a user token.

4. **The browser needs no database access at all.** Static analysis of all 54 `"use client"` modules found zero `.database.from(...)` calls. There is no user-facing query path that per-user tokens would secure, because there is no browser query path.

The honest cost of option (i): server routes keep bypassing RLS, so app-level `workspace_id` / `organization_id` filtering remains load-bearing — a missed `.eq()` in a server route is still a cross-tenant leak, exactly as today. RLS does not save us there. That is what REQ-SEC-15's per-route checklist is for, and it is why option (ii) stays on the table as a later hardening for genuinely user-scoped read paths. It is a follow-up, not a prerequisite.

### The implementation — DONE LOCALLY

`src/lib/insforge/server.ts` (new):

- Lazily constructs the client on first property access via a `Proxy`, so a missing env var fails at call time with a named error rather than at module load. Verified: `next build` succeeds with `INSFORGE_API_KEY` entirely unset.
- **Asserts `INSFORGE_API_KEY` starts with `ik_`**, with a specific message when the value is an `anon_` key. Putting the anon key here would silently downgrade every server route to anonymous access the moment RLS is on — a failure that surfaces as "queries return nothing", not as an error.
- Carries a comment stating that this client bypasses RLS and callers keep their own tenant filtering.

`src/lib/insforge/client.ts` gains the reciprocal guard: it **throws if `NEXT_PUBLIC_INSFORGE_ANON_KEY` starts with `ik_`**. That is the check that would have caught the 2026-08-05 incident at build time instead of in production. Whatever sits in that variable is inlined into the JS bundle by definition, so an `ik_` value there is a full backend compromise; failing the build is the correct response. Both guards were exercised directly: `ik_2d…` accepted server-side, `anon_…` and `eyJ…` rejected server-side, `anon_…` accepted client-side, and the leaked `ik_53…` rejected client-side.

**`INSFORGE_API_KEY` must hold the NEW admin key minted at rotation — never the `ik_53d34…` value that shipped in the browser bundle.** That value is public and must not be reintroduced anywhere, under any variable name. The variable is server-only and must never carry a `NEXT_PUBLIC_` prefix. Note the limit of the guard: it asserts the `ik_` *format*, which the burned key also satisfies. It cannot tell a live admin key from a revoked one, so not-reusing the old value is on the operator.

Locally this is now satisfied — `.env.local` holds the new `ik_` key. **Vercel is not yet updated**; that is step 2 in §5 and is user-gated.

Import rewrite: 47 server-side modules moved from `@/lib/insforge/client` to `@/lib/insforge/server`; the 6 `"use client"` modules were left alone. The change is import-path-only — verified by diffing every non-import line.

**Verification performed:**

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 39 files, 259 tests, all passing.
- Static reachability: no `"use client"` module reaches `src/lib/insforge/server.ts` through any import chain (54 client entrypoints traversed transitively).
- `INSFORGE_API_KEY` appears in exactly one file, `server.ts`.
- **Bundle proof.** Built production with distinct sentinel values (`INSFORGE_API_KEY=ik_SENTINEL_SERVER_ONLY_KEY_9f3a`, `NEXT_PUBLIC_INSFORGE_ANON_KEY=eyJSENTINELANONKEY7b21`). The server sentinel does **not** appear anywhere in `.next/static/`. The anon sentinel appears only in the three `(auth)` page chunks — previously the key was in `app/layout`, i.e. on every page.

### Not done: `import "server-only"`

`server.ts` should open with `import "server-only"` so that a future accidental import from a client component becomes a build error instead of a silent key leak. The `server-only` package is not currently a dependency. Adding it is a one-line `package.json` change plus one import; I left it out rather than mutate dependencies mid-flight while other agents are working the same tree. **Recommend adding it before this merges.**

---

## 3. RLS enablement, keyed to the live schema

Migration written (not applied): `src/lib/db/migrations/012_enable_rls.sql`.

### 3.1 Why this is now the critical path

Verified read-only after rotation: **the new `anon_` key still reads `contacts` (HTTP 200)**, because RLS is off and InsForge grants the `anon` role broad DML on public tables by default. Rotation closed the admin-key hole; it did nothing for this one.

The anon key is public *by design* — it is meant to ship in the browser bundle. So with RLS off, shipping the correctly-configured app still exposes contact PII to anyone who reads the bundle. That inverts the usual ordering: **RLS must land before or together with the production redeploy**, not after it. A redeploy that installs the proper anon key while RLS is still off is not a fix; it is the same exposure with a better-looking credential.

Verification is a single command, and it must use the `anon_` key — never `ik_`, which bypasses RLS and would produce a false pass. Expect **empty**, not a row.

### Where migration 009 is wrong about the live database

| 009 assumes | Live reality |
|---|---|
| tenancy anchored on `workspace_id` in places | `workspace_id` is **TEXT** on every table that has it, **UUID** on `api_keys` alone. `workspaces` exists but has **0 rows**. Not a usable anchor. |
| 22 tenant tables | 30 tables live. Five 009 never lists: `apps`, `cal_booking_events`, `link_clicks`, `testimonials`, `testimonial_requests`. |
| policies are missing | 009's **31 policies already exist on live**. They are inert purely because no table has RLS enabled. |
| `organization_id` is uniformly UUID | true except `apps.organization_id`, which is **TEXT**. |

`organization_id UUID` is the right anchor: present and populated on every tenant table.

### What the migration does

1. **Hardens the helpers.** `is_org_member()` / `is_org_admin()` are recreated with `SET search_path = pg_catalog, public, pg_temp` and schema-qualified references. 009 created them `SECURITY DEFINER` with a mutable `search_path`, which is a privilege-escalation vector on a function that runs as owner on every policy check. `auth.uid()` is wrapped as `(SELECT auth.uid())` so it evaluates once per query rather than per row. Adds `idx_org_members_user_org_status`.
2. **Adds the missing policy** for `apps`, casting its TEXT `organization_id`. `cal_booking_events` has no `organization_id` at all and 0 rows — it gets RLS with no anon/authenticated policy, i.e. deny-all to those roles, reachable only by the server client.
3. **`ENABLE` *and* `FORCE` row level security** on 29 tables. `FORCE` matters: without it the table owner bypasses policies. `project_admin` still reaches the data via `BYPASSRLS`, which is the intended server path. `link_clicks` already has RLS on with its own INSERT-only policy for the click-tracking edge function and is left untouched.
4. **Revokes `anon` and `authenticated` DML on every public table** except `link_clicks`. **This is the control that actually closes IR-2.** InsForge grants broad DML to those roles by default so policies can arbitrate; with the anon key published in the browser by design, those grants *are* the exposure. The app does not need them — no browser module queries the database. The policies underneath are the safety net for the day someone adds a per-user read path, so that path starts tenant-scoped rather than open.

The migration is idempotent against 009's existing policies and wrapped in a transaction, with the verification queries and a full rollback block in trailing comments.

### Blocker: orphan rows must be resolved first

Some rows have `organization_id IS NULL`. Under `is_org_member(organization_id)`, `NULL` yields `NULL`, the policy denies, and the rows become invisible — indistinguishable from data loss for the user.

| Table | Orphan rows | Their `workspace_id` |
|---|---|---|
| `stages` | 6 | (child of pipeline) |
| `tags` | 3 | 2× `default`, 1× `pentridge` |
| `contacts` | 2 | `default` |
| `contact_tags` | 2 | (child of contact) |
| `activity_logs` | 2 | `default` |
| `tasks` | 2 | `default` |
| `pipelines` | 1 | `default` |

These sit in the invisible fallback workspace (IR-4's `FALLBACK_WORKSPACE_ID = "default"`), plus one in `pentridge`. Neither value matches any organization's `default_workspace_id` — every real org uses an `org_<hex>` id. **So there is no derivable owner and the backfill cannot be automated.** The user has to say whether these rows get assigned to a specific organization or deleted. This is a prerequisite for step 5 in §5, and it is on the sign-off list.

Note also that `organizations` holds 12 rows for 3 users — the auto-create-on-signin path in `getTenantContextForUser()` has been minting a workspace per session. Not a security issue, but it will make the post-RLS verification noisy.

---

## 3.2 Branch rehearsal — executed 2026-08-05, result: PASS

Ran on a real InsForge backend branch (`rls-test`, appkey `uvf4r7ds-j99`), created with **`--mode full`** so it carried a copy of production data. `schema-only` would have been the wrong choice: with an empty database "anon returns empty" passes for the wrong reason.

**Controlled baseline.** Before applying anything, the branch's own `anon_` key read `contacts` 31, `deals` 17, `organization_members` 16, `api_keys` 9 — identical to production. The branch reproduces the vulnerability exactly, so the after-state means something.

**After applying `012_enable_rls.sql`:** 30/30 public tables have RLS enabled, 29 with `FORCE` (`link_clicks` keeps its pre-existing config).

| Probe | Result |
|---|---|
| anon `SELECT` on contacts, deals, organization_members, api_keys, organizations, tasks, tags, workflows, testimonials, apps | **all denied — Postgres `42501` permission denied** |
| anon `INSERT` into contacts | denied, `42501` |
| anon `GET /api/auth/public-config` | 200 — sign-in still works |
| anon `GET /api/auth/users` | 401 — stays admin-gated |
| admin `SELECT` × 10 tables | full row counts, unchanged |
| admin `INSERT` into `business_events` | row count 47 → 48, confirmed landed |
| real data layer (`getContacts`, `getDeals`, `getTasks`, `getTenantContextForUser`, create→update→delete round-trip) | **4/4 pass** against the RLS branch |
| real HTTP route `GET /api/public/testimonials/[token]` via `next dev` | **200 with correct data**, no server errors |

Note the denial is `42501`, not an empty result set. That is the `REVOKE` in step 4 of the migration stopping the query at the privilege layer before RLS policies are even evaluated — a stronger and more debuggable outcome than silent emptiness.

**Why the admin client keeps working under `FORCE`:** `project_admin` has `rolbypassrls = true` (verified on `pg_roles`). It also *owns* the tables, which is why `FORCE` is worth having — without it, ownership alone would exempt it. `BYPASSRLS` is what keeps server routes functioning, and it is a role attribute, not a policy, so no policy change can accidentally revoke it.

### Two CLI gotchas found in rehearsal, now documented in the migration header

1. `insforge db query` **rejects transaction control** — `BEGIN;`/`COMMIT;` produce `Error: Transaction control statements are not allowed.` The explicit transaction has been removed from the migration; `db migrations up` wraps the file in its own, so atomicity is preserved.
2. `insforge db query` **parses a leading `--` SQL comment as a CLI flag** (`error: unknown option '-- 012_enable_rls.sql …'`). Pass an argument separator: `insforge db query -- "$(cat …)"`. This one fails loudly, but it initially looked like the migration had applied when it had not — always re-check `pg_class.relrowsecurity` rather than trusting the command's exit.

### Caveat this rehearsal makes concrete

The `REVOKE` covers `authenticated` as well as `anon`. That is correct today because no browser code queries the database, but it means a future per-user read path will fail with `42501` until the matching `GRANT` is restored for that table. The policies are already in place to scope such a path correctly; the grant is the deliberate switch that turns it on.

**Cleanup state:** the temporary integration test is deleted, the branch `rls-test` has been **deleted** (never merged — merging would have applied RLS to production), the CLI context is back on the parent, and parent RLS is confirmed still off: `rls_on=1, rls_off=29`, the 1 being the pre-existing `link_clicks`. **Production was not touched at any point.**

### 3.3 Second pass — security-audit findings, fixed and re-verified on the branch

Four audit findings landed on this migration. All four are addressed; two changed the SQL materially.

**#8 (HIGH) — the REVOKE sweep missed views.** It filtered `relkind = 'r'`, so views, materialized views, foreign tables, and partitioned tables were skipped. This is a hole rather than a gap: a view without `security_invoker = true` executes with its *owner's* privileges and reads straight through RLS on its base tables, so revoking the table while leaving a view over it preserves the anonymous read path intact. Widened to `relkind IN ('r','v','m','f','p')`. Measured on the branch: `pg_views` = 0, `pg_matviews` = 0, foreign/partitioned = 0 — so the exposure was **latent, not live**. Fixing it anyway, because the trap springs on the first view anyone adds, which is precisely when nobody re-reads this file. Sequences are now revoked from `authenticated` as well as `anon`.

The explicit view enumeration, run on the branch after the migration and immediately before the branch was destroyed: `pg_views` → none, `pg_matviews` → none, foreign/partitioned → none. Final grant state across all of `public` reduced to exactly `link_clicks → anon: INSERT` and `link_clicks → authenticated: INSERT`.

Also tightened while in here: `link_clicks` was keeping `SELECT/UPDATE/DELETE` alongside the `INSERT` its edge function needs. RLS already denied those (its only policy is `FOR INSERT`), but a grant no policy backs is surface waiting for a future permissive policy. Now `REVOKE ALL` then `GRANT INSERT`, matching what the comment always claimed.

**#9 (HIGH) — the BYPASSRLS assumption. Confirmed correct.**

```
project_admin   bypassrls=true   super=false
anon            bypassrls=false  super=false
authenticated   bypassrls=false  super=false
table owners: project_admin
```

`project_admin` both owns every table *and* holds `BYPASSRLS`. `BYPASSRLS` is what keeps server routes working under `FORCE`; ownership alone would not, which is exactly why `FORCE` is worth setting. Confirmed empirically as well — admin reads returned full row counts and an admin insert into `business_events` moved 47→48 with `FORCE` active. **This also validates the same assumption in the messaging migration's REVOKE+ENABLE block.**

**#7 (MED) — naming and a phantom prerequisite.** Renamed `010_enable_rls.sql` → `012_enable_rls.sql` (`010_testimonials.sql` already held that prefix; `011` was taken too). The header cited a `010a_backfill_organization_id.sql` that does not exist. Rather than invent one, the header now states plainly *why* there is no backfill migration — the orphan rows map to no organization, so the owner cannot be derived and it is a user decision — and gives the gate query that must return zero rows before applying. A template migration would have been worse than a dangling reference: someone runs `migrations up --all` and it executes with placeholder values.

**#1 (part) — `ALTER DEFAULT PRIVILEGES`. Added, but it does NOT close the hole, and the migration now says so.**

This is the one worth reading carefully. `ALTER DEFAULT PRIVILEGES` only governs objects created by the role that runs it. Every default ACL in `public` on this project belongs to role **`postgres`** (`anon=arwd, authenticated=arwd` on tables), and `project_admin` cannot touch it — `ALTER DEFAULT PRIVILEGES FOR ROLE postgres …` fails with `must be member of role "postgres"`. Measured, not assumed:

- A probe table created as `project_admin` (the SQL-migration path) came back granted to `project_admin` only, nothing for anon/authenticated. That path **already** fails safe; the added statements make it explicit rather than incidental.
- Tables created through the InsForge dashboard or table API may be created as `postgres` and **will** inherit anon/authenticated grants. That path cannot be closed from a migration at all.

So the durable control is a recurring audit, not this statement. The migration carries the audit query; expect only `link_clicks → INSERT`.

**Post-fix re-verification on the branch:** anon `anon_` key denied on all ten probed tables (`permission denied`, no readable path); residual grants across all of `public` reduced to exactly `link_clicks → anon: INSERT` and `link_clicks → authenticated: INSERT`; admin reads unchanged across ten tables; admin write confirmed landing; real HTTP route `GET /api/public/testimonials/[token]` still 200 with correct data and no permission errors in the server log.

**Coverage caveat:** the branch was created before the messaging migration, so `conversations` / `messages` and the other four messaging tables do not exist on it (`relation "public.messages" does not exist`). Their RLS was **not** exercised by this rehearsal — it rests on the messaging migration's own self-contained block, whose `BYPASSRLS` premise is now confirmed but whose SQL has not been run against real data here.

---

## 4. What is not fixed by any of this

Stated so it is not mistaken for covered:

- **`GET /api/auth/users` is an InsForge platform endpoint, not a `public` table.** Postgres RLS does not govern it. Once the admin key is rotated out of the browser, an anon key cannot reach it (verified: it demands an admin token). But no policy in `012_enable_rls.sql` protects it — rotation is the only control.
- **Server routes still bypass RLS**, by design (§2). Tenant isolation between logged-in users continues to depend on app-level filtering.
- **IR-3 / IR-4** (`internal-auth` dev auto-authorization; global key resolving to the `default` workspace) are untouched here.

---

## 5. Rollout — ordering, verification, rollback

Steps 1-4 are live-credential and live-database operations requiring the user's sign-off. Steps 0 and 3 are already done locally.

| # | Step | Verify | Rollback |
|---|---|---|---|
| 0 | **Done.** App-side split + session validation on branch. | typecheck, 259 tests, bundle sentinel grep (§2) | `git revert` |
| 1 | ~~**Rotate the InsForge project API key.**~~ **DONE 2026-08-05** via `insforge secrets rotate api-key --grace-hours 168`. The leaked `ik_53d34…` stays valid until **2026-08-12 02:51**, so prod keeps running on it meanwhile — which also means **the exposure is still live until that grace expires**. | new anon key correctly 401s on `/api/auth/users` | grace window is the rollback; do not expire early without a verified redeploy |
| 2 | **Install the new keys in Vercel** — real `anon_` key in `NEXT_PUBLIC_INSFORGE_ANON_KEY`, new `ik_` key in server-scoped `INSFORGE_API_KEY`, all environments. Local `.env.local` is already done. **Must not ship before step 6** (§3.1). | sign-in works; `curl` with the anon key against `/api/auth/users` → 401 | restore previous env values, redeploy |
| 3 | **Deploy the app-side split** and confirm in production. This is migration 009's own precondition, honoured. Ship it with step 6, or ship it first and apply RLS immediately after — do not leave a redeployed prod sitting on the public anon key with RLS off (§3.1). | dashboard loads, contacts/deals/tasks read and write, sign-in and invite accept work | Vercel instant rollback to the prior deployment |
| 4 | **Rotate every `api_keys` row**, plus `JWT_SECRET` / `RESEND_API_KEY` / `SMTP_PASSWORD` (rotate-recommended — `/api/secrets` exposed names but no values, so this is precautionary rather than confirmed-compromised). Rotating `JWT_SECRET` invalidates every live session; schedule it. | old per-workspace keys rejected by `/api/agent/*` | re-issue; these are app-generated |
| 5 | **Resolve the orphan rows** (§3) per the user's decision. | `SELECT count(*) … WHERE organization_id IS NULL` → 0 on all seven tables | run inside a transaction; snapshot the affected rows to a temp table first |
| 6 | **Apply `012_enable_rls.sql`.** The branch rehearsal is **done and passed** (§3.2) — `--mode full`, real data, app verified against it. Apply via `insforge db migrations up`, not `db query`. | the migration's VERIFY block: zero tables with RLS off, and the `anon_` key denied on `contacts`. Rehearsal precedent: `42501`, not empty | the rollback block in the migration's trailing comment (re-grant, then `NO FORCE` / `DISABLE`) |
| 7 | **Re-run the original IR-2 exploit** with the new anon key and no session. | `.select()` on `contacts`, `deals`, `organization_members`, `api_keys` → empty or permission error, never a real row | — |

Two ordering rules worth stating explicitly, both learned from §0:

- **Rotation before RLS.** Rotating after would leave the published admin key working against a database that now *looks* protected.
- **Verify with the real anon key, never with the admin key.** A verification run with an `ik_` token proves nothing, because `project_admin` bypasses RLS. This is precisely how the original assessment reached the wrong conclusion about the cause.

---

## 5.1 Ongoing control — residual-grant audit (not a one-time step)

Add to the go-live checklist **and** to every gate that touches schema. This is the durable half of finding #1, because `ALTER DEFAULT PRIVILEGES` cannot close the dashboard/table-API path (§3.3).

```sql
SELECT table_name, grantee, string_agg(privilege_type, ',') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
GROUP BY 1, 2 ORDER BY 1, 2;
```

**Expected output, forever:** exactly two rows — `link_clicks → anon: INSERT` and `link_clicks → authenticated: INSERT`. Anything else is a table that reintroduced browser-role access.

Run it: after every migration, after anyone creates a table in the InsForge dashboard, and at each phase gate. A table created through the dashboard or table API may be created as role `postgres` and **will** inherit `anon=arwd, authenticated=arwd` from `postgres`'s default ACL, which no migration we can run is able to prevent — `project_admin` is not a member of `postgres`. Detection is the control. Remediate a hit with `REVOKE ALL ON public.<table> FROM anon, authenticated;` plus `ENABLE`/`FORCE ROW LEVEL SECURITY`.

## 5.2 Redeploy runbook notes

Four things that are not obvious from the step table and are easy to get wrong.

**1. The old key's expiry is a production deadline, not a cleanup task.** Production currently authenticates — browser *and* server — with the burned `ik_53d34…` key, because Vercel has not been updated. When the 7-day grace closes at **2026-08-12 02:51**, that key stops working and **production breaks**, security fix or not. The redeploy is on a clock. If it cannot land before then, the grace has to be extended rather than allowed to lapse.

**2. Apply the RLS migration BEFORE deploying, not after.** This is counter-intuitive and it removes a window entirely. The currently-deployed build authenticates with the admin key, which holds `BYPASSRLS` — so **enabling RLS on production changes nothing for the running app**. Nothing breaks, no downtime. Deploying first and applying RLS second would instead put the real (public-by-design) anon key live against an RLS-off database for however long the gap lasts, which is the §3.1 exposure with a fresh credential. Apply → verify with the `anon_` key → then deploy.

**3. The Vercel-rollback escape hatch closes on 8/12.** `NEXT_PUBLIC_*` values are inlined at build time, so rolling back to any pre-rotation deployment restores a bundle with the **old** key baked in. That works today and stops working when the grace expires. Before the deadline, make sure at least one rollback-capable deployment exists that was built with the *new* keys — otherwise the rollback plan silently evaporates.

**4. Smoke-test the `link-stats` edge function after applying.** It is the only non-app consumer of the anon key: it authenticates with `ANON_KEY` and calls `insforge.database.rpc("get_link_stats")`. It survives the migration, but only because of two things that were verified rather than assumed — `get_link_stats` is `SECURITY DEFINER` owned by `project_admin` (so it reads through RLS), and `012` deliberately does **not** revoke function `EXECUTE` from `anon`. An earlier draft of the migration did revoke it; that would have broken this function in production with a 401 that looks nothing like a permissions change. Verify with a `POST` carrying the correct `STATS_KEY` and expect `{ ok: true }`.

## 6. Done locally vs. awaiting sign-off

### Done and verified on `feat/agent-layer`

- `src/lib/auth/session.ts` — rewritten; validates `insforge-session` against `GET /api/auth/sessions/current`, TTL cache keyed on token hash, fails closed, `insforge-user` discarded as an input.
- `src/lib/insforge/server.ts` — new server-only admin client, lazy, with an anon-JWT guard.
- 47 server modules re-pointed to it; the 6 `"use client"` modules left on the browser client. Import-path-only.
- `src/__tests__/auth/session.test.ts` — 10 tests including the IR-1 forged-cookie case.
- `src/lib/db/migrations/012_enable_rls.sql` — written, **not applied**.
- `src/lib/insforge/client.ts` — reciprocal guard rejecting an `ik_` value in the browser anon slot.
- Verification, re-run against the rotated keys: typecheck clean; 259/259 tests pass; `next build` succeeds; both guards exercised directly. **Browser bundle audit: the new admin key is absent, the old leaked key is absent, and only the `anon_` key appears (5 chunks — the auth pages and providers).**

**No credential was rotated, expired, or written by me.** `.insforge/project.json` was read only. `.env.local` was edited mid-task by me and reverted; it was subsequently updated by the team lead as part of rotation, and I have only read it since.

### Operational snag worth fixing before 2026-08-12

`.insforge/project.json` still contains the **old** `ik_53d34…` key (35 chars). That is the file the InsForge CLI authenticates with, so every `npx @insforge/cli db query` / migration command is currently running on the leaked key and will start failing the moment the grace window closes. Re-link (`npx @insforge/cli link`) so the CLI picks up the new key — otherwise step 6 of the rollout breaks at exactly the wrong time. It also means a copy of the burned key is still sitting on disk.

### Requires the user's decision or credentials

1. ~~Rotate the project API key~~ — **DONE 2026-08-05**, 7-day grace. Remaining: install the new keys in Vercel, and re-link the CLI so `.insforge/project.json` stops carrying the burned key before the grace closes.
2. **Rotate `api_keys` rows**; rotate `JWT_SECRET` / `RESEND_API_KEY` / `SMTP_PASSWORD` as a precaution — `/api/secrets` exposed names but no values, so this is prudence, not confirmed compromise. Rotating `JWT_SECRET` signs every user out, so schedule it.
3. **Decide the fate of the 18 orphan rows** across seven tables (§3) — assign to an organization, or delete.
4. **Approve applying `012_enable_rls.sql`**, ideally via an InsForge backend branch first. This is now the critical path: the anon key still reads `contacts` (§3.1).
5. **Breach-notification assessment.** The admin key was in a public bundle: three users' email addresses via `/api/auth/users`, plus all `contacts` (31 rows) and `deals` (17 rows) — third-party personal data. Whether this triggers a notification obligation is the user's call, not ours, but it must be put in front of them. Note the exposure window does not close until the grace period expires on 2026-08-12.
6. **Add `server-only`** as a dependency and import it in `server.ts` (§2).
