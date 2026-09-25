/*
# "Update public job count" button

The homepage ("From Azerbaijan to 12,746 opportunities worldwide") and the
jobs page read their headline numbers from the small `site_stats` table.
This adds admin_refresh_site_stats(): it recounts live jobs right now and
saves the numbers, so the admin panel's "Update now" button makes every
visitor see the new count straight away.

  published_jobs  live jobs that haven't expired
  new_jobs_24h    of those, added in the last 24 hours

Only admins (with their two-step code) can run it. Safe to run more than once.
*/

CREATE TABLE IF NOT EXISTS public.site_stats (
  key text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_stats_public_read" ON public.site_stats;
CREATE POLICY "site_stats_public_read"
  ON public.site_stats FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.site_stats TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_refresh_site_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_published bigint;
  v_new bigint;
  v_now timestamptz := now();
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access (with your two-step code) required.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_published
  FROM public.sponsored_jobs
  WHERE status = 'published' AND (expires_at IS NULL OR expires_at > v_now);

  SELECT count(*) INTO v_new
  FROM public.sponsored_jobs
  WHERE status = 'published' AND (expires_at IS NULL OR expires_at > v_now)
    AND created_at >= v_now - interval '24 hours';

  DELETE FROM public.site_stats WHERE key IN ('published_jobs', 'new_jobs_24h');
  INSERT INTO public.site_stats (key, value, computed_at)
  VALUES ('published_jobs', v_published, v_now), ('new_jobs_24h', v_new, v_now);

  RETURN jsonb_build_object('published_jobs', v_published, 'new_jobs_24h', v_new, 'computed_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refresh_site_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_refresh_site_stats() TO authenticated;
