/*
Landing page: 5 jobs from 5 different companies, each with a salary shown
and a company logo — the newest such job per company (last 30 days).

Returns job ids only; the site then loads those 5 jobs. Cached in each
visitor's browser for 2 hours, so this runs rarely.
*/

CREATE OR REPLACE FUNCTION public.landing_job_ids(n int DEFAULT 5)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
  SELECT id FROM (
    SELECT DISTINCT ON (j.publisher_id) j.id, j.created_at
    FROM public.sponsored_jobs j
    JOIN public.program_publishers p ON p.id = j.publisher_id
    WHERE j.status = 'published'
      AND j.created_at > now() - interval '30 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND coalesce(btrim(p.logo_url), '') <> ''
      AND (
        j.salary_min IS NOT NULL OR j.salary_max IS NOT NULL
        OR (coalesce(btrim(j.compensation_text), '') <> '' AND j.compensation_text ~ '[1-9]')
      )
    ORDER BY j.publisher_id, j.created_at DESC
  ) t
  ORDER BY created_at DESC
  LIMIT least(greatest(n, 1), 12);
$$;

GRANT EXECUTE ON FUNCTION public.landing_job_ids(int) TO anon, authenticated;
