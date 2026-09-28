/*
# Filter counts for /jobs (countries and categories)

The /jobs page shows how many jobs each country and category has. First-
time visitors don't download the whole job list any more, so the counts
come from here instead: live jobs grouped by (title, department, country),
which /api/facets turns into category counts with the site's own category
rules and caches for a day.

The grouped list itself is cached here for 6 hours, so repeated calls
don't recount 70,000 jobs. Run AFTER 20261105100000.
*/

CREATE TABLE IF NOT EXISTS public.job_facet_cache (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  data jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_facet_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_facet_cache FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.job_facet_rows()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '45s'
AS $$
DECLARE
  cached public.job_facet_cache;
  d jsonb;
BEGIN
  SELECT * INTO cached FROM public.job_facet_cache WHERE id;
  IF FOUND AND cached.computed_at > now() - interval '6 hours' THEN
    RETURN cached.data;
  END IF;

  SELECT jsonb_build_object(
    'computed_at', now(),
    'rows', coalesce(jsonb_agg(jsonb_build_array(t.title, t.dept, t.iso, t.country, t.n)), '[]'::jsonb)
  ) INTO d
  FROM (
    SELECT s.title, s.job_function AS dept, c.iso_code AS iso, c.name AS country, count(*)::int AS n
    FROM public.sponsored_jobs s
    LEFT JOIN public.countries c ON c.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
    GROUP BY s.title, s.job_function, c.iso_code, c.name
  ) t;

  INSERT INTO public.job_facet_cache (id, data, computed_at) VALUES (true, d, now())
  ON CONFLICT (id) DO UPDATE SET data = excluded.data, computed_at = excluded.computed_at;
  RETURN d;
END;
$$;
GRANT EXECUTE ON FUNCTION public.job_facet_rows() TO anon, authenticated;
