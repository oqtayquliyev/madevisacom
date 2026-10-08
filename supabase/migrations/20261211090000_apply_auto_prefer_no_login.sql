/*
# Auto Apply with Pro: prefer jobs MadeVisa can submit by itself
Run AFTER 20261210090000_apply_cleanup_before_batch.sql. Safe to run more than once.

New jobs now come with their application link, so the worker applies first
to the ones on sites that don't need the person's own login (Workday,
iCIMS, SuccessFactors, Oracle, Taleo, Amazon go last).
*/

CREATE OR REPLACE FUNCTION public.apply_auto_jobs(p_user uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', j.id, 'title', j.title, 'company', pub.name, 'publisherId', j.publisher_id,
      'cc', c.iso_code, 'country', c.name,
      'html', coalesce(nullif(j.facts->>'html', ''), j.description, ''),
      'jobFunction', j.job_function, 'experience', j.experience_level,
      'visa', j.visa_sponsorship,
      'url', coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')),
      'at', coalesce(j.released_at, j.approved_at, j.created_at)
    ) AS x
    FROM public.sponsored_jobs j
    LEFT JOIN public.program_publishers pub ON pub.id = j.publisher_id
    LEFT JOIN public.countries c ON c.id = j.country_id
    WHERE j.status = 'published'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND coalesce(j.released_at, j.approved_at, j.created_at) > p_since
      AND coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.job_applications a WHERE a.user_id = p_user AND a.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = p_user AND r.listing_kind = 'job' AND r.listing_id = j.id)
    ORDER BY coalesce(j.released_at, j.approved_at, j.created_at) DESC
    LIMIT 400
  ) t;
$$;
REVOKE ALL ON FUNCTION public.apply_auto_jobs(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_jobs(uuid, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
