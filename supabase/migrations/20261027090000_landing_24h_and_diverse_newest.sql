/*
# Landing: last 24 hours only · Jobs page: newest jobs across many companies

1. landing_job_ids(n) — the landing page's 5 cards.
   Now only jobs shared on MadeVisa in the last 24 hours, one per company,
   newest first. Jobs with a logo and a salary are preferred; if there
   aren't enough of those, other jobs from the last 24 hours fill in.
   Returns fewer than n (never older jobs) when the day has been quiet —
   the app falls back to the newest jobs only if it returns none.

2. newest_diverse_job_ids(n, per_company) — the first jobs a signed-out
   visitor sees on /jobs. Newest jobs, at most `per_company` per company,
   ordered so each company's newest job comes before anyone's second —
   so a bulk import from one company can't fill the first page.

Both use created_at (when the job went live on MadeVisa), the same clock
as the "N new jobs published today" counter. Safe to run more than once.
*/

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
      (coalesce(btrim(p.logo_url), '') <> '') AS has_logo,
      (
        j.salary_min IS NOT NULL OR j.salary_max IS NOT NULL
        OR (coalesce(btrim(j.compensation_text), '') <> '' AND j.compensation_text ~ '[1-9]')
      ) AS has_salary
    FROM public.sponsored_jobs j
    JOIN public.program_publishers p ON p.id = j.publisher_id
    WHERE j.status = 'published'
      AND j.created_at > now() - interval '24 hours'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ),
  best AS (
    -- One job per company: its best-presented, then newest, job.
    SELECT DISTINCT ON (publisher_id) id, created_at, has_logo, has_salary
    FROM recent
    ORDER BY publisher_id, (has_logo AND has_salary) DESC, has_logo DESC, created_at DESC
  )
  SELECT id FROM best
  ORDER BY (has_logo AND has_salary) DESC, created_at DESC
  LIMIT least(greatest(n, 1), 12);
$$;
GRANT EXECUTE ON FUNCTION public.landing_job_ids(int) TO anon, authenticated;

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
    WHERE j.status = 'published'
      AND j.created_at > now() - interval '3 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ) t
  WHERE rn <= least(greatest(per_company, 1), 10)
  ORDER BY rn, created_at DESC
  LIMIT least(greatest(n, 1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.newest_diverse_job_ids(int, int) TO anon, authenticated;
