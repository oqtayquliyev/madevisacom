/*
Companies directory v2 — data for the new /companies page.

Same columns as companies_directory(), plus:
  new_30d        listings first posted in the last 30 days (source date
                 when the career site gives one, otherwise approval date)
  weekly         listings posted per week, last 12 weeks, oldest first
                 (the small "hiring performance" chart on each card)
  countries      top 3 countries with open jobs: [{code, name, n}]
  country_count  number of countries with open jobs

companies_directory() is kept, so the old site keeps working until the
new build is deployed.
*/

CREATE OR REPLACE FUNCTION public.companies_directory_v2()
RETURNS TABLE (
  id uuid, name text, logo_url text, website text, org_type text, country_name text, country_code text,
  active_jobs int, active_programs int, posted_30d int, new_30d int, tracked int,
  response_rate numeric, avg_response_days numeric, last_listed timestamptz,
  weekly int[], countries jsonb, country_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT publisher_id, status, country_id,
      COALESCE(approved_at, created_at) AS listed_at,
      LEAST(COALESCE(source_posted_at, approved_at, created_at), COALESCE(approved_at, created_at)) AS posted_at
    FROM public.sponsored_jobs WHERE status IN ('published', 'expired')
  ),
  j AS (
    SELECT publisher_id,
      count(*) FILTER (WHERE status = 'published')::int AS active,
      count(*) FILTER (WHERE listed_at >= now() - interval '30 days')::int AS p30,
      count(*) FILTER (WHERE posted_at >= now() - interval '30 days')::int AS n30,
      max(listed_at) AS last_listed
    FROM base GROUP BY publisher_id
  ),
  w AS (
    SELECT publisher_id, floor(EXTRACT(EPOCH FROM (now() - posted_at)) / 604800)::int AS wk, count(*)::int AS n
    FROM base WHERE posted_at >= now() - interval '84 days'
    GROUP BY 1, 2
  ),
  wk AS (
    SELECT j.publisher_id,
      array_agg(COALESCE(w.n, 0) ORDER BY g.i DESC) AS weekly
    FROM j CROSS JOIN generate_series(0, 11) AS g(i)
    LEFT JOIN w ON w.publisher_id = j.publisher_id AND w.wk = g.i
    GROUP BY j.publisher_id
  ),
  cc AS (
    SELECT publisher_id, country_id, count(*)::int AS n,
      row_number() OVER (PARTITION BY publisher_id ORDER BY count(*) DESC) AS rk
    FROM base WHERE status = 'published' AND country_id IS NOT NULL
    GROUP BY publisher_id, country_id
  ),
  ct AS (
    SELECT cc.publisher_id,
      jsonb_agg(jsonb_build_object('code', c.iso_code, 'name', c.name, 'n', cc.n) ORDER BY cc.n DESC) FILTER (WHERE cc.rk <= 3) AS countries,
      count(*)::int AS country_count
    FROM cc JOIN public.countries c ON c.id = cc.country_id
    GROUP BY cc.publisher_id
  ),
  pr AS (SELECT publisher_id, count(*) FILTER (WHERE status = 'published')::int AS active FROM public.programs GROUP BY publisher_id),
  a AS (
    SELECT publisher_id, count(*)::int AS tracked, count(DISTINCT user_id)::int AS applicants,
      count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
      avg(EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days
    FROM public.application_reports WHERE status <> 'withdrawn' AND NOT excluded GROUP BY publisher_id
  )
  SELECT p.id, p.name, p.logo_url, p.website, p.org_type::text, c.name, c.iso_code,
    COALESCE(j.active, 0), COALESCE(pr.active, 0), COALESCE(j.p30, 0), COALESCE(j.n30, 0), COALESCE(a.tracked, 0),
    CASE WHEN COALESCE(a.tracked, 0) >= 5 AND a.applicants >= 3 THEN round(100.0 * a.responded / a.tracked) END,
    CASE WHEN COALESCE(a.tracked, 0) >= 5 AND a.applicants >= 3 AND a.responded >= 3 THEN round(a.avg_days::numeric, 1) END,
    j.last_listed,
    COALESCE(wk.weekly, array_fill(0, ARRAY[12])),
    COALESCE(ct.countries, '[]'::jsonb),
    COALESCE(ct.country_count, 0)
  FROM public.program_publishers p
  LEFT JOIN j ON j.publisher_id = p.id
  LEFT JOIN wk ON wk.publisher_id = p.id
  LEFT JOIN ct ON ct.publisher_id = p.id
  LEFT JOIN pr ON pr.publisher_id = p.id
  LEFT JOIN a ON a.publisher_id = p.id
  LEFT JOIN public.countries c ON c.id = p.country_id
  WHERE p.verification_status = 'verified'
  ORDER BY COALESCE(j.active, 0) + COALESCE(pr.active, 0) DESC, p.name;
$$;

GRANT EXECUTE ON FUNCTION public.companies_directory_v2() TO anon, authenticated;
