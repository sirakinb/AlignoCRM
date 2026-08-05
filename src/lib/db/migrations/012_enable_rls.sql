-- 012_enable_rls.sql — IR-2 remediation.
--
-- (Renumbered from 010: `010_testimonials.sql` already owned that prefix.)
--
-- DO NOT APPLY TO LIVE UNTIL:
--   1. The InsForge project API key has been rotated and the real anon key
--      (`anon_…` on this project — NOT a JWT) is what
--      NEXT_PUBLIC_INSFORGE_ANON_KEY holds.  [done 2026-08-05]
--   2. The app-side client split (src/lib/insforge/server.ts) is deployed and
--      verified in production.
--   3. The orphan `organization_id IS NULL` rows are resolved. There is no
--      backfill migration and deliberately so: those rows sit in the invisible
--      `default` workspace and map to no organization, so the correct owner
--      cannot be derived — it is a user decision (assign vs. delete), tracked
--      in tasks/security-remediation-rls-auth.md §3. Gate on this query
--      returning zero rows:
--
--        SELECT 'contacts' t, count(*) FROM contacts WHERE organization_id IS NULL
--        UNION ALL SELECT 'contact_tags', count(*) FROM contact_tags WHERE organization_id IS NULL
--        UNION ALL SELECT 'activity_logs', count(*) FROM activity_logs WHERE organization_id IS NULL
--        UNION ALL SELECT 'pipelines',    count(*) FROM pipelines    WHERE organization_id IS NULL
--        UNION ALL SELECT 'stages',       count(*) FROM stages       WHERE organization_id IS NULL
--        UNION ALL SELECT 'tags',         count(*) FROM tags         WHERE organization_id IS NULL
--        UNION ALL SELECT 'tasks',        count(*) FROM tasks        WHERE organization_id IS NULL;
--
--      Rows left NULL become invisible to every non-admin role once RLS is on.
--
-- Written against the LIVE schema as inspected 2026-08-05, not against
-- migration 009's assumptions. Differences that matter:
--   * `workspaces` exists but is empty; `workspace_id` is TEXT on every table
--     that has it (UUID only on api_keys). Tenancy is therefore keyed on
--     `organization_id UUID`, which is present and populated on every tenant
--     table — workspace_id is not a reliable RLS anchor.
--   * Live has five tables 009 never listed: apps, cal_booking_events,
--     link_clicks, testimonials, testimonial_requests.
--   * 009's 31 policies already exist on live. They are inert only because no
--     table has RLS enabled. This migration is idempotent against them.
--
-- Design note: the browser makes ZERO database calls in this app — the only
-- browser use of the SDK is `insforge.auth.*` (verified by static analysis of
-- every "use client" module). So the primary control here is the REVOKE: the
-- anon and authenticated roles lose database access outright. The policies are
-- the safety net for the day someone adds a per-user read path, so that path
-- starts tenant-scoped instead of open.

-- HOW TO APPLY. Two InsForge CLI gotchas, both hit during the branch rehearsal:
--   * `insforge db query` rejects transaction control — no BEGIN/COMMIT here.
--     Apply via `insforge db migrations up`, which wraps the file in its own
--     transaction, so atomicity is preserved without the explicit statements.
--   * `insforge db query` parses a leading `--` comment as a CLI flag. If you
--     do run this through `db query`, pass an argument separator:
--     `insforge db query -- "$(cat 010_enable_rls.sql)"`.

-- ---------------------------------------------------------------------------
-- 1. Harden the policy helpers.
--
-- 009 created these without a pinned search_path. A SECURITY DEFINER function
-- with a mutable search_path is a privilege-escalation vector, and these run
-- as the owner on every policy check.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = target_org_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_org_admin(target_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = target_org_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- Index the columns every policy reads.
CREATE INDEX IF NOT EXISTS idx_org_members_user_org_status
  ON public.organization_members (user_id, organization_id, status);

-- ---------------------------------------------------------------------------
-- 2. Policies for the five live tables 009 missed.
--
-- apps.organization_id is TEXT (not UUID) — cast rather than assume.
-- cal_booking_events has no organization_id at all, so it gets no
-- anon/authenticated policy: deny-all to those roles, server-only via admin.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apps'
      AND policyname = 'org_member_all'
  ) THEN
    CREATE POLICY org_member_all ON public.apps
      FOR ALL
      USING (public.is_org_member(NULLIF(organization_id, '')::uuid))
      WITH CHECK (public.is_org_member(NULLIF(organization_id, '')::uuid));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS everywhere, and FORCE it.
