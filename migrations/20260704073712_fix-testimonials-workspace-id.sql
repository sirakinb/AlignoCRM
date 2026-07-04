-- The live schema stores workspace ids as TEXT (e.g. 'default',
-- 'org_196222b7d0c13626274a') with no workspaces FK — the original
-- 001 migration's UUID + FK design was later relaxed. Align the new
-- testimonial tables with how every other business table actually works.

ALTER TABLE testimonial_requests
  DROP CONSTRAINT IF EXISTS testimonial_requests_workspace_id_fkey;
ALTER TABLE testimonial_requests
  ALTER COLUMN workspace_id TYPE TEXT;

ALTER TABLE testimonials
  DROP CONSTRAINT IF EXISTS testimonials_workspace_id_fkey;
ALTER TABLE testimonials
  ALTER COLUMN workspace_id TYPE TEXT;
