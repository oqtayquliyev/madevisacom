/*
# Job releases — publish imported jobs in batches ("Publish update")

Why: every sync used to change the live site immediately, so browsers
could never keep a copy and had to re-download all jobs every minute.
Now imported jobs wait until an admin presses **Publish update**; each
release is a version. Browsers keep their saved copy until a new release
exists, and each release stores its own numbers ("N new jobs published
today") so the site never counts jobs live.

1. sponsored_jobs.released_at — when a job went public. Existing live jobs
   are backfilled, so nothing disappears.
2. Jobs added by hand, by companies or by admins (no import source) are
   released the moment they're published. Imported jobs wait for the next
   release.
3. Public visibility: published AND released (admins and company
   managers still see everything of theirs).
4. publish_job_release() — admin: releases all waiting jobs, records the
   release with its numbers. current_job_release() — public, one row.
5. landing_job_ids / newest_diverse_job_ids: released jobs only.

Safe to run more than once. Run after 20261028090000_jobs_30_day_rule.sql.
*/

ALTER TABLE public.sponsored_jobs ADD COLUMN IF NOT EXISTS released_at timestamptz;

UPDATE public.sponsored_jobs
SET released_at = coalesce(approved_at, created_at)
WHERE released_at IS NULL AND status IN ('published', 'expired');

CREATE INDEX IF NOT EXISTS sponsored_jobs_released_idx ON public.sponsored_jobs (released_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS sponsored_jobs_unreleased_idx ON public.sponsored_jobs (created_at) WHERE status = 'published' AND released_at IS NULL;

-- Hand-made jobs go live at once; imported ones wait for "Publish update".
CREATE OR REPLACE FUNCTION public.sponsored_jobs_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.released_at IS NULL AND NEW.import_source_id IS NULL THEN
    NEW.released_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sponsored_jobs_release_guard ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_release_guard
  BEFORE INSERT OR UPDATE OF status ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.sponsored_jobs_release_guard();

DROP POLICY IF EXISTS "sponsored_jobs_select_published_or_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_select_published_or_owner"
  ON public.sponsored_jobs FOR SELECT
  TO anon, authenticated
  USING (
    (status = 'published' AND released_at IS NOT NULL)
    OR (status = 'expired' AND closed_at > now() - interval '24 hours')
    OR (SELECT public.is_admin())
    OR public.can_manage_publisher(publisher_id)
  );

CREATE TABLE IF NOT EXISTS public.job_releases (
  id bigserial PRIMARY KEY,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid DEFAULT auth.uid(),
  jobs_released integer NOT NULL DEFAULT 0,
  new_today integer NOT NULL DEFAULT 0,
  note text
);
ALTER TABLE public.job_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_releases_read" ON public.job_releases;
CREATE POLICY "job_releases_read" ON public.job_releases FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.publish_job_release(p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  released integer;
  today integer;
  rid bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can publish.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sponsored_jobs SET released_at = now()
  WHERE status = 'published' AND released_at IS NULL;
  GET DIAGNOSTICS released = ROW_COUNT;
  SELECT count(*) INTO today FROM public.sponsored_jobs
  WHERE status = 'published' AND released_at > now() - interval '24 hours';
  INSERT INTO public.job_releases (jobs_released, new_today, note) VALUES (released, today, p_note) RETURNING id INTO rid;
  RETURN jsonb_build_object('id', rid, 'jobs_released', released, 'new_today', today, 'published_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.publish_job_release(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_job_release(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_job_release()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', id, 'published_at', published_at, 'new_today', new_today, 'jobs_released', jobs_released)
  FROM public.job_releases ORDER BY id DESC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_job_release() TO anon, authenticated;

-- How many imported jobs are waiting for the next release (admin panel).
CREATE OR REPLACE FUNCTION public.unreleased_job_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_admin() THEN (SELECT count(*)::int FROM public.sponsored_jobs WHERE status = 'published' AND released_at IS NULL) ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION public.unreleased_job_count() TO authenticated;

-- First release, so the site has numbers straight away.
INSERT INTO public.job_releases (jobs_released, new_today, note)
SELECT 0, (SELECT count(*) FROM public.sponsored_jobs WHERE status = 'published' AND released_at > now() - interval '24 hours'), 'Initial release'
WHERE NOT EXISTS (SELECT 1 FROM public.job_releases);

-- Landing cards and the quick "newest" list: released jobs only.
CREATE OR REPLACE FUNCTION public.landing_job_ids(n int DEFAULT 5)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
  WITH recent AS (
    SELECT
      j.id,
      j.publisher_id,
      j.created_at,
      public.job_posted_at(j.source_posted_at, j.created_at) AS posted,
      (coalesce(btrim(p.logo_url), '') <> '' OR coalesce(btrim(j.image_url), '') <> '') AS has_logo
    FROM public.sponsored_jobs j
    JOIN public.program_publishers p ON p.id = j.publisher_id
    WHERE j.status = 'published' AND j.released_at IS NOT NULL
      AND public.job_posted_at(j.source_posted_at, j.created_at) > now() - interval '7 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ),
  newest_per_company AS (
    SELECT DISTINCT ON (publisher_id) id, posted, created_at, has_logo
    FROM recent
    ORDER BY publisher_id, posted DESC, created_at DESC
  )
  SELECT id FROM newest_per_company
  -- Companies with a logo (last 3 days) first, then strictly newest first.
  ORDER BY (has_logo AND posted > now() - interval '3 days') DESC, posted DESC, created_at DESC
  LIMIT least(greatest(n, 1), 12);
$$;

CREATE OR REPLACE FUNCTION public.newest_diverse_job_ids(n int DEFAULT 36, per_company int DEFAULT 3)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
  SELECT id FROM (
    SELECT
      j.id,
      j.created_at,
      row_number() OVER (PARTITION BY j.publisher_id ORDER BY j.created_at DESC, j.id DESC) AS rn
    FROM public.sponsored_jobs j
    WHERE j.status = 'published' AND j.released_at IS NOT NULL
      AND j.created_at > now() - interval '3 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ) t
  WHERE rn <= least(greatest(per_company, 1), 10)
  ORDER BY rn, created_at DESC
  LIMIT least(greatest(n, 1), 200);
$$;
