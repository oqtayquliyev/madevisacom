SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.is_free_mail(p_domain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_domain, '') ~* '^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|web|mail|yandex|zoho|tutanota|qq|163|126|rambler|bk|inbox|list)\.';
$$;

CREATE OR REPLACE FUNCTION public.bare_domain(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d IS NULL THEN NULL
    WHEN d ~* '(^|\.)(greenhouse\.io|lever\.co|workday\.com|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com|ashbyhq\.com|recruitee\.com|personio\.(de|com)|teamtailor\.com|bamboohr\.com|workable\.com|icims\.com|successfactors\.(com|eu)|taleo\.net|jobvite\.com|breezy\.hr|join\.com|softgarden\.(de|io)|onlyfy\.jobs|linkedin\.com|indeed\.com|glassdoor\.com|stepstone\.de|xing\.com|facebook\.com|google\.com|sites\.google\.com|notion\.site|wixsite\.com|github\.io)$' THEN NULL
    ELSE d
  END
  FROM (
    SELECT nullif(lower(regexp_replace(regexp_replace(coalesce(p, ''), '^[a-z]+://', '', 'i'), '^www\.|[/:?#].*$', '', 'gi')), '') AS d
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.employer_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  me uuid := auth.uid();
  email text;
  confirmed timestamptz;
  dom text;
  companies jsonb;
  plans jsonb;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('state', 'signed_out'); END IF;
  SELECT u.email, u.email_confirmed_at INTO email, confirmed FROM auth.users u WHERE u.id = me;
  dom := lower(split_part(coalesce(email, ''), '@', 2));
  IF confirmed IS NULL THEN RETURN jsonb_build_object('state', 'unconfirmed', 'domain', dom); END IF;
  IF dom = '' OR public.is_free_mail(dom) THEN RETURN jsonb_build_object('state', 'personal_email', 'domain', dom); END IF;

  WITH mine AS (
    SELECT p.id, p.name
    FROM public.program_publishers p
    WHERE public.bare_domain(p.website) IS NOT NULL
      AND (dom = public.bare_domain(p.website) OR dom LIKE '%.' || public.bare_domain(p.website))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name), '[]'::jsonb) INTO companies FROM mine;

  IF companies = '[]'::jsonb THEN RETURN jsonb_build_object('state', 'no_company', 'domain', dom); END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb) INTO plans FROM (
    SELECT jsonb_build_object(
      'share_id', hb.share_id,
      'job_title', hb.job_title,
      'company_name', hb.company_name,
      'candidate_name', hb.candidate_name,
      'country_code', hb.country_code,
      'created_at', hb.created_at,
      'replied', EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.reported_at IS NULL)
    ) AS x
    FROM public.hiring_briefs hb
    WHERE hb.publisher_id IN (SELECT (c->>'id')::uuid FROM jsonb_array_elements(companies) c)
      AND hb.status <> 'withdrawn'
      AND (hb.status IN ('sent', 'replied', 'interview', 'offer', 'declined', 'no_reply')
           OR hb.unique_viewers > 0
           OR EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id))
    ORDER BY hb.created_at DESC
    LIMIT 200
  ) t;

  RETURN jsonb_build_object('state', 'ok', 'domain', dom, 'companies', companies, 'plans', plans);
END;
$$;
REVOKE ALL ON FUNCTION public.employer_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_inbox() TO authenticated;