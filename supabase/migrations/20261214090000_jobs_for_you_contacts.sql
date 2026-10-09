/*
# Job-link posts, "Jobs for you" emails, recruiter contacts (one file)
Run AFTER 20261213090000_apply_routes.sql. Paste the whole file once in the
Supabase SQL Editor. Safe to run more than once.

1. SOCIAL
   - Telegram is switched on and runs on its own (no Start needed): job links
     all day, "💼 Role: Link". Stopping the program no longer clears Telegram.
     Needs the TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID secrets (Edge Functions).
   - social_pick_new_company_jobs(): fresh jobs from companies NEVER posted on
     a network before (the Instagram "We are hiring" card).

2. RECRUITER CONTACTS (replaces the people directory on /network)
   - job_contacts: the emails written in job ads ("Send your CV to …"), with a
     contact name when the ad gives one. Filled by a trigger on new/changed
     jobs, and a backfill that works through older jobs every 10 minutes.
   - recruiter_contacts(): the public list for /network (live jobs only).
   - network_directory() now returns nobody: MadeVisa users are no longer listed.

3. "JOBS FOR YOU" EMAILS
   - for_you_settings: daily (default) / weekly / off, per account.
   - job_searches: the last searches of signed-in people on /jobs.
   - for_you_sent: every job ever emailed to a person — never sent twice.
   - run_for_you_emails('daily' | 'weekly'): for each confirmed account, the
     NEW jobs since its last email that fit its CV titles and skills, profile
     (occupation, specialization), job alerts and recent searches. No new
     fitting jobs → no email. Free accounts see 5 jobs per email (the rest are
     counted, "+N more with Pro"); Pro sees 10.
   - Cron: daily from 07:10 UTC (hourly passes until 12:10), weekly on Mondays.
   Budget brake: FOR_YOU_PER_RUN below (Resend's free plan is 100 emails a day,
   shared with job alerts — raise it when you upgrade).
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. SOCIAL
-- ===========================================================================

UPDATE public.social_platforms SET enabled = true, updated_at = now() WHERE platform = 'telegram';

-- Stop: Telegram keeps its slots and posts (it runs without the program).
CREATE OR REPLACE FUNCTION public.social_program_stop()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slots integer;
  posts integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.social_program SET running = false, stopped_at = now(), lock_until = NULL, updated_at = now() WHERE id;
  DELETE FROM public.social_posts WHERE origin = 'program' AND status = 'planned' AND platform <> 'telegram';
  GET DIAGNOSTICS slots = ROW_COUNT;
  UPDATE public.social_posts SET status = 'rejected', error = 'Program stopped'
  WHERE origin = 'program' AND platform <> 'telegram' AND status IN ('rendering', 'awaiting_approval', 'approved', 'failed');
  GET DIAGNOSTICS posts = ROW_COUNT;
  RETURN format('stopped: %s slots removed, %s posts withdrawn (Telegram keeps running)', slots, posts);
END;
$$;
REVOKE ALL ON FUNCTION public.social_program_stop() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_program_stop() TO authenticated;

-- Fresh jobs from companies never posted on this network, one per company.
CREATE OR REPLACE FUNCTION public.social_pick_new_company_jobs(p_platform text, p_count integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH posted AS (
    SELECT DISTINCT s2.publisher_id
    FROM public.social_post_jobs x
    JOIN public.sponsored_jobs s2 ON s2.id = x.job_id
    WHERE x.platform = p_platform
  ),
  c AS (
    SELECT s.id, s.title, s.publisher_id, p.name AS company, coalesce(s.image_url, p.logo_url) AS logo,
           s.city, co.name AS country, co.iso_code AS iso, s.remote, s.work_arrangement, s.employment_type, s.experience_level, s.job_function,
           CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END AS salary,
           (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa,
           (s.employment_type IN ('Internship', 'Apprenticeship') OR s.title ~* '(intern|internship|student|graduate|trainee|werkstudent|apprentice|junior)') AS student,
           coalesce(s.released_at, s.created_at) AS added_at
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release
      AND (s.expires_at IS NULL OR s.expires_at > now() + interval '2 days')
      AND coalesce(s.released_at, s.created_at) > now() - interval '36 hours'
      AND length(btrim(s.title)) BETWEEN 4 AND 140
      AND (s.city IS NOT NULL OR s.country_id IS NOT NULL OR s.remote OR s.work_arrangement = 'remote')
      AND NOT EXISTS (SELECT 1 FROM public.social_post_jobs x WHERE x.platform = p_platform AND x.job_id = s.id)
      AND s.publisher_id NOT IN (SELECT publisher_id FROM posted)
  ),
  one AS (
    SELECT DISTINCT ON (publisher_id) * FROM c
    ORDER BY publisher_id, (logo IS NOT NULL) DESC, added_at DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(one) - 'publisher_id' ORDER BY (logo IS NOT NULL) DESC, added_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM one ORDER BY (logo IS NOT NULL) DESC, added_at DESC LIMIT least(greatest(p_count, 1), 20)) one;
$$;
REVOKE ALL ON FUNCTION public.social_pick_new_company_jobs(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_pick_new_company_jobs(text, integer) TO authenticated, service_role;

-- ===========================================================================
-- 2. RECRUITER CONTACTS FROM JOB ADS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.job_contacts (
  job_id uuid NOT NULL REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) BETWEEN 6 AND 120),
  name text CHECK (name IS NULL OR char_length(name) <= 80),
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, email)
);
CREATE INDEX IF NOT EXISTS job_contacts_email_idx ON public.job_contacts (email);
ALTER TABLE public.job_contacts ENABLE ROW LEVEL SECURITY;
-- Read through the functions below only (they keep to live jobs).
REVOKE ALL ON public.job_contacts FROM anon, authenticated;

-- Which jobs the backfill has already read.
CREATE TABLE IF NOT EXISTS public.job_contact_scans (
  job_id uuid PRIMARY KEY REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_contact_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_contact_scans FROM anon, authenticated;

/* The emails in one ad, with a name when one is written next to them:
   "Contact: Anna Müller", "Anna Müller, Talent Acquisition — anna@…",
   "send your CV to Anna Müller (anna@…)". Addresses that aren't a person or
   a hiring inbox (no-reply, privacy, MadeVisa's own…) are left out. */
