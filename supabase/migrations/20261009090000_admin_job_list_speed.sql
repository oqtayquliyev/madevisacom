/*
# Faster job list for the admin panel

The admin panel loads every job (15,000+) in pages of 1,000. Two things made
each page slow enough to hit the database time limit, which showed every
company as "0 live · 0 pending":

1. The job access rules called is_admin() once for EVERY row. Writing it as
   (SELECT public.is_admin()) makes Postgres check it once per request.
   The rules themselves are unchanged — same people can see and edit the
   same jobs.
2. There was no index for "newest first", so every page sorted the whole
   table. Added one.

Safe to run more than once. Changes no data.
*/

CREATE INDEX IF NOT EXISTS sponsored_jobs_created_at_id_idx
  ON public.sponsored_jobs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS sponsored_jobs_status_created_at_idx
  ON public.sponsored_jobs (status, created_at, id);

DROP POLICY IF EXISTS "sponsored_jobs_select_published_or_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_select_published_or_owner"
  ON public.sponsored_jobs FOR SELECT
  TO anon, authenticated
  USING (status = 'published' OR (SELECT public.is_admin()) OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "sponsored_jobs_insert_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_insert_owner"
  ON public.sponsored_jobs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin()) OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "sponsored_jobs_update_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_update_owner"
  ON public.sponsored_jobs FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()) OR public.can_manage_publisher(publisher_id))
  WITH CHECK ((SELECT public.is_admin()) OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "sponsored_jobs_delete_admin" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_delete_admin"
  ON public.sponsored_jobs FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()) OR public.can_manage_publisher(publisher_id));

ANALYZE public.sponsored_jobs;