--
-- Without FORCE, the table owner bypasses RLS. Enabling FORCE means even an
-- owner-role connection is subject to policies; project_admin reaches the data
-- via BYPASSRLS, which is the intended server path and is unaffected.
-- link_clicks already has RLS enabled with its own INSERT-only policy for the
-- click-tracking edge function — left exactly as-is.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  rls_tables TEXT[] := ARRAY[
    'activity_logs', 'ai_outputs', 'api_keys', 'approval_actions',
    'approval_requests', 'apps', 'business_events', 'cal_booking_events',
    'contact_tags', 'contacts', 'deals', 'execution_steps', 'message_logs',
    'message_templates', 'organization_invites', 'organization_members',
    'organizations', 'pipelines', 'stages', 'tags', 'tasks',
    'testimonial_requests', 'testimonials', 'workflow_edges',
    'workflow_enrollments', 'workflow_nodes', 'workflow_versions',
    'workflows', 'workspaces'
  ];
BEGIN
  FOREACH t IN ARRAY rls_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Revoke the browser roles' database privileges.
--
-- This is the control that actually closes IR-2. InsForge grants broad DML on
-- public tables to anon/authenticated by default; with the anon key published
-- in the browser bundle by design, those grants are the exposure. The app does
-- not need them: no "use client" module issues a database call.
--
-- link_clicks keeps its INSERT grant — the click-tracking edge function
-- depends on it and its RLS policy already constrains the write.
--
-- The sweep covers relkind r,v,m,f,p — ordinary tables, VIEWS, materialized
-- views, foreign tables, partitioned tables. Restricting it to 'r' would leave
-- a hole rather than a gap: a view without `security_invoker = true` executes
-- with its OWNER's privileges, so it reads straight through RLS on its base
-- tables. Revoking the table but not a view over it leaves the anonymous read
-- path fully intact. There are zero views in `public` today (verified), so
-- this is currently latent — but it arms the trap for the first view anyone
-- adds, which is exactly when nobody will re-audit this file.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
      AND c.relname <> 'link_clicks'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON public.%I FROM anon, authenticated', t
    );
  END LOOP;
END $$;

-- link_clicks: narrow to exactly the grant the click-tracking edge function
-- needs. It ships with SELECT/UPDATE/DELETE too; RLS already denies those
-- (its only policy is FOR INSERT), but a grant that no policy backs is
-- surface waiting for someone to add a permissive policy later.
REVOKE ALL ON public.link_clicks FROM anon, authenticated;
GRANT INSERT ON public.link_clicks TO anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Deliberately NOT revoking EXECUTE on functions: `is_org_member` /
-- `is_org_admin` are called from the policy predicates, so `authenticated`
-- needs EXECUTE for the day a per-user read path is switched on. Revoking it
-- would turn those policies into errors rather than denials.

-- Fail safe for objects created from here on. Read the limitation below before
-- trusting this to be the whole control.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- LIMITATION — measured on the branch, do not assume this closed the hole.
--
-- ALTER DEFAULT PRIVILEGES only governs objects created by the role that runs
-- it. Every default ACL in `public` on this project belongs to role `postgres`
-- (`anon=arwd, authenticated=arwd` on tables), and `project_admin` cannot
-- touch it: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres …` fails with
-- "must be member of role postgres". So:
--
--   * Tables created by SQL migration (as project_admin) already fail safe —
--     verified by creating a probe table, which came back granted to
--     project_admin only, with nothing for anon/authenticated. The two
--     statements above make that explicit rather than incidental.
--   * Tables created through the InsForge dashboard or table API may be
--     created as `postgres` and WILL inherit anon/authenticated grants. That
--     path cannot be closed from a migration.
--
-- The durable control is therefore a recurring audit, not this statement. Run
-- after any schema change (expect only link_clicks INSERT):
--
--   SELECT table_name, grantee, string_agg(privilege_type, ',')
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
--   GROUP BY 1, 2 ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- VERIFY (run after applying):
--
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--   -- expect: zero rows
--
-- Then, from a shell with the REAL anon key (a JWT, not ik_...):
--   curl -s -H "Authorization: Bearer $ANON_KEY" \
--     "$INSFORGE_URL/api/database/records/contacts?select=*&limit=1"
--   -- expect: empty array or a permission error, never a real row
--
-- ROLLBACK (restores the pre-migration state exactly):
--   BEGIN;
--   -- re-grant, then disable. Order matters: never leave a window where RLS
--   -- is off and grants are already back.
--   DO $$ DECLARE t TEXT; BEGIN
--     FOR t IN SELECT c.relname FROM pg_class c
--       JOIN pg_namespace n ON n.oid=c.relnamespace
--       WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'link_clicks'
--     LOOP
--       EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
--       EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--       EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
--     END LOOP;
--   END $$;
--   COMMIT;
-- ---------------------------------------------------------------------------