CREATE OR REPLACE FUNCTION public.emails_in_ad(p_text text)
RETURNS TABLE (email text, name text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t text;
  m text[];
  e text;
  pos integer;
  around text;
  nm text;
  seen text[] := '{}';
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN; END IF;
  -- Plain text: tags out, "mailto:" links kept as their address, entities decoded.
  t := regexp_replace(p_text, 'mailto:', ' ', 'gi');
  t := regexp_replace(t, '<[^>]+>', ' ', 'g');
  t := replace(replace(replace(replace(t, '&nbsp;', ' '), '&amp;', '&'), '&#64;', '@'), '&commat;', '@');
  t := regexp_replace(t, '\s+', ' ', 'g');
  FOR m IN SELECT regexp_matches(t, '([A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24})', 'g') LOOP
    e := lower(rtrim(m[1], '.-'));
    CONTINUE WHEN e = ANY (seen);
    seen := seen || e;
    CONTINUE WHEN e ~ '(^|[._-])(no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|abuse|privacy|gdpr|dpo|dataprotection|data-protection|datenschutz|legal|compliance|unsubscribe|security|webmaster|example|test|sentry|bounce)([._-]|@)';
    CONTINUE WHEN e ~ '@(.*\.)?(madevisa\.com|example\.(com|org)|sentry\.io|wixpress\.com|domain\.com|email\.com|yourcompany\.com|company\.com)$';
    CONTINUE WHEN e ~ '\.(png|jpe?g|gif|svg|webp)$';
    -- A name just before the address (within ~90 characters).
    pos := strpos(lower(t), e);
    around := CASE WHEN pos > 0 THEN substr(t, greatest(1, pos - 90), least(pos - 1, 90)) ELSE '' END;
    nm := substring(around FROM '(?:[Cc]ontact(?: person)?|[Aa]nsprechpartner(?:in)?|[Rr]ecruiter|[Hh]iring [Mm]anager|[Ss]end (?:your )?(?:CV|cv|application|resume)s? to)\s*[:\-–]?\s*((?:[A-ZÀ-Ý][a-zà-ÿ''-]+)(?:\s+[A-ZÀ-Ý][a-zà-ÿ''-]+){1,2})\s*[,(\-–:]*\s*$');
    IF nm IS NULL THEN
      nm := substring(around FROM '((?:[A-ZÀ-Ý][a-zà-ÿ''-]+)(?:\s+[A-ZÀ-Ý][a-zà-ÿ''-]+){1,2})\s*,?\s*(?:\(|–|-)?\s*(?:Talent|Recruit|HR|Human Resources|People|Hiring)[A-Za-z &]*[)\-–:,]*\s*$');
    END IF;
    nm := btrim(regexp_replace(nm, '^(Or|And|Oder|Und|Ou|Et|Please|Contact|Email|Mail|Write|To)\s+', ''));
    IF nm !~ '\s' THEN nm := NULL; END IF;
    -- Not a name: words that look like one but aren't.
    IF nm ~* '^(please|send|apply|contact|email|mail|the|our|your|human resources|talent acquisition|hiring team|for more)' THEN nm := NULL; END IF;
    email := e;
    name := left(nm, 80);
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_job_contacts(p_job uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j record;
  n integer := 0;
BEGIN
  SELECT id, description, requirements, contact_email INTO j FROM public.sponsored_jobs WHERE id = p_job;
  IF NOT FOUND THEN RETURN 0; END IF;
  DELETE FROM public.job_contacts WHERE job_id = p_job;
  INSERT INTO public.job_contacts (job_id, email, name)
  SELECT p_job, x.email, x.name
  FROM (
    SELECT DISTINCT ON (email) email, name
    FROM (
      SELECT * FROM public.emails_in_ad(coalesce(j.description, '') || ' ' || coalesce(j.requirements, ''))
      UNION ALL
      -- The employer's own contact address on a job they posted on MadeVisa (not MadeVisa's default).
      SELECT lower(j.contact_email), NULL WHERE j.contact_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' AND lower(j.contact_email) !~ '@madevisa\.com$'
    ) a
    ORDER BY email, name NULLS LAST
  ) x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.job_contact_scans (job_id) VALUES (p_job) ON CONFLICT (job_id) DO UPDATE SET scanned_at = now();
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.read_job_contacts(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.job_contacts_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.read_job_contacts(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'job contacts: %', SQLERRM; -- never block saving a job
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS job_contacts_on_change ON public.sponsored_jobs;
CREATE TRIGGER job_contacts_on_change
  AFTER INSERT OR UPDATE OF description, requirements, contact_email ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_contacts_on_change();

-- Older jobs: newest first, a batch at a time (cron below), until all are read.
CREATE OR REPLACE FUNCTION public.backfill_job_contacts(p_batch integer DEFAULT 1500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '110s'
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT s.id FROM public.sponsored_jobs s
    WHERE s.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM public.job_contact_scans x WHERE x.job_id = s.id)
    ORDER BY coalesce(s.released_at, s.created_at) DESC
    LIMIT greatest(1, least(p_batch, 5000))
  LOOP
    BEGIN
      PERFORM public.read_job_contacts(r.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.job_contact_scans (job_id) VALUES (r.id) ON CONFLICT DO NOTHING;
    END;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.backfill_job_contacts(integer) FROM PUBLIC, anon, authenticated;

/* The public list on /network: one row per address, from live jobs only.
   An address seen at several companies (an agency) shows the company with the
   most live jobs, and how many companies it hires for. */
CREATE OR REPLACE FUNCTION public.recruiter_contacts(p_search text DEFAULT NULL, p_limit integer DEFAULT 60, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
  WITH live AS (
    SELECT c.email, c.name, s.id AS job_id, s.title, s.publisher_id, p.name AS company, p.logo_url AS logo,
           co.name AS country, co.iso_code AS iso, coalesce(s.released_at, s.created_at) AS at
    FROM public.job_contacts c
    JOIN public.sponsored_jobs s ON s.id = c.job_id
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
  ),
  per AS (
    SELECT email,
           (array_agg(name ORDER BY at DESC) FILTER (WHERE name IS NOT NULL))[1] AS name,
           count(DISTINCT job_id) AS jobs,
           count(DISTINCT publisher_id) AS companies,
           max(at) AS last_at
    FROM live GROUP BY email
  ),
  top_company AS (
    SELECT DISTINCT ON (email) email, publisher_id, company, logo, country, iso
    FROM (SELECT email, publisher_id, company, logo, country, iso, count(*) OVER (PARTITION BY email, publisher_id) AS n, at FROM live) x
    ORDER BY email, n DESC, at DESC
  ),
  latest AS (
    SELECT DISTINCT ON (email) email, job_id, title FROM live ORDER BY email, at DESC
  ),
  rows AS (
    SELECT per.email, per.name, per.jobs, per.companies, per.last_at, t.publisher_id, t.company, t.logo, t.country, t.iso, l.job_id, l.title
    FROM per JOIN top_company t USING (email) JOIN latest l USING (email)
    WHERE p_search IS NULL OR btrim(p_search) = ''
       OR per.email ILIKE '%' || btrim(p_search) || '%' OR t.company ILIKE '%' || btrim(p_search) || '%'
       OR coalesce(per.name, '') ILIKE '%' || btrim(p_search) || '%' OR coalesce(t.country, '') ILIKE '%' || btrim(p_search) || '%'
       OR l.title ILIKE '%' || btrim(p_search) || '%'
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM rows),
    'companies', (SELECT count(DISTINCT publisher_id) FROM rows),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'email', email, 'name', name, 'jobs', jobs, 'companies', companies, 'last_at', last_at,
        'company_id', publisher_id, 'company', company, 'logo', logo, 'country', country, 'iso', iso,
        'job_id', job_id, 'job_title', title) ORDER BY last_at DESC)
      FROM (SELECT * FROM rows ORDER BY last_at DESC LIMIT least(greatest(p_limit, 1), 120) OFFSET greatest(p_offset, 0)) r
    ), '[]'::jsonb)
  );
