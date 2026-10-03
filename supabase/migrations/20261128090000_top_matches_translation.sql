/*
# Jobs you match most + translation
Run AFTER 20261127090000_control_room_cvs_media.sql. Safe to run more than once.

1. cv_job_shortlist(title words, skill words, limit)
   The first step of "the jobs you match most" on /cv-match: the live jobs
   whose TITLE contains words from the person's CV (their job titles count
   three times as much as their skills), newest first among equals. The
   browser then reads the ads of the best ~50 and scores them with the
   usual rules. Only titles and list fields leave the database here; no CV
   text is sent, only up to 24 + 24 single words.
   At most 20 searches an hour per person (per visitor without an account),
   so the search can't be hammered.

2. Translation (optional — off until a translation key is set as a secret
   on the `translate` edge function):
   - job_translations: the English version of a job ad that is written in
     another language. Made once per job, then reused by everyone; removed
     when the ad's text changes.
   - user_cvs.text_en: the English version of a CV written in another
     language (accounts only). Cleared when the CV changes. At most 3 CV
     translations a day per account.
   - translate_settings / translate_usage: a monthly character budget, so
     the translation service's free allowance is never exceeded by accident.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Shortlist
-- ---------------------------------------------------------------------------
-- A word as a pattern: letters, digits, + # . only; must start at a word
-- boundary; short words (under 5 letters) must also end at one, longer ones
-- may continue ("engineer" finds "engineering").
CREATE OR REPLACE FUNCTION public._cv_word_pattern(p_word text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN w IS NULL OR char_length(w) < 2 OR char_length(w) > 30 THEN NULL
    ELSE '(^|[^a-z0-9])' || regexp_replace(w, '([.+#])', '\\\1', 'g') || CASE WHEN char_length(w) < 5 THEN '($|[^a-z0-9+#])' ELSE '' END
  END
  FROM (SELECT nullif(regexp_replace(lower(coalesce(p_word, '')), '[^a-z0-9+#.]', '', 'g'), '') AS w) t;
$$;

-- Searches per person per hour (accounts by id, visitors by the one-way code of their network address).
CREATE TABLE IF NOT EXISTS public.cv_search_log (
  who text NOT NULL,
  hour timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 1,
  PRIMARY KEY (who, hour)
);
ALTER TABLE public.cv_search_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cv_search_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.cv_search_hourly_limit()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 20 $$;

CREATE OR REPLACE FUNCTION public.cv_job_shortlist(p_title_words text[], p_skill_words text[] DEFAULT '{}', p_limit integer DEFAULT 150)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
DECLARE
  tw text[];
  sw text[];
  lim integer := greatest(10, least(coalesce(p_limit, 150), 300));
  v_out jsonb;
  v_who text := coalesce(auth.uid()::text, public.request_visitor_hash());
  v_used integer;
BEGIN
  IF v_who IS NOT NULL THEN
    INSERT INTO public.cv_search_log AS l (who, hour) VALUES (v_who, date_trunc('hour', now()))
    ON CONFLICT ON CONSTRAINT cv_search_log_pkey DO UPDATE SET n = l.n + 1
    RETURNING l.n INTO v_used;
    IF v_used > public.cv_search_hourly_limit() THEN
      RAISE EXCEPTION 'Too many searches in the last hour. Try again a little later.' USING ERRCODE = 'P0001';
    END IF;
    IF v_used = 1 THEN DELETE FROM public.cv_search_log WHERE hour < now() - interval '2 days'; END IF;
  END IF;
  SELECT array_agg(p) INTO tw FROM (SELECT DISTINCT public._cv_word_pattern(x) AS p FROM unnest(coalesce(p_title_words, '{}'::text[])) x LIMIT 24) t WHERE p IS NOT NULL;
  SELECT array_agg(p) INTO sw FROM (SELECT DISTINCT public._cv_word_pattern(x) AS p FROM unnest(coalesce(p_skill_words, '{}'::text[])) x LIMIT 24) t WHERE p IS NOT NULL;
  IF tw IS NULL AND sw IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'hits')::integer DESC, (r->>'created_at') DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'id', j.id, 'title', j.title, 'job_function', j.job_function, 'experience_level', j.experience_level,
      'city', j.city, 'remote', j.remote, 'created_at', j.created_at,
      'publisher_id', j.publisher_id, 'company', pub.name, 'logo_url', pub.logo_url,
      'country', c.name, 'cc', c.iso_code, 'hits', s.hits) AS r
    FROM public.sponsored_jobs j
    CROSS JOIN LATERAL (
      SELECT 3 * (SELECT count(*) FROM unnest(coalesce(tw, '{}'::text[])) p WHERE lower(j.title) ~ p)
               + (SELECT count(*) FROM unnest(coalesce(sw, '{}'::text[])) p WHERE lower(j.title) ~ p) AS hits
    ) s
    LEFT JOIN public.program_publishers pub ON pub.id = j.publisher_id
    LEFT JOIN public.countries c ON c.id = j.country_id
    WHERE j.status = 'published' AND NOT coalesce(j.awaiting_release, false)
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND s.hits > 0
    ORDER BY s.hits DESC, j.created_at DESC
    LIMIT lim
  ) t;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.cv_job_shortlist(text[], text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_job_shortlist(text[], text[], integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Translation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_translations (
  job_id uuid PRIMARY KEY REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  source_lang text,
  title text,
  html text NOT NULL,
  chars integer NOT NULL DEFAULT 0,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_translations ENABLE ROW LEVEL SECURITY;
-- A translation of a public job ad: anyone may read it; only the server writes.
DROP POLICY IF EXISTS "job_translations_read" ON public.job_translations;
CREATE POLICY "job_translations_read" ON public.job_translations FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.sponsored_jobs j WHERE j.id = job_id AND j.status = 'published' AND NOT coalesce(j.awaiting_release, false)));
REVOKE ALL ON public.job_translations FROM anon, authenticated;
GRANT SELECT ON public.job_translations TO anon, authenticated;

-- The ad changed: its translation is no longer right.
CREATE OR REPLACE FUNCTION public.job_translation_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.description IS DISTINCT FROM OLD.description OR NEW.title IS DISTINCT FROM OLD.title THEN
    DELETE FROM public.job_translations WHERE job_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sponsored_jobs_translation_stale ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_translation_stale AFTER UPDATE OF description, title ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.job_translation_stale();

-- CVs: the English version, for accounts.
ALTER TABLE public.user_cvs ADD COLUMN IF NOT EXISTS text_en text;
ALTER TABLE public.user_cvs ADD COLUMN IF NOT EXISTS tr_day date;
ALTER TABLE public.user_cvs ADD COLUMN IF NOT EXISTS tr_n integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.user_cvs_translation_stale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text THEN NEW.text_en := NULL; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_cvs_translation_stale ON public.user_cvs;
CREATE TRIGGER user_cvs_translation_stale BEFORE UPDATE ON public.user_cvs
  FOR EACH ROW EXECUTE FUNCTION public.user_cvs_translation_stale();

-- Budget
CREATE TABLE IF NOT EXISTS public.translate_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  -- Characters a month; NULL = the provider's free allowance, less a margin.
  monthly_chars integer CHECK (monthly_chars IS NULL OR monthly_chars BETWEEN 0 AND 100000000),
  max_job_chars integer NOT NULL DEFAULT 5000 CHECK (max_job_chars BETWEEN 500 AND 20000),
  max_cv_chars integer NOT NULL DEFAULT 12000 CHECK (max_cv_chars BETWEEN 500 AND 60000),
  provider text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.translate_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.translate_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.translate_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.translate_usage (
  month date PRIMARY KEY,
  chars bigint NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0
);
ALTER TABLE public.translate_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.translate_usage FROM anon, authenticated;

-- The server asks before every paid call: is there room for this many characters this month?
CREATE OR REPLACE FUNCTION public.translate_reserve(p_chars integer, p_default_cap integer, p_provider text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.translate_settings;
  m date := date_trunc('month', now() AT TIME ZONE 'utc')::date;
  cap bigint;
  used bigint;
BEGIN
  SELECT * INTO s FROM public.translate_settings WHERE id;
  IF NOT coalesce(s.enabled, true) OR coalesce(p_chars, 0) <= 0 THEN RETURN false; END IF;
  cap := coalesce(s.monthly_chars, p_default_cap, 0);
  INSERT INTO public.translate_usage (month) VALUES (m) ON CONFLICT (month) DO NOTHING;
  SELECT chars INTO used FROM public.translate_usage WHERE month = m FOR UPDATE;
  IF used + p_chars > cap THEN RETURN false; END IF;
  UPDATE public.translate_usage SET chars = chars + p_chars, calls = calls + 1 WHERE month = m;
  IF p_provider IS NOT NULL AND p_provider IS DISTINCT FROM s.provider THEN
    UPDATE public.translate_settings SET provider = p_provider, updated_at = now() WHERE id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.translate_reserve(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translate_reserve(integer, integer, text) TO service_role;

-- An account's CV translations today (3 a day).
CREATE OR REPLACE FUNCTION public.translate_cv_allow(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'utc')::date;
  n integer;
BEGIN
  UPDATE public.user_cvs SET tr_n = CASE WHEN tr_day = today THEN tr_n + 1 ELSE 1 END, tr_day = today
  WHERE user_id = p_user AND (tr_day IS DISTINCT FROM today OR tr_n < 3)
  RETURNING tr_n INTO n;
  RETURN n IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.translate_cv_allow(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translate_cv_allow(uuid) TO service_role;

-- Admin: what translation has used this month, and the switch.
CREATE OR REPLACE FUNCTION public.translate_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.translate_settings;
  m date := date_trunc('month', now() AT TIME ZONE 'utc')::date;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.translate_settings WHERE id;
  RETURN jsonb_build_object(
    'enabled', s.enabled, 'monthly_chars', s.monthly_chars, 'provider', s.provider, 'last_error', s.last_error,
    'used', coalesce((SELECT chars FROM public.translate_usage WHERE month = m), 0),
    'calls', coalesce((SELECT calls FROM public.translate_usage WHERE month = m), 0),
    'jobs', (SELECT count(*) FROM public.job_translations),
    'cvs', (SELECT count(*) FROM public.user_cvs WHERE text_en IS NOT NULL)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.translate_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.translate_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.translate_configure(p_enabled boolean DEFAULT NULL, p_monthly_chars integer DEFAULT NULL, p_reset_cap boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.translate_settings SET
    enabled = coalesce(p_enabled, enabled),
    monthly_chars = CASE WHEN p_reset_cap THEN NULL ELSE coalesce(p_monthly_chars, monthly_chars) END,
    updated_at = now()
  WHERE id;
  RETURN public.translate_status();
END;
$$;
REVOKE ALL ON FUNCTION public.translate_configure(boolean, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.translate_configure(boolean, integer, boolean) TO authenticated;
