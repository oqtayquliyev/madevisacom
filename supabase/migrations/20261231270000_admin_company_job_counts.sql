-- Admin → Imports → "Companies & their sources": job counts per company, counted on the server.
-- The page used to count from the full job list in the browser, which isn't loaded on that tab
-- (so every company showed "0 live · 0 pending").
CREATE OR REPLACE FUNCTION public.admin_company_job_counts()
RETURNS TABLE (publisher_id uuid, live bigint, pending bigint, other bigint, unlinked bigint, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT j.publisher_id,
         count(*) FILTER (WHERE j.status = 'published' AND NOT j.awaiting_release),
         count(*) FILTER (WHERE j.status = 'pending' OR (j.status = 'published' AND j.awaiting_release)),
         count(*) FILTER (WHERE j.status NOT IN ('published', 'pending')),
         count(*) FILTER (WHERE j.origin = 'imported' AND j.import_source_id IS NULL),
         count(*)
  FROM public.sponsored_jobs j
  WHERE j.publisher_id IS NOT NULL
  GROUP BY j.publisher_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_company_job_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_company_job_counts() TO authenticated;

NOTIFY pgrst, 'reload schema';