$$;
GRANT EXECUTE ON FUNCTION public.recruiter_contacts(text, integer, integer) TO anon, authenticated;

-- MadeVisa users are no longer listed in a public directory.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'network_directory' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.network_directory(text, text, text, integer, integer) FROM anon, authenticated';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'network_directory: %', SQLERRM;
END $$;

-- ===========================================================================
-- 3. "JOBS FOR YOU" EMAILS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.for_you_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'off')),
  unsub_token uuid NOT NULL DEFAULT gen_random_uuid(),
  last_sent_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS for_you_settings_unsub_idx ON public.for_you_settings (unsub_token);
ALTER TABLE public.for_you_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "for_you_settings_own" ON public.for_you_settings;
CREATE POLICY "for_you_settings_own" ON public.for_you_settings FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.for_you_settings FROM anon;
GRANT SELECT ON public.for_you_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.job_searches (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  q text NOT NULL DEFAULT '' CHECK (char_length(q) <= 120),
  country text CHECK (country IS NULL OR char_length(country) <= 2),
  category text CHECK (category IS NULL OR char_length(category) <= 80),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_searches_user_idx ON public.job_searches (user_id, at DESC);
ALTER TABLE public.job_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_searches FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.for_you_sent (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
ALTER TABLE public.for_you_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.for_you_sent FROM anon, authenticated;

-- A search on /jobs by a signed-in person (the site calls this a few seconds after they stop typing).
CREATE OR REPLACE FUNCTION public.note_job_search(p_q text, p_country text DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_q text := left(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 120);
  v_cc text := NULL;
  v_cat text := nullif(left(btrim(coalesce(p_category, '')), 80), '');
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  IF nullif(btrim(coalesce(p_country, '')), '') IS NOT NULL THEN
    SELECT iso_code INTO v_cc FROM public.countries WHERE iso_code = upper(btrim(p_country)) OR lower(name) = lower(btrim(p_country)) LIMIT 1;
  END IF;
  IF char_length(v_q) < 2 AND v_cc IS NULL AND v_cat IS NULL THEN RETURN; END IF;
  -- The same search again only moves to the top.
  UPDATE public.job_searches SET at = now()
  WHERE job_searches.user_id = me AND lower(job_searches.q) = lower(v_q) AND coalesce(job_searches.country, '') = coalesce(v_cc, '') AND coalesce(job_searches.category, '') = coalesce(v_cat, '');
  IF NOT FOUND THEN
    INSERT INTO public.job_searches (user_id, q, country, category) VALUES (me, v_q, v_cc, v_cat);
  END IF;
  -- Keep the last 20.
  DELETE FROM public.job_searches WHERE user_id = me AND id NOT IN (SELECT id FROM public.job_searches WHERE user_id = me ORDER BY at DESC LIMIT 20);
END;
$$;
REVOKE ALL ON FUNCTION public.note_job_search(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_job_search(text, text, text) TO authenticated;

/* What the email looks for, for one person: title phrases (from the CV, the
   profile, alerts and searches), skills (from the CV) and countries. */
CREATE OR REPLACE FUNCTION public.for_you_terms(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cv jsonb;
  pr record;
  titles text[] := '{}';
  skills text[] := '{}';
  countries text[] := '{}';
  src text[] := '{}';
  t text;
  core text;
BEGIN
  SELECT profile INTO cv FROM public.user_cvs WHERE user_id = p_user;
  SELECT occupation, specialization INTO pr FROM public.profiles WHERE id = p_user;

  -- Phrases, in order of trust: profile, CV titles, CV roles, alerts, searches.
  FOR t IN
    SELECT x FROM (
      SELECT pr.specialization AS x, 1 AS o UNION ALL
      SELECT pr.occupation, 2 UNION ALL
      SELECT * FROM (SELECT jsonb_array_elements_text(coalesce(cv->'titles', '[]'::jsonb)), 3 LIMIT 4) a UNION ALL
      SELECT * FROM (SELECT r->>'label', 4 FROM jsonb_array_elements(coalesce(cv->'roles', '[]'::jsonb)) r LIMIT 3) b UNION ALL
      SELECT keywords, 5 FROM public.job_alerts WHERE user_id = p_user AND active AND keywords <> '' UNION ALL
      SELECT * FROM (SELECT q, 6 FROM public.job_searches WHERE user_id = p_user AND q <> '' ORDER BY at DESC LIMIT 8) c
    ) all_terms WHERE x IS NOT NULL ORDER BY o
  LOOP
    -- "Senior Software Engineer II" → "software engineer": seniority words don't decide the job.
    core := btrim(regexp_replace(regexp_replace(lower(t), '\m(senior|sr|junior|jr|lead|principal|staff|head of|mid|mid-level|entry|entry-level|intern|trainee|graduate|chief|i|ii|iii|iv)\M\.?', ' ', 'g'), '[^[:alnum:]+#. -]+|\s+', ' ', 'g'));
    core := btrim(regexp_replace(core, '\s+', ' ', 'g'));
    CONTINUE WHEN char_length(core) < 3 OR core = ANY (titles);
    titles := titles || core;
    EXIT WHEN array_length(titles, 1) >= 12;
  END LOOP;

  -- Skills the CV names most (ids like "python", "machine-learning"); short or vague ones are left out.
  SELECT coalesce(array_agg(replace(k, '-', ' ') ORDER BY v DESC), '{}') INTO skills
  FROM (
    SELECT key AS k, value::numeric AS v FROM jsonb_each_text(coalesce(cv->'skills', '{}'::jsonb))
    WHERE char_length(key) >= 3 AND key NOT IN ('communication', 'teamwork', 'leadership', 'problem-solving', 'english', 'customer-focus', 'decision-making', 'work-under-pressure', 'sales', 'research', 'management')
    ORDER BY value::numeric DESC LIMIT 12
  ) s;

  SELECT coalesce(array_agg(DISTINCT c), '{}') INTO countries FROM (
    SELECT country_code AS c FROM public.job_alerts WHERE user_id = p_user AND active AND country_code IS NOT NULL
    UNION SELECT country FROM (SELECT country FROM public.job_searches WHERE user_id = p_user AND country IS NOT NULL ORDER BY at DESC LIMIT 5) x
  ) y;

  IF cv IS NOT NULL THEN src := src || 'your CV'::text; END IF;
  IF pr.specialization IS NOT NULL OR pr.occupation IS NOT NULL THEN src := src || 'your profile'::text; END IF;
  IF EXISTS (SELECT 1 FROM public.job_alerts WHERE user_id = p_user AND active) THEN src := src || 'your job alerts'::text; END IF;
  IF EXISTS (SELECT 1 FROM public.job_searches WHERE user_id = p_user) THEN src := src || 'your searches'::text; END IF;
  RETURN jsonb_build_object('titles', to_jsonb(titles), 'skills', to_jsonb(skills), 'countries', to_jsonb(countries), 'from', to_jsonb(src));
END;
$$;
REVOKE ALL ON FUNCTION public.for_you_terms(uuid) FROM PUBLIC, anon, authenticated;

/* The new jobs that fit one person, best first. A job fits when its title (or
   its job function) contains one of their phrases; skills in the title and the
   ad, a country they look at, and visa sponsorship raise it. Jobs already
   emailed to them are never included. */
CREATE OR REPLACE FUNCTION public.for_you_matches(p_user uuid, p_since timestamptz, p_limit integer DEFAULT 40)
RETURNS TABLE (job_id uuid, title text, company text, city text, country text, visa boolean, salary text, score integer, why text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  terms jsonb := public.for_you_terms(p_user);
  titles text[];
  skills text[];
  countries text[];
BEGIN
  SELECT coalesce(array_agg(x), '{}') INTO titles FROM jsonb_array_elements_text(terms->'titles') x;
  SELECT coalesce(array_agg(x), '{}') INTO skills FROM jsonb_array_elements_text(terms->'skills') x;
  SELECT coalesce(array_agg(x), '{}') INTO countries FROM jsonb_array_elements_text(terms->'countries') x;
  IF coalesce(array_length(titles, 1), 0) = 0 THEN RETURN; END IF;
  RETURN QUERY
  WITH cand AS (
    SELECT s.id, s.title, p.name AS company, s.city, co.name AS country, co.iso_code AS iso,
           (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa,
           CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END AS salary,
           lower(s.title || ' ' || coalesce(s.job_function, '')) AS head,
           lower(left(coalesce(s.requirements, '') || ' ' || coalesce(s.description, ''), 5000)) AS body,
           coalesce(s.released_at, s.created_at) AS at
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE coalesce(s.released_at, s.created_at) > p_since AND coalesce(s.released_at, s.created_at) <= now()
      AND s.status = 'published' AND NOT s.awaiting_release
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND NOT EXISTS (SELECT 1 FROM public.for_you_sent x WHERE x.user_id = p_user AND x.job_id = s.id)
      AND lower(s.title || ' ' || coalesce(s.job_function, '')) LIKE ANY (SELECT '%' || t || '%' FROM unnest(titles) t)
  ),
  scored AS (
    SELECT c.*,
           (SELECT t FROM unnest(titles) WITH ORDINALITY u(t, o) WHERE c.head LIKE '%' || t || '%' ORDER BY o LIMIT 1) AS hit,
           (SELECT array_agg(k) FROM unnest(skills) k WHERE c.head ~ ('\m' || regexp_replace(k, '([.+#*?()\[\]\\^$|])', '\\\1', 'g') || '\M')
              OR c.body ~ ('\m' || regexp_replace(k, '([.+#*?()\[\]\\^$|])', '\\\1', 'g') || '\M')) AS sk
    FROM cand c
  )
  SELECT s.id, s.title, s.company, s.city, s.country, s.visa, s.salary,
         (10 + least(coalesce(array_length(s.sk, 1), 0), 6) * 3 + CASE WHEN s.iso = ANY (countries) THEN 4 ELSE 0 END + CASE WHEN s.visa THEN 2 ELSE 0 END)::integer AS score,
         concat_ws(' · ', 'matches “' || s.hit || '”', CASE WHEN array_length(s.sk, 1) > 0 THEN array_to_string(s.sk[1:3], ', ') END) AS why
  FROM scored s
  ORDER BY score DESC, s.at DESC
  LIMIT greatest(1, least(p_limit, 100));
END;
$$;
REVOKE ALL ON FUNCTION public.for_you_matches(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;

-- Settings for the signed-in person (the card on the profile page).
CREATE OR REPLACE FUNCTION public.my_for_you()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  f public.for_you_settings;
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO f FROM public.for_you_settings WHERE user_id = me;
  RETURN jsonb_build_object(
    'frequency', coalesce(f.frequency, 'daily'),
    'last_sent_at', f.last_sent_at,
    'terms', public.for_you_terms(me)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_for_you() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_for_you() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_for_you(p_frequency text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF p_frequency NOT IN ('daily', 'weekly', 'off') THEN RAISE EXCEPTION 'Choose daily, weekly or off.'; END IF;
  INSERT INTO public.for_you_settings (user_id, frequency) VALUES (me, p_frequency)
  ON CONFLICT (user_id) DO UPDATE SET frequency = excluded.frequency, updated_at = now();
  RETURN p_frequency;
END;
$$;
REVOKE ALL ON FUNCTION public.set_for_you(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_for_you(text) TO authenticated;

-- One-click unsubscribe from the email (no sign-in).
CREATE OR REPLACE FUNCTION public.unsubscribe_for_you(p_token uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.for_you_settings SET frequency = 'off', updated_at = now() WHERE unsub_token = p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN CASE WHEN n > 0 THEN 'Jobs for you' ELSE '' END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unsubscribe_for_you(uuid) TO anon, authenticated;

-- The email run. p_mode = 'daily' (people on daily) or 'weekly' (people on weekly).
CREATE OR REPLACE FUNCTION public.run_for_you_emails(p_mode text DEFAULT 'daily')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '280s'
AS $$
DECLARE
  FOR_YOU_PER_RUN constant integer := 150;
  started timestamptz := clock_timestamp();
  key text;
  sender text;
  u record;
  since timestamptz;
  cap integer;
  hits integer;
  shown jsonb;
  rows_html text;
  rows_text text;
  subject text;
  unsub text;
  manage text := 'https://madevisa.com/profile?tab=settings#for-you';
  token uuid;
  sources text;
  src_arr text[];
  sent integer := 0;
BEGIN
  IF p_mode NOT IN ('daily', 'weekly') THEN RAISE EXCEPTION 'p_mode must be daily or weekly'; END IF;
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' THEN RETURN 0; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';

  FOR u IN
    SELECT au.id, au.email, f.last_sent_at, f.unsub_token, f.last_checked_at
    FROM auth.users au
    LEFT JOIN public.for_you_settings f ON f.user_id = au.id
    WHERE au.email_confirmed_at IS NOT NULL AND au.email IS NOT NULL AND au.deleted_at IS NULL
      AND coalesce(f.frequency, 'daily') = p_mode
      AND (f.last_sent_at IS NULL OR f.last_sent_at < now() - CASE WHEN p_mode = 'daily' THEN interval '20 hours' ELSE interval '6 days' END)
      AND (f.last_checked_at IS NULL OR f.last_checked_at < now() - interval '6 hours')
    ORDER BY f.last_checked_at NULLS FIRST
  LOOP
    EXIT WHEN sent >= FOR_YOU_PER_RUN OR clock_timestamp() - started > interval '240 seconds';

    -- A row for everyone the run looks at (it holds the unsubscribe token).
    INSERT INTO public.for_you_settings (user_id) VALUES (u.id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.for_you_settings SET last_checked_at = now() WHERE user_id = u.id RETURNING unsub_token INTO token;

    -- New since the last email (first email: the last day, or week).
    since := coalesce(u.last_sent_at, now() - CASE WHEN p_mode = 'daily' THEN interval '1 day' ELSE interval '7 days' END);
    cap := CASE WHEN public.is_pro(u.id) THEN 10 ELSE 5 END;

    -- Best first, one per company.
    WITH m AS (SELECT * FROM public.for_you_matches(u.id, since, 60)),
         one AS (SELECT DISTINCT ON (company) * FROM m ORDER BY company, score DESC),
         ranked AS (SELECT *, row_number() OVER (ORDER BY score DESC, job_id) AS rn FROM one)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(ranked) ORDER BY rn) FILTER (WHERE rn <= cap), '[]'::jsonb)
    INTO hits, shown FROM ranked;

    -- Nothing new that fits → no email (the window stays where it is).
    CONTINUE WHEN hits = 0;

    -- "your CV, your profile and your searches"
    SELECT array_agg(x ORDER BY o) INTO src_arr FROM jsonb_array_elements_text(public.for_you_terms(u.id)->'from') WITH ORDINALITY t(x, o);
    sources := CASE WHEN coalesce(array_length(src_arr, 1), 0) <= 1 THEN src_arr[1]
                    ELSE array_to_string(src_arr[1:array_length(src_arr, 1) - 1], ', ') || ' and ' || src_arr[array_length(src_arr, 1)] END;
    unsub := 'https://madevisa.com/alerts/unsubscribe?k=foryou&t=' || token::text;
    SELECT string_agg(
             '<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">'
             || '<a href="https://madevisa.com/jobs/sponsored-' || (j->>'job_id') || '?s=fy" style="color:#1D4ED8;font-weight:bold;font-size:16px;text-decoration:none">'
             || replace(replace(j->>'title', '<', '&lt;'), '>', '&gt;') || '</a><br>'
             || '<span style="color:#374151;font-size:14px">' || replace(replace(j->>'company', '<', '&lt;'), '>', '&gt;')
             || coalesce(' · ' || replace(replace(nullif(concat_ws(', ', j->>'city', j->>'country'), ''), '<', '&lt;'), '>', '&gt;'), '') || '</span>'
             || CASE WHEN (j->>'visa')::boolean THEN ' <span style="color:#047857;font-size:13px;font-weight:bold">· Visa sponsorship</span>' ELSE '' END
             || CASE WHEN j->>'salary' IS NOT NULL THEN '<br><span style="color:#111827;font-size:13px">' || replace(replace(j->>'salary', '<', '&lt;'), '>', '&gt;') || '</span>' ELSE '' END
             || '<br><span style="color:#6b7280;font-size:12px">Why: ' || replace(replace(j->>'why', '<', '&lt;'), '>', '&gt;') || '</span>'
             || '</td></tr>', '' ORDER BY (j->>'rn')::int),
           string_agg('- ' || (j->>'title') || ' — ' || (j->>'company') || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'job_id') || '?s=fy', E'\n' ORDER BY (j->>'rn')::int)
    INTO rows_html, rows_text
    FROM jsonb_array_elements(shown) j;

    subject := hits || ' new ' || CASE WHEN hits = 1 THEN 'job' ELSE 'jobs' END || ' for you'
               || CASE WHEN p_mode = 'weekly' THEN ' this week' ELSE ' today' END
               || ' — ' || (shown->0->>'title');
    subject := left(subject, 120);

    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
        'to', jsonb_build_array(u.email),
        'subject', subject,
        'headers', jsonb_build_object('List-Unsubscribe', '<' || unsub || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'),
        'html', '<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#111827">'
                || '<p style="font-size:13px;color:#6b7280;margin:0">MadeVisa · Jobs for you</p>'
                || '<p style="font-size:20px;font-weight:bold;margin:6px 0 4px">' || hits || ' new ' || CASE WHEN hits = 1 THEN 'job fits' ELSE 'jobs fit' END || ' you</p>'
                || '<p style="font-size:14px;color:#4b5563;margin:0 0 8px">Posted ' || CASE WHEN p_mode = 'weekly' THEN 'this week' ELSE 'since your last email' END
                || ', picked from ' || coalesce(sources, 'your account') || '. You never get the same job twice.</p>'
                || '<table style="width:100%;border-collapse:collapse">' || rows_html || '</table>'
                || CASE WHEN hits > cap THEN
                     '<p style="margin:18px 0 0;padding:12px 14px;background:#EFF6FF;border-radius:10px;font-size:14px">'
                     || '<b>+' || (hits - cap) || ' more ' || CASE WHEN hits - cap = 1 THEN 'job fits' ELSE 'jobs fit' END || ' you.</b> '
                     || CASE WHEN cap < 10 THEN '<a href="https://madevisa.com/pricing?s=fy#pro" style="color:#1D4ED8;font-weight:bold">See them all with MadeVisa Pro →</a>'
                             ELSE '<a href="https://madevisa.com/cv-match?s=fy" style="color:#1D4ED8;font-weight:bold">See all your matches →</a>' END || '</p>'
                   ELSE '' END
                || '<p style="font-size:14px;color:#374151;margin-top:20px"><a href="https://madevisa.com/cv-match?s=fy" style="color:#1D4ED8">Open your matches</a> to see your score on each job and the skills your CV is missing.</p>'
                || '<p style="font-size:12px;color:#9ca3af;margin-top:24px">You get this ' || p_mode || ' because you have a MadeVisa account. '
                || '<a href="' || manage || '" style="color:#9ca3af">Daily, weekly or off</a> · <a href="' || unsub || '" style="color:#9ca3af">Unsubscribe in one click</a>.</p></div>',
        'text', hits || ' new jobs fit you' || E'\n\n' || rows_text
                || CASE WHEN hits > cap THEN E'\n\n+' || (hits - cap) || ' more: https://madevisa.com/pricing#pro' ELSE '' END
                || E'\n\nDaily, weekly or off: ' || manage || E'\nUnsubscribe: ' || unsub
      ),
      timeout_milliseconds := 10000
    );

    -- Never the same job twice: everything listed in this email is remembered.
    INSERT INTO public.for_you_sent (user_id, job_id)
    SELECT u.id, (j->>'job_id')::uuid FROM jsonb_array_elements(shown) j
    ON CONFLICT DO NOTHING;
    UPDATE public.for_you_settings SET last_sent_at = now() WHERE user_id = u.id;
    sent := sent + 1;
  END LOOP;

  DELETE FROM public.for_you_sent WHERE sent_at < now() - interval '400 days';
  RETURN sent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'run_for_you_emails: %', SQLERRM;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.run_for_you_emails(text) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- Schedules
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('madevisa-for-you-daily', 'madevisa-for-you-weekly', 'madevisa-job-contacts');
    -- Every morning, in passes at 07:10–12:10 UTC: each pass sends up to FOR_YOU_PER_RUN emails, and nobody
    -- gets two in a day (20-hour rule), so a big list is simply spread over the passes.
    PERFORM cron.schedule('madevisa-for-you-daily', '10 7-12 * * *', $c$select public.run_for_you_emails('daily')$c$);
    -- Weekly people: Mondays, same idea.
    PERFORM cron.schedule('madevisa-for-you-weekly', '40 7-12 * * 1', $c$select public.run_for_you_emails('weekly')$c$);
    -- Recruiter contacts from older ads, a batch every 10 minutes (new ads are read when they are saved).
    PERFORM cron.schedule('madevisa-job-contacts', '*/10 * * * *', $c$select public.backfill_job_contacts(1500)$c$);
  END IF;
END $$;
