/*
# CV match + one plan
Run AFTER 20261124090000_social_reels.sql (and 20261125090000 if you have it).
Safe to run more than once.

What changes
1. CVs. Every job seeker's CV is kept with their account: the text and what
   MadeVisa read from it in `user_cvs`, the original file in the private
   `cvs` storage bucket. Only the owner can read either.
2. CV checks. "Check your match" on a job page is recorded in `cv_checks`.
   - The score is free and unlimited.
   - Missing skills are shown on 3 different jobs a day for free accounts
     (a job you unlocked once stays unlocked). Pro has no limit.
3. One plan. MadeVisa Pro now includes 50 sponsorship documents a calendar
   month (was 10). Documents are no longer sold as credit packs, and Pro
   Relocation is retired.
4. No free document for new accounts. Accounts created BEFORE this file is
   first run keep their one free document if they haven't used it; credits
   that were bought or earned are kept and can still be used. Nothing
   already made is lost.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. CVs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_cvs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  file_size integer CHECK (file_size IS NULL OR file_size BETWEEN 0 AND 10485760),
  -- Path in the `cvs` bucket, when the original file was uploaded.
  storage_path text CHECK (storage_path IS NULL OR char_length(storage_path) <= 300),
  -- Plain text of the CV.
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 80000),
  -- What MadeVisa read from it (skills, titles, years, languages…).
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_cvs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_cvs_owner_select" ON public.user_cvs;
CREATE POLICY "user_cvs_owner_select" ON public.user_cvs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "user_cvs_owner_insert" ON public.user_cvs;
CREATE POLICY "user_cvs_owner_insert" ON public.user_cvs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "user_cvs_owner_update" ON public.user_cvs;
CREATE POLICY "user_cvs_owner_update" ON public.user_cvs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "user_cvs_owner_delete" ON public.user_cvs;
CREATE POLICY "user_cvs_owner_delete" ON public.user_cvs FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.user_cvs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_cvs TO authenticated;

CREATE OR REPLACE FUNCTION public.user_cvs_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_cvs_touch ON public.user_cvs;
CREATE TRIGGER user_cvs_touch BEFORE UPDATE ON public.user_cvs
  FOR EACH ROW EXECUTE FUNCTION public.user_cvs_touch();

-- The original files: private, 5 MB, documents only. Each person can only
-- touch the folder named after their own user id.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs', 'cvs', false, 5242880,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf', 'text/rtf', 'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "cvs_owner_select" ON storage.objects;
CREATE POLICY "cvs_owner_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "cvs_owner_insert" ON storage.objects;
CREATE POLICY "cvs_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "cvs_owner_update" ON storage.objects;
CREATE POLICY "cvs_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "cvs_owner_delete" ON storage.objects;
CREATE POLICY "cvs_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 2. CV checks: score always, missing skills on 3 jobs a day (free)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cv_checks (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The job as the site knows it: a job uuid, or a curated job's id.
  job_key text NOT NULL CHECK (char_length(job_key) BETWEEN 1 AND 80),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Missing skills were shown for this job.
  unlocked boolean NOT NULL DEFAULT false,
  -- Day (UTC) the missing skills were unlocked — what the daily limit counts.
  unlocked_on date,
  checks integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_key)
);
CREATE INDEX IF NOT EXISTS cv_checks_day_idx ON public.cv_checks (user_id, unlocked_on) WHERE unlocked;
CREATE INDEX IF NOT EXISTS cv_checks_created_idx ON public.cv_checks (created_at DESC);

ALTER TABLE public.cv_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cv_checks_owner_select" ON public.cv_checks;
CREATE POLICY "cv_checks_owner_select" ON public.cv_checks FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
-- Rows are written only by cv_check() below.
REVOKE ALL ON public.cv_checks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cv_checks FROM authenticated;
GRANT SELECT ON public.cv_checks TO authenticated;

-- Free accounts: jobs a day with missing skills shown. Keep in step with FREE_DAILY_CHECKS in src/lib/pricing.ts.
CREATE OR REPLACE FUNCTION public.cv_free_daily_checks()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 3 $$;

-- Record a check and say whether this job's missing skills may be shown.
CREATE OR REPLACE FUNCTION public.cv_check(p_job text, p_score integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  today date := (now() AT TIME ZONE 'utc')::date;
  lim integer := public.cv_free_daily_checks();
  pro boolean;
  used integer;
  was boolean;
  is_open boolean;
  key text := left(btrim(coalesce(p_job, '')), 80);
  sc integer := greatest(0, least(100, coalesce(p_score, 0)));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF key = '' THEN RAISE EXCEPTION 'No job.' USING ERRCODE = 'P0001'; END IF;
  pro := public.is_pro(me);

  SELECT unlocked INTO was FROM public.cv_checks WHERE user_id = me AND job_key = key FOR UPDATE;
  SELECT count(*) INTO used FROM public.cv_checks WHERE user_id = me AND unlocked AND unlocked_on = today;

  IF was IS TRUE THEN
    is_open := true;                      -- unlocked before: stays open, costs nothing
  ELSIF pro OR used < lim THEN
    is_open := true;
    IF NOT pro THEN used := used + 1; END IF;
  ELSE
    is_open := false;
  END IF;

  INSERT INTO public.cv_checks (user_id, job_key, score, unlocked, unlocked_on)
  VALUES (me, key, sc, is_open, CASE WHEN is_open AND NOT pro THEN today END)
  ON CONFLICT (user_id, job_key) DO UPDATE SET
    score = excluded.score,
    checks = public.cv_checks.checks + 1,
    unlocked = public.cv_checks.unlocked OR excluded.unlocked,
    unlocked_on = coalesce(public.cv_checks.unlocked_on, excluded.unlocked_on),
    updated_at = now();

  RETURN jsonb_build_object('unlocked', is_open, 'used', used, 'limit', lim, 'pro', pro);
END;
$$;
REVOKE ALL ON FUNCTION public.cv_check(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cv_check(text, integer) TO authenticated;

-- Where the signed-in person stands today (for "2 of 3 left today").
CREATE OR REPLACE FUNCTION public.cv_checks_today()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'used', (SELECT count(*) FROM public.cv_checks WHERE user_id = auth.uid() AND unlocked AND unlocked_on = (now() AT TIME ZONE 'utc')::date),
    'limit', public.cv_free_daily_checks(),
    'pro', public.is_pro(auth.uid()),
    'jobs', coalesce((SELECT jsonb_object_agg(job_key, jsonb_build_object('score', score, 'unlocked', unlocked))
                      FROM (SELECT job_key, score, unlocked FROM public.cv_checks WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 300) t), '{}'::jsonb)
  ) END;
$$;
REVOKE ALL ON FUNCTION public.cv_checks_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cv_checks_today() TO authenticated;

-- Admin → numbers for the new funnel.
CREATE OR REPLACE FUNCTION public.cv_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'cvs', (SELECT count(*) FROM public.user_cvs),
    'cvs_7d', (SELECT count(*) FROM public.user_cvs WHERE created_at > now() - interval '7 days'),
    'checks', (SELECT coalesce(sum(checks), 0) FROM public.cv_checks),
    'jobs_checked_7d', (SELECT count(*) FROM public.cv_checks WHERE updated_at > now() - interval '7 days'),
    'people_checking_7d', (SELECT count(DISTINCT user_id) FROM public.cv_checks WHERE updated_at > now() - interval '7 days'),
    'hit_limit_today', (SELECT count(*) FROM (
        SELECT user_id FROM public.cv_checks WHERE unlocked AND unlocked_on = (now() AT TIME ZONE 'utc')::date
        GROUP BY user_id HAVING count(*) >= public.cv_free_daily_checks()) t),
    'avg_score', (SELECT round(avg(score)) FROM public.cv_checks)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cv_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cv_admin_stats() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3 + 4. One plan: 50 documents a month in Pro, no free document for new accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_settings FROM anon, authenticated;

-- The moment the free document stopped: accounts older than this keep theirs.
-- Written once; running this file again does not move it.
INSERT INTO public.plan_settings (key, value) VALUES ('free_document_until', now()::text)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.brief_credits_for(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  quota constant integer := 50;
  cutoff timestamptz := (SELECT value::timestamptz FROM public.plan_settings WHERE key = 'free_document_until');
  joined timestamptz := (SELECT created_at FROM auth.users WHERE id = p_user);
  signup integer;
  granted integer;
  spent integer;
  used integer;
  pro boolean := public.is_pro(p_user);
  pro_used integer := 0;
  docs integer;
  pro_left integer;
BEGIN
  signup := CASE WHEN cutoff IS NOT NULL AND joined IS NOT NULL AND joined < cutoff THEN 1 ELSE 0 END;
  SELECT coalesce(sum(credits), 0) INTO granted FROM public.brief_credit_grants WHERE user_id = p_user;
  SELECT count(*) FILTER (WHERE paid_with = 'credit'), count(*) INTO spent, used FROM public.hiring_briefs WHERE user_id = p_user;
  IF pro THEN
    SELECT count(*) INTO pro_used FROM public.hiring_briefs
    WHERE user_id = p_user AND paid_with = 'pro' AND created_at >= date_trunc('month', now());
  END IF;
  docs := greatest(0, signup + granted - spent);
  pro_left := CASE WHEN pro THEN greatest(0, quota - pro_used) ELSE 0 END;
  RETURN jsonb_build_object(
    'unit', 'documents',
    'docs', docs,
    'granted', granted,
    'spent', spent,
    'used', used,
    'pro', pro,
    'pro_left', pro_left,
    'quota', quota,
    'left', docs + pro_left
  );
END;
$$;
REVOKE ALL ON FUNCTION public.brief_credits_for(uuid) FROM PUBLIC, anon, authenticated;

-- Same guard as 20261115090000, with the new wording when someone has no
-- plan, and a weekly fair-use ceiling that fits 50 a month.
CREATE OR REPLACE FUNCTION public.hiring_briefs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c jsonb;
  n integer;
  counters boolean := coalesce(current_setting('madevisa.brief_counters', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO n FROM public.hiring_briefs WHERE user_id = NEW.user_id AND created_at > now() - interval '7 days';
    IF n >= 30 THEN
      RAISE EXCEPTION 'That''s 30 sponsorship documents this week — the fair-use limit. Try again in a few days.' USING ERRCODE = 'P0001';
    END IF;
    c := public.brief_credits_for(NEW.user_id);
    IF (c->>'pro')::boolean AND (c->>'pro_left')::int > 0 THEN
      NEW.paid_with := 'pro';
    ELSIF (c->>'docs')::int >= 1 THEN
      NEW.paid_with := 'credit';
    ELSIF (c->>'pro')::boolean THEN
      RAISE EXCEPTION 'You''ve used all 50 sponsorship documents for this month. They renew on the 1st.' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'Sponsorship documents are part of MadeVisa Pro — 50 a month. See Pricing.' USING ERRCODE = 'P0001';
    END IF;
    NEW.cost_usd := 0;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
  ELSE
    IF NOT public.is_admin() THEN
      IF NOT counters THEN
        NEW.view_count := OLD.view_count;
        NEW.first_viewed_at := OLD.first_viewed_at;
        NEW.last_viewed_at := OLD.last_viewed_at;
      END IF;
      NEW.share_id := OLD.share_id;
      NEW.user_id := OLD.user_id;
      NEW.job_id := OLD.job_id;
      NEW.route_id := OLD.route_id;
      NEW.country_code := OLD.country_code;
      NEW.created_at := OLD.created_at;
      NEW.cost_usd := OLD.cost_usd;
      NEW.paid_with := OLD.paid_with;
    END IF;
    IF NEW.status = 'sent' AND OLD.status = 'created' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;
    IF NEW.status IN ('replied', 'interview', 'offer', 'declined') AND NEW.responded_at IS NULL THEN
      NEW.responded_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Admin activates a request after payment. p_months = months of Pro
-- (12 for a yearly plan). Older "document credit" requests still work:
-- there p_months = the number of documents paid for.
CREATE OR REPLACE FUNCTION public.activate_plan(p_request uuid, p_months integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests;
  n integer := greatest(coalesce(p_months, 1), 1);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.plan_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF r.user_id IS NOT NULL AND r.plan IN ('pro', 'relocation') THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, current_period_end, note)
    VALUES (r.user_id, 'pro', 'active', now(), now() + make_interval(months => n), 'Request ' || r.id)
    ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'active',
      current_period_end = greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + make_interval(months => n),
      note = excluded.note, updated_at = now();
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'plan_active', 'Your MadeVisa Pro is active',
            'Full CV match reports on every job, 50 sponsorship documents a month, instant job alerts and full company data are unlocked. Thank you for supporting MadeVisa!', '/jobs');
  ELSIF r.user_id IS NOT NULL AND r.plan = 'brief_credits' THEN
    INSERT INTO public.brief_credit_grants (user_id, credits, amount_usd, reason)
    VALUES (r.user_id, n, NULL, 'Request ' || r.id || coalesce(' · ' || r.price_label, ''));
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'credits_added',
            n::text || ' sponsorship document' || CASE WHEN n > 1 THEN 's' ELSE '' END || ' added',
            'Open a job, check your match, and prepare the document from there.',
            '/offers');
  END IF;
  UPDATE public.plan_requests SET status = 'active', handled_at = now() WHERE id = p_request;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plan(uuid, integer) TO authenticated;

-- Wording in unread notifications that promised the old allowance.
UPDATE public.notifications
SET body = replace(body, '10 sponsorship documents a month', '50 sponsorship documents a month')
WHERE read_at IS NULL AND body LIKE '%10 sponsorship documents a month%';
