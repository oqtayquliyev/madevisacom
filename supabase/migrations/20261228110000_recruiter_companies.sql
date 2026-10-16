/*
  /network (Recruiters): companies that sponsor visas, with the contact emails MadeVisa has for them.
  Emails come from the company's contact address and from the job ads themselves (job_contacts);
  MadeVisa's own placeholder address is left out. Only verified companies with at least one live job
  that offers visa sponsorship, and at least one email, are listed.
*/
CREATE OR REPLACE FUNCTION public.recruiter_companies()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH live AS (
    SELECT s.publisher_id,
      count(*)::int AS jobs,
      count(*) FILTER (WHERE s.visa_sponsorship OR s.visa_status = 'offered')::int AS sponsored,
      array_agg(DISTINCT c.iso_code) FILTER (WHERE (s.visa_sponsorship OR s.visa_status = 'offered') AND c.iso_code IS NOT NULL) AS countries
    FROM public.sponsored_jobs s
    LEFT JOIN public.countries c ON c.id = s.country_id
    WHERE s.status = 'published' AND NOT coalesce(s.awaiting_release, false)
      AND (s.expires_at IS NULL OR s.expires_at > now()) AND s.publisher_id IS NOT NULL
    GROUP BY s.publisher_id
  ),
  raw AS (
    SELECT p.id AS publisher_id, lower(btrim(p.contact_email)) AS email, 0 AS pri FROM public.program_publishers p
    UNION ALL
    SELECT s.publisher_id, lower(btrim(jc.email)), 1
    FROM public.job_contacts jc
    JOIN public.sponsored_jobs s ON s.id = jc.job_id
    WHERE s.status = 'published' AND (s.expires_at IS NULL OR s.expires_at > now())
  ),
  emails AS (
    SELECT publisher_id, (array_agg(email ORDER BY pri, email))[1:3] AS list, count(*)::int AS n
    FROM (SELECT DISTINCT ON (publisher_id, email) publisher_id, email, pri FROM raw
          WHERE email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' AND email !~ '@(madevisa\.com|example\.com)$'
          ORDER BY publisher_id, email, pri) d
    GROUP BY publisher_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'logo_url', p.logo_url, 'website', p.website,
      'country', co.name, 'country_code', co.iso_code,
      'jobs', l.jobs, 'sponsored', l.sponsored, 'countries', coalesce(to_jsonb(l.countries[1:6]), '[]'::jsonb),
      'emails', to_jsonb(e.list))
    ORDER BY l.sponsored DESC, l.jobs DESC, p.name), '[]'::jsonb)
  FROM public.program_publishers p
  JOIN live l ON l.publisher_id = p.id
  JOIN emails e ON e.publisher_id = p.id
  LEFT JOIN public.countries co ON co.id = p.country_id
  WHERE p.verification_status = 'verified' AND l.sponsored > 0;
$$;
REVOKE ALL ON FUNCTION public.recruiter_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recruiter_companies() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
