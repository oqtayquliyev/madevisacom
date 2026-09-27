/*
# Job releases — publish imported jobs in batches ("Publish update")  · v2

v2 replaces the first version, which back-filled every existing job in
one UPDATE and could hold a table lock for minutes on a large catalogue.
This version changes NO existing rows, so it runs in seconds:

- awaiting_release (boolean, default false): existing jobs stay visible
  exactly as they are. Only NEW imported jobs start as "waiting".
- released_at: set when a job goes public (new jobs only; old jobs keep
  NULL and count as released at creation).
- lock_timeout: if the table is busy, this migration stops after 5 s
  instead of blocking the site. Just run it again a minute later.

Imported jobs wait for "Publish update" in the admin panel; jobs added by
hand / by companies / by admins go live at once. Each release stores its
"new jobs today" number so the site never counts live.
Safe to run more than once.
*/

SET lock_timeout = '5s';

-- Adding columns with constant defaults doesn't rewrite the table (instant).
ALTER TABLE public.sponsored_jobs ADD COLUMN IF NOT EXISTS awaiting_release boolean NOT NULL DEFAULT false;
ALTER TABLE public.sponsored_jobs ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- In case the first version of this migration left rows half-updated: nothing to fix —
-- visibility no longer depends on released_at.

CREATE INDEX IF NOT EXISTS sponsored_jobs_awaiting_idx ON public.sponsored_jobs (created_at) WHERE awaiting_release;
CREATE INDEX IF NOT EXISTS sponsored_jobs_released_idx ON public.sponsored_jobs (released_at) WHERE released_at IS NOT NULL;

-- New imported jobs wait; everything else is released immediately.
CREATE OR REPLACE FUNCTION public.sponsored_jobs_release_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.import_source_id IS NOT NULL THEN
      NEW.awaiting_release := true;
      NEW.released_at := NULL;
    ELSE
      NEW.awaiting_release := false;
      IF NEW.status = 'published' THEN NEW.released_at := coalesce(NEW.released_at, now()); END IF;
    END IF;
  ELSIF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' AND NOT NEW.awaiting_release THEN
    NEW.released_at := coalesce(NEW.released_at, now());
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
    (status = 'published' AND NOT awaiting_release)
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

-- "New jobs today" for a release: released in the last 24 h, plus older-style
-- jobs (no released_at) created in the last 24 h. Two small indexed counts.
CREATE OR REPLACE FUNCTION public.count_new_today()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT count(*) FROM public.sponsored_jobs WHERE released_at > now() - interval '24 hours' AND status = 'published' AND NOT awaiting_release)
    + (SELECT count(*) FROM public.sponsored_jobs WHERE released_at IS NULL AND created_at > now() - interval '24 hours' AND status = 'published' AND NOT awaiting_release)
  )::int;
$$;

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
  UPDATE public.sponsored_jobs SET awaiting_release = false, released_at = now() WHERE awaiting_release;
  GET DIAGNOSTICS released = ROW_COUNT;
  today := public.count_new_today();
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

CREATE OR REPLACE FUNCTION public.unreleased_job_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_admin() THEN (SELECT count(*)::int FROM public.sponsored_jobs WHERE awaiting_release AND status = 'published') ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION public.unreleased_job_count() TO authenticated;

-- A first release so the site has its "new today" number straight away.
INSERT INTO public.job_releases (jobs_released, new_today, note)
SELECT 0, public.count_new_today(), 'Initial release'
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
    WHERE j.status = 'published' AND NOT j.awaiting_release
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
    WHERE j.status = 'published' AND NOT j.awaiting_release
      AND j.created_at > now() - interval '3 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ) t
  WHERE rn <= least(greatest(per_company, 1), 10)
  ORDER BY rn, created_at DESC
  LIMIT least(greatest(n, 1), 200);
$$;
