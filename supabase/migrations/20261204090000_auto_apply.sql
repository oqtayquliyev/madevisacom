/*
# Auto Apply (CV match → applications)
Run AFTER 20261203090000_gumroad_checkout.sql. Safe to run more than once.
One paste, one tab, one click.

## What this adds
On /cv-match, after the matches: MadeVisa decides which jobs are worth
applying to, prepares each application (a CV tailored to the ad, a letter
when one is useful, the person's saved answers) and either sends it — for
jobs whose employer takes applications through MadeVisa — or hands it to
the person, ready to send on the employer's own site.

## Tables
  apply_settings            one row: on/off, applications a month for Free
                            and for Pro, the most a day. Nothing is sold
                            here — the numbers come with the existing plans.
  application_profiles      a person's saved, verified answers
  application_preferences   how they want Auto Apply to choose and pace
  application_queues        one batch ("Apply to 32 jobs"): running / paused /
                            stopped / done
  job_applications          one application: the job, the decision, where it
                            stands. UNIQUE (user, job) — never twice.
  application_attempts      each try at sending one
  application_documents     the exact CV and letter used
  application_answers       the exact answers used
  application_credits       the monthly allowance: one entry per application
  application_events        what happened, for the product funnel
  application_outcomes      what came of it (viewed, reply, interview, …)
  application_channels      the jobs whose employer takes applications
                            through MadeVisa, and the address for them
                            (admins only; never readable by the public).

## Rules the database keeps (the page cannot get round them)
- An application moves only along the allowed steps (apply_can_move).
- "Submitted" with verified = true is set ONLY by the sending function
  (apply_finish, service role) with a delivery confirmation. A person
  marking their own application as sent is submitted, verified = false.
- One application counts once against the month, and only when MadeVisa
  has finished its part: sent with a confirmation, or prepared and handed
  to the person ready to send. A failed send gives it back; one that is
  skipped, expired or waiting for an answer never counted
  (application_credits).
- No duplicates: not the same job twice, not the same role at the same
  company twice, not a job already applied to in the existing tracker
  (application_reports), not a closed job.
- A submitted application appears in the existing application tracker
  (application_reports) as confirmed.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Settings (no prices here — only how many come with each plan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.apply_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  free_monthly integer NOT NULL DEFAULT 5 CHECK (free_monthly BETWEEN 0 AND 100000),
  pro_monthly integer NOT NULL DEFAULT 150 CHECK (pro_monthly BETWEEN 0 AND 100000),
  -- application_reports allows 40 new rows in 24 hours; stay under it.
  daily_max integer NOT NULL DEFAULT 30 CHECK (daily_max BETWEEN 1 AND 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.apply_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.apply_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apply_settings FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Jobs that take applications through MadeVisa
-- ---------------------------------------------------------------------------
/*
One row per job whose employer has asked to receive applications through
MadeVisa, with the address they gave for it. Kept in its own table, which
only MadeVisa staff can read: a job's public row never carries the address
people's CVs are sent to.
*/
CREATE TABLE IF NOT EXISTS public.application_channels (
  job_id uuid PRIMARY KEY REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  email text NOT NULL CHECK (length(email) <= 200 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.application_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "application_channels_admin_read" ON public.application_channels;
CREATE POLICY "application_channels_admin_read" ON public.application_channels FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
REVOKE ALL ON public.application_channels FROM anon, authenticated;
GRANT SELECT ON public.application_channels TO authenticated;

/* The address applications for a job go to, or null when the employer takes them on its own site. */
CREATE OR REPLACE FUNCTION public.apply_channel_email(p_job uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT email FROM public.application_channels WHERE job_id = p_job AND enabled; $$;
REVOKE ALL ON FUNCTION public.apply_channel_email(uuid) FROM PUBLIC, anon, authenticated;

/* Admin: let MadeVisa send applications for a job, to an address the employer gave for that purpose — or stop. */
CREATE OR REPLACE FUNCTION public.apply_set_job_channel(p_job uuid, p_on boolean, p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sponsored_jobs WHERE id = p_job) THEN RAISE EXCEPTION 'Job not found.'; END IF;
  IF p_on THEN
    IF v_email = '' THEN RAISE EXCEPTION 'An email address for applications is needed.'; END IF;
    INSERT INTO public.application_channels (job_id, enabled, email, updated_by) VALUES (p_job, true, v_email, auth.uid())
    ON CONFLICT (job_id) DO UPDATE SET enabled = true, email = excluded.email, updated_by = excluded.updated_by, updated_at = now();
  ELSE
    UPDATE public.application_channels SET enabled = false, updated_by = auth.uid(), updated_at = now() WHERE job_id = p_job;
  END IF;
  RETURN jsonb_build_object('ok', true, 'on', p_on);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_set_job_channel(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_set_job_channel(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profile and preferences (the person's own; they read and write them)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_profiles (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- { full_name: { value, askEachTime, source, question?, updatedAt? }, … }
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 60000),
  -- Other questions, keyed by the question's own words.
  custom jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom) = 'object' AND pg_column_size(custom) < 200000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.application_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(prefs) = 'object' AND pg_column_size(prefs) < 20000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['application_profiles', 'application_preferences'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))', t || '_own', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_set_updated_at', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Queues and applications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'paused', 'stopped', 'done')),
  pause_reason text CHECK (pause_reason IS NULL OR pause_reason IN ('you', 'daily_limit', 'allowance', 'offline')),
  cv_at text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS application_queues_user_idx ON public.application_queues (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.application_queues(id) ON DELETE SET NULL,
  job_id uuid NOT NULL,
  publisher_id uuid,
  title text NOT NULL,
  company text NOT NULL,
  norm_title text NOT NULL DEFAULT '',
  cc text,
  country text,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- The application quality score and its parts (kept inside MadeVisa; null parts = unknown).
  quality jsonb,
  decision text NOT NULL DEFAULT 'auto' CHECK (decision IN ('auto', 'review', 'skip')),
  priority text NOT NULL DEFAULT 'good' CHECK (priority IN ('strong', 'good', 'backup')),
  rank integer NOT NULL DEFAULT 0,
  sponsorship text NOT NULL DEFAULT 'unclear' CHECK (sponsorship IN ('not_needed', 'likely', 'unclear', 'not_indicated', 'not_compatible')),
  channel text NOT NULL DEFAULT 'employer_site' CHECK (channel IN ('madevisa', 'employer_site')),
  url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'preparing', 'needs_answer', 'submitting', 'submitted', 'failed', 'skipped', 'already_applied', 'expired', 'review_required')),
  reason text,
  reason_code text,
  needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified boolean NOT NULL DEFAULT false,
  confirmation jsonb,
  cv_name text,
  cover_letter boolean NOT NULL DEFAULT false,
  -- The day it was first worked on (UTC): what the daily limit counts.
  day_started date,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id),
  -- Verified means there is a confirmation that did not come from the person.
  CHECK (NOT verified OR (status = 'submitted' AND confirmation IS NOT NULL AND confirmation->>'kind' <> 'self'))
);
CREATE INDEX IF NOT EXISTS job_applications_user_idx ON public.job_applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_applications_queue_idx ON public.job_applications (queue_id, rank DESC);
CREATE INDEX IF NOT EXISTS job_applications_day_idx ON public.job_applications (user_id, day_started);
CREATE INDEX IF NOT EXISTS job_applications_twin_idx ON public.job_applications (user_id, publisher_id, norm_title);

CREATE TABLE IF NOT EXISTS public.application_attempts (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result text CHECK (result IS NULL OR result IN ('sent', 'failed', 'handover')),
  -- Provider message id, the file's fingerprint, an error — never the CV itself.
  detail jsonb
);
CREATE INDEX IF NOT EXISTS application_attempts_app_idx ON public.application_attempts (application_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.application_documents (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cv', 'cover_letter')),
  name text NOT NULL,
  -- The text exactly as used.
  content text NOT NULL CHECK (length(content) <= 80000),
  -- cv: { lines: [{kind,text}], changes: [..], headline } — enough to make the same file again.
  meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(meta) < 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, kind)
);

CREATE TABLE IF NOT EXISTS public.application_answers (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id text NOT NULL CHECK (length(question_id) <= 200),
  label text NOT NULL CHECK (length(label) <= 600),
  value text NOT NULL CHECK (length(value) <= 6000),
  -- Where the answer came from: you | cv | account | madevisa
  source text NOT NULL CHECK (source IN ('you', 'cv', 'account', 'madevisa')),
  key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.application_credits (
  application_id uuid PRIMARY KEY REFERENCES public.job_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('held', 'used', 'released')),
  -- 'YYYY-MM' (UTC), like sponsorship documents.
  period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_credits_user_idx ON public.application_credits (user_id, period) WHERE state <> 'released';

CREATE TABLE IF NOT EXISTS public.application_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_id uuid,
  application_id uuid,
  name text NOT NULL,
  props jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_name_idx ON public.application_events (name, at DESC);
CREATE INDEX IF NOT EXISTS application_events_user_idx ON public.application_events (user_id, at DESC);

CREATE TABLE IF NOT EXISTS public.application_outcomes (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('applied', 'viewed', 'response', 'interview', 'assessment', 'final_round', 'offer', 'rejected', 'withdrawn')),
  at timestamptz NOT NULL DEFAULT now(),
  -- auto_apply | tracker (the existing application tracker) | you
  source text NOT NULL DEFAULT 'you' CHECK (source IN ('auto_apply', 'tracker', 'you')),
  UNIQUE (application_id, stage)
);
CREATE INDEX IF NOT EXISTS application_outcomes_user_idx ON public.application_outcomes (user_id, at DESC);

-- Everything above: the owner reads; only the functions below write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['application_queues', 'job_applications', 'application_attempts', 'application_documents', 'application_answers', 'application_credits', 'application_events', 'application_outcomes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))', t || '_read', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Small helpers
-- ---------------------------------------------------------------------------
/* The allowed moves — the same table as src/lib/apply/machine.ts. */
CREATE OR REPLACE FUNCTION public.apply_can_move(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_from
    WHEN 'queued' THEN p_to IN ('preparing', 'skipped', 'already_applied', 'expired')
    WHEN 'preparing' THEN p_to IN ('queued', 'needs_answer', 'submitting', 'review_required', 'failed', 'skipped', 'expired', 'already_applied')
    WHEN 'needs_answer' THEN p_to IN ('queued', 'skipped', 'expired')
    WHEN 'submitting' THEN p_to IN ('submitted', 'failed', 'review_required')
    WHEN 'review_required' THEN p_to IN ('submitted', 'queued', 'skipped', 'expired')
    WHEN 'failed' THEN p_to IN ('queued', 'skipped')
    WHEN 'skipped' THEN p_to IN ('queued')
    ELSE false
  END;
$$;

/* "Senior Data Analyst (m/f/d) – Berlin" and "Senior Data Analyst" are one role (src/lib/apply/decision.ts normTitle). */
CREATE OR REPLACE FUNCTION public.apply_norm_title(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p, '')), '\(.*?\)|\[.*?\]', ' ', 'g'),
        '\s[-–—|,@]\s.*$', ' '),
      '\m(m/w/d|m/f/d|f/m/d|w/m/d|all genders|remote|hybrid)\M', ' ', 'g'),
    '[^a-z0-9+#]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.apply_period()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM'); $$;

/* Applications a month for this person: what their plan comes with. */
CREATE OR REPLACE FUNCTION public.apply_limit(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT s.enabled THEN 0 WHEN public.is_pro(p_user) THEN s.pro_monthly ELSE s.free_monthly END
  FROM public.apply_settings s;
$$;
REVOKE ALL ON FUNCTION public.apply_limit(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_used(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.application_credits
  WHERE user_id = p_user AND period = public.apply_period() AND state <> 'released';
$$;
REVOKE ALL ON FUNCTION public.apply_used(uuid) FROM PUBLIC, anon, authenticated;

/* The most this person lets MadeVisa work on in a day (their own choice, never above the site's). */
CREATE OR REPLACE FUNCTION public.apply_daily_limit(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT least(
    s.daily_max,
    greatest(1, coalesce((SELECT CASE WHEN (p.prefs->>'maxPerDay') ~ '^\d{1,3}$' THEN (p.prefs->>'maxPerDay')::int END
                          FROM public.application_preferences p WHERE p.user_id = p_user), 20))
  )
  FROM public.apply_settings s;
$$;
REVOKE ALL ON FUNCTION public.apply_daily_limit(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_log(p_user uuid, p_name text, p_app uuid DEFAULT NULL, p_queue uuid DEFAULT NULL, p_props jsonb DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.application_events (user_id, name, application_id, queue_id, props) VALUES (p_user, p_name, p_app, p_queue, p_props);
$$;
REVOKE ALL ON FUNCTION public.apply_log(uuid, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_row(a public.job_applications)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'jobId', a.job_id, 'queueId', a.queue_id, 'title', a.title, 'company', a.company, 'cc', a.cc, 'country', a.country,
    'score', a.score, 'status', a.status, 'priority', a.priority, 'rank', a.rank, 'channel', a.channel, 'sponsorship', a.sponsorship,
    'url', a.url, 'reason', a.reason, 'reasonCode', a.reason_code, 'needs', a.needs, 'verified', a.verified, 'confirmation', a.confirmation,
    'cvName', a.cv_name, 'coverLetter', a.cover_letter, 'submittedAt', a.submitted_at, 'updatedAt', a.updated_at, 'createdAt', a.created_at
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. What the page asks before anything is queued
-- ---------------------------------------------------------------------------
/* Allowance, limits and the batch in progress — for the summary under the matches. */
CREATE OR REPLACE FUNCTION public.apply_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  s public.apply_settings;
  lim int;
  used int;
  q public.application_queues;
BEGIN
  SELECT * INTO s FROM public.apply_settings;
  IF me IS NULL THEN
    RETURN jsonb_build_object('signedIn', false, 'enabled', s.enabled, 'freeMonthly', s.free_monthly, 'proMonthly', s.pro_monthly);
  END IF;
  lim := public.apply_limit(me);
  used := public.apply_used(me);
  SELECT * INTO q FROM public.application_queues WHERE user_id = me ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'signedIn', true,
    'enabled', s.enabled,
    'pro', public.is_pro(me),
    'monthly', lim,
    'used', used,
    'left', greatest(0, lim - used),
    'freeMonthly', s.free_monthly,
    'proMonthly', s.pro_monthly,
    'dailyMax', s.daily_max,
    'daily', public.apply_daily_limit(me),
    'today', (SELECT count(*) FROM public.job_applications WHERE user_id = me AND day_started = (now() AT TIME ZONE 'utc')::date),
    'resetsAt', date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month',
    'queue', CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object('id', q.id, 'state', q.state, 'reason', q.pause_reason, 'cvAt', q.cv_at, 'createdAt', q.created_at) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_status() TO anon, authenticated;

/*
For a list of matched jobs: how each can be sent, and whether it must be
left out (already applied, same role at the same company, closed).
*/
CREATE OR REPLACE FUNCTION public.apply_preview(p_jobs uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF coalesce(array_length(p_jobs, 1), 0) > 80 THEN RAISE EXCEPTION 'Too many jobs at once.'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', j.id,
      'channel', CASE WHEN public.apply_channel_email(j.id) IS NOT NULL THEN 'madevisa' ELSE 'employer_site' END,
      'url', coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')),
      'closed', j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at <= now()),
      'applied',
        EXISTS (SELECT 1 FROM public.job_applications a WHERE a.user_id = me AND a.job_id = j.id AND a.status NOT IN ('skipped', 'failed'))
        OR EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id = j.id AND r.status NOT IN ('clicked', 'withdrawn')),
      'twin',
        EXISTS (SELECT 1 FROM public.job_applications a
                WHERE a.user_id = me AND a.job_id <> j.id AND a.publisher_id = j.publisher_id
                  AND a.norm_title = public.apply_norm_title(j.title) AND a.status IN ('submitted', 'submitting', 'review_required', 'queued', 'preparing', 'needs_answer'))
        OR EXISTS (SELECT 1 FROM public.application_reports r
                   WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id <> j.id AND r.publisher_id = j.publisher_id
                     AND r.status NOT IN ('clicked', 'withdrawn') AND public.apply_norm_title(r.listing_title) = public.apply_norm_title(j.title)),
      'knownSponsor', c.iso_code = 'GB' AND public.uk_sponsor_for_publisher(j.publisher_id) IS NOT NULL
    ))
    FROM public.sponsored_jobs j
    LEFT JOIN public.countries c ON c.id = j.country_id
    WHERE j.id = ANY (p_jobs)
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_preview(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_preview(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Queue a batch
-- ---------------------------------------------------------------------------
/*
p_items: [{ jobId, score, quality, decision, priority, rank, sponsorship }]
The job's own facts (title, company, link, channel) are read here, never
taken from the page. A job that must not be applied to is still recorded —
as already_applied / expired — so the person can see why it was left out.
*/
CREATE OR REPLACE FUNCTION public.apply_enqueue(p_items jsonb, p_cv_at text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  s public.apply_settings;
  q public.application_queues;
  it jsonb;
  j record;
  a public.job_applications;
  st text;
  why text;
  code text;
  nt text;
  added int := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in to apply.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.apply_settings;
  IF NOT s.enabled THEN RAISE EXCEPTION 'Auto Apply is switched off for now.'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Nothing to apply to.'; END IF;
  IF jsonb_array_length(p_items) > 60 THEN RAISE EXCEPTION 'At most 60 jobs in one batch.'; END IF;
  IF (SELECT count(*) FROM public.job_applications WHERE user_id = me AND status = 'queued') >= 200 THEN
    RAISE EXCEPTION 'You already have 200 applications waiting. Let some of them finish first.';
  END IF;

  -- One batch at a time: an unfinished one is carried on with, not doubled.
  SELECT * INTO q FROM public.application_queues WHERE user_id = me AND state IN ('running', 'paused') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF q.id IS NULL THEN
    INSERT INTO public.application_queues (user_id, cv_at) VALUES (me, left(p_cv_at, 40)) RETURNING * INTO q;
  ELSE
    UPDATE public.application_queues SET state = 'running', pause_reason = NULL, updated_at = now() WHERE id = q.id RETURNING * INTO q;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT sj.id, sj.title, sj.publisher_id, sj.status, sj.expires_at, sj.application_url, sj.official_url,
           p.name AS company, c.name AS country, c.iso_code AS cc
      INTO j
      FROM public.sponsored_jobs sj
      LEFT JOIN public.program_publishers p ON p.id = sj.publisher_id
      LEFT JOIN public.countries c ON c.id = sj.country_id
     WHERE sj.id = (it->>'jobId')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Already in a batch: left as it is (a skipped or failed one can be queued again from the page).
    IF EXISTS (SELECT 1 FROM public.job_applications x WHERE x.user_id = me AND x.job_id = j.id) THEN
      PERFORM public.apply_log(me, 'application_duplicate', NULL, q.id, jsonb_build_object('job', j.id, 'why', 'queued_before'));
      CONTINUE;
    END IF;

    nt := public.apply_norm_title(j.title);
    st := 'queued'; why := NULL; code := NULL;
    IF j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at <= now()) THEN
      st := 'expired'; why := 'The job is no longer open.'; code := 'closed';
    ELSIF EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id = j.id AND r.status NOT IN ('clicked', 'withdrawn')) THEN
      st := 'already_applied'; why := 'This job is already in your applications.'; code := 'already_applied';
    ELSIF EXISTS (SELECT 1 FROM public.job_applications x
                  WHERE x.user_id = me AND x.publisher_id = j.publisher_id AND x.norm_title = nt
                    AND x.status IN ('submitted', 'submitting', 'review_required', 'queued', 'preparing', 'needs_answer'))
       OR EXISTS (SELECT 1 FROM public.application_reports r
                  WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id <> j.id AND r.publisher_id = j.publisher_id
                    AND r.status NOT IN ('clicked', 'withdrawn') AND public.apply_norm_title(r.listing_title) = nt) THEN
      st := 'already_applied'; why := 'This role at ' || coalesce(j.company, 'this company') || ' is already in your applications.'; code := 'same_role';
    END IF;

    INSERT INTO public.job_applications (
      user_id, queue_id, job_id, publisher_id, title, company, norm_title, cc, country, score, quality, decision, priority, rank, sponsorship, channel, url, status, reason, reason_code
    ) VALUES (
      me, q.id, j.id, j.publisher_id, left(j.title, 300), left(coalesce(j.company, 'Company'), 200), nt, j.cc, j.country,
      least(100, greatest(0, coalesce((it->>'score')::int, 0))),
      CASE WHEN jsonb_typeof(it->'quality') = 'object' THEN it->'quality' END,
      CASE WHEN it->>'decision' IN ('auto', 'review', 'skip') THEN it->>'decision' ELSE 'auto' END,
      CASE WHEN it->>'priority' IN ('strong', 'good', 'backup') THEN it->>'priority' ELSE 'good' END,
      least(200, greatest(-50, coalesce((it->>'rank')::int, 0))),
      CASE WHEN it->>'sponsorship' IN ('not_needed', 'likely', 'unclear', 'not_indicated', 'not_compatible') THEN it->>'sponsorship' ELSE 'unclear' END,
      CASE WHEN public.apply_channel_email(j.id) IS NOT NULL THEN 'madevisa' ELSE 'employer_site' END,
      coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')),
      st, why, code
    ) RETURNING * INTO a;
    added := added + 1;
    PERFORM public.apply_log(me, CASE st WHEN 'queued' THEN 'application_queued' WHEN 'already_applied' THEN 'application_duplicate' ELSE 'application_skipped' END, a.id, q.id,
                             jsonb_build_object('score', a.score, 'priority', a.priority, 'channel', a.channel, 'why', code));
  END LOOP;

  PERFORM public.apply_log(me, 'auto_apply_started', NULL, q.id, jsonb_build_object('asked', jsonb_array_length(p_items), 'added', added));
  RETURN jsonb_build_object(
    'queue', jsonb_build_object('id', q.id, 'state', q.state, 'reason', q.pause_reason, 'cvAt', q.cv_at, 'createdAt', q.created_at),
    'applications', coalesce((SELECT jsonb_agg(public.apply_row(x) ORDER BY x.rank DESC, x.score DESC) FROM public.job_applications x WHERE x.queue_id = q.id), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_enqueue(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_enqueue(jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Moving an application
-- ---------------------------------------------------------------------------
/*
The one place an application changes state. Called by the person's page
(p_service = false) and by the sending function (p_service = true).
Returns { ok, code?, message?, app }.
  code: invalid | daily_limit | allowance | duplicate | expired | error
*/
CREATE OR REPLACE FUNCTION public.apply_transition(p_id uuid, p_user uuid, p_to text, p_detail jsonb, p_service boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  j record;
  d jsonb := coalesce(p_detail, '{}'::jsonb);
  today date := (now() AT TIME ZONE 'utc')::date;
  period text := public.apply_period();
  c public.application_credits;
  conf jsonb;
  is_verified boolean := false;
  refund boolean := false;
  as_owner boolean := false;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = p_id AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'error', 'message', 'No such application.'); END IF;

  -- Already there: nothing to do (lets the page repeat a call safely).
  IF a.status = p_to THEN RETURN jsonb_build_object('ok', true, 'app', public.apply_row(a)); END IF;
  IF NOT public.apply_can_move(a.status, p_to) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'An application that is ' || a.status || ' can’t become ' || p_to || '.', 'app', public.apply_row(a));
  END IF;

  -- What only the sending function may do.
  IF NOT p_service THEN
    IF a.status = 'submitting' AND p_to = 'submitted' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Only a delivery confirmation can mark this application as submitted.', 'app', public.apply_row(a));
    END IF;
    IF p_to = 'submitting' AND a.channel <> 'madevisa' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'This employer takes applications on its own site.', 'app', public.apply_row(a));
    END IF;
  END IF;

  IF p_to = 'preparing' THEN
    SELECT sj.status, sj.expires_at INTO j FROM public.sponsored_jobs sj WHERE sj.id = a.job_id;
    IF NOT FOUND OR j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at <= now()) THEN
      UPDATE public.job_applications SET status = 'expired', reason = 'The job is no longer open.', reason_code = 'closed', updated_at = now() WHERE id = a.id RETURNING * INTO a;
      PERFORM public.apply_log(p_user, 'application_skipped', a.id, a.queue_id, jsonb_build_object('why', 'closed'));
      RETURN jsonb_build_object('ok', false, 'code', 'expired', 'message', a.reason, 'app', public.apply_row(a));
    END IF;
    -- Applied some other way since it was queued.
    IF EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = p_user AND r.listing_kind = 'job' AND r.listing_id = a.job_id AND r.status NOT IN ('clicked', 'withdrawn')) THEN
      UPDATE public.job_applications SET status = 'already_applied', reason = 'This job is already in your applications.', reason_code = 'already_applied', updated_at = now() WHERE id = a.id RETURNING * INTO a;
      PERFORM public.apply_log(p_user, 'application_duplicate', a.id, a.queue_id, NULL);
      RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'message', a.reason, 'app', public.apply_row(a));
    END IF;
    IF a.day_started IS DISTINCT FROM today THEN
      IF (SELECT count(*) FROM public.job_applications x WHERE x.user_id = p_user AND x.day_started = today) >= public.apply_daily_limit(p_user) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'daily_limit', 'message', 'Today’s limit is reached. The rest carry on tomorrow.', 'app', public.apply_row(a));
      END IF;
      a.day_started := today;
    END IF;
    PERFORM public.apply_log(p_user, 'application_started', a.id, a.queue_id, NULL);
  END IF;

  SELECT * INTO c FROM public.application_credits WHERE application_id = a.id FOR UPDATE;

  -- Before sending: set one aside. Refused when the month is used up.
  IF p_to = 'submitting' THEN
    IF c.application_id IS NULL OR c.state = 'released' THEN
      PERFORM pg_advisory_xact_lock(hashtext('apply:' || p_user::text));
      IF public.apply_used(p_user) >= public.apply_limit(p_user) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'allowance', 'message', 'You’ve used this month’s applications.', 'app', public.apply_row(a));
      END IF;
      INSERT INTO public.application_credits (application_id, user_id, state, period) VALUES (a.id, p_user, 'held', period)
      ON CONFLICT (application_id) DO UPDATE SET state = 'held', period = excluded.period, updated_at = now();
    END IF;
    INSERT INTO public.application_attempts (application_id, user_id, channel) VALUES (a.id, p_user, a.channel);
  END IF;

  IF p_to IN ('submitted', 'review_required') THEN
    -- Counted now, once: MadeVisa's part is done — sent, or prepared and handed over ready to send.
    -- (When the person later says they sent a ready one, it is already counted.)
    IF c.application_id IS NULL OR c.state = 'released' THEN
      PERFORM pg_advisory_xact_lock(hashtext('apply:' || p_user::text));
      IF public.apply_used(p_user) >= public.apply_limit(p_user) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'allowance', 'message', 'You’ve used this month’s applications.', 'app', public.apply_row(a));
      END IF;
      INSERT INTO public.application_credits (application_id, user_id, state, period) VALUES (a.id, p_user, 'used', period)
      ON CONFLICT (application_id) DO UPDATE SET state = 'used', period = excluded.period, updated_at = now();
      PERFORM public.apply_log(p_user, 'application_credit_used', a.id, a.queue_id, NULL);
    ELSIF c.state = 'held' THEN
      UPDATE public.application_credits SET state = 'used', updated_at = now() WHERE application_id = a.id;
      PERFORM public.apply_log(p_user, 'application_credit_used', a.id, a.queue_id, NULL);
    END IF;
  END IF;

  IF p_to = 'submitted' THEN
    -- A confirmation from the channel makes it verified. The person's own word never does.
    IF p_service AND coalesce(d->'confirmation'->>'id', '') <> '' AND coalesce(d->'confirmation'->>'kind', 'self') <> 'self' THEN
      conf := jsonb_build_object('kind', d->'confirmation'->>'kind', 'id', left(d->'confirmation'->>'id', 200), 'at', now());
      is_verified := true;
    ELSE
      conf := jsonb_build_object('kind', 'self', 'at', now());
    END IF;
  ELSIF p_to NOT IN ('submitting', 'review_required') AND c.state = 'held' THEN
    -- Not sent after all (a failed send): give it back.
    UPDATE public.application_credits SET state = 'released', updated_at = now() WHERE application_id = a.id;
    refund := true;
  END IF;

  UPDATE public.job_applications SET
    status = p_to,
    day_started = a.day_started,
    reason = CASE WHEN p_to IN ('queued', 'preparing', 'submitting', 'submitted') THEN NULL ELSE left(coalesce(d->>'reason', reason), 600) END,
    reason_code = CASE WHEN p_to IN ('queued', 'preparing', 'submitting', 'submitted') THEN NULL ELSE left(coalesce(d->>'code', reason_code), 60) END,
    needs = CASE WHEN p_to = 'needs_answer' AND jsonb_typeof(d->'needs') = 'array' AND pg_column_size(d->'needs') < 40000 THEN d->'needs' ELSE '[]'::jsonb END,
    cv_name = coalesce(left(d->>'cvName', 200), cv_name),
    cover_letter = coalesce((d->>'coverLetter')::boolean, cover_letter),
    verified = is_verified,
    confirmation = CASE WHEN p_to = 'submitted' THEN conf ELSE NULL END,
    submitted_at = CASE WHEN p_to = 'submitted' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = a.id RETURNING * INTO a;

  IF refund THEN PERFORM public.apply_log(p_user, 'application_credit_refunded', a.id, a.queue_id, jsonb_build_object('to', p_to)); END IF;

  IF p_to = 'submitted' THEN
    PERFORM public.apply_log(p_user, 'application_submitted', a.id, a.queue_id, jsonb_build_object('channel', a.channel, 'verified', a.verified, 'score', a.score));
    INSERT INTO public.application_outcomes (application_id, user_id, stage, source) VALUES (a.id, p_user, 'applied', 'auto_apply') ON CONFLICT DO NOTHING;
    -- Into the existing application tracker, as a confirmed application. Never allowed to undo the submission.
    BEGIN
      IF a.publisher_id IS NOT NULL THEN
        -- The tracker's own rules read "who is signed in". When the sending function finishes an
        -- application nobody is, so for these two statements only it is the application's owner.
        IF auth.uid() IS NULL THEN
          PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
          as_owner := true;
        END IF;
        INSERT INTO public.application_reports (publisher_id, listing_kind, listing_id, listing_title)
        VALUES (a.publisher_id, 'job', a.job_id, a.title)
        ON CONFLICT (user_id, listing_kind, listing_id) DO NOTHING;
        UPDATE public.application_reports SET status = 'applied'
         WHERE user_id = p_user AND listing_kind = 'job' AND listing_id = a.job_id AND status = 'clicked';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'apply: tracker row not written: %', SQLERRM;
    END;
    IF as_owner THEN PERFORM set_config('request.jwt.claim.sub', '', true); END IF;
  ELSIF p_to = 'failed' THEN
    PERFORM public.apply_log(p_user, 'application_failed', a.id, a.queue_id, jsonb_build_object('code', a.reason_code));
  ELSIF p_to IN ('needs_answer', 'review_required') THEN
    PERFORM public.apply_log(p_user, 'application_requires_review', a.id, a.queue_id, jsonb_build_object('code', a.reason_code, 'status', p_to));
  ELSIF p_to IN ('skipped', 'expired') THEN
    PERFORM public.apply_log(p_user, 'application_skipped', a.id, a.queue_id, jsonb_build_object('code', a.reason_code));
  END IF;

  IF p_to IN ('submitted', 'failed', 'review_required') THEN
    UPDATE public.application_attempts SET finished_at = now(),
      result = CASE p_to WHEN 'submitted' THEN 'sent' WHEN 'failed' THEN 'failed' ELSE 'handover' END,
      detail = coalesce(detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('code', d->>'code', 'reason', left(d->>'reason', 300), 'confirmation', conf, 'sha256', d->>'sha256'))
    WHERE id = (SELECT id FROM public.application_attempts WHERE application_id = a.id AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1);
  END IF;

  -- Nothing left to work on: the batch is done.
  IF a.queue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.job_applications x WHERE x.queue_id = a.queue_id AND x.status IN ('queued', 'preparing', 'submitting')) THEN
    UPDATE public.application_queues SET state = 'done', pause_reason = NULL, finished_at = now(), updated_at = now() WHERE id = a.queue_id AND state = 'running';
    IF FOUND THEN PERFORM public.apply_log(p_user, 'auto_apply_completed', NULL, a.queue_id, NULL); END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'app', public.apply_row(a));
END;
$$;
REVOKE ALL ON FUNCTION public.apply_transition(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

/* The page's way in: the signed-in person, their own application. */
CREATE OR REPLACE FUNCTION public.apply_move(p_id uuid, p_to text, p_detail jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  RETURN public.apply_transition(p_id, me, p_to, p_detail, false);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_move(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_move(uuid, text, jsonb) TO authenticated;

/* The sending function's way in (service role only). */
CREATE OR REPLACE FUNCTION public.apply_finish(p_id uuid, p_user uuid, p_to text, p_detail jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.apply_transition(p_id, p_user, p_to, p_detail, true); $$;
REVOKE ALL ON FUNCTION public.apply_finish(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_finish(uuid, uuid, text, jsonb) TO service_role;

/*
What the sending function needs to send one application (service role only):
the address the employer gave, the mail key, and whether it was sent before.
*/
CREATE OR REPLACE FUNCTION public.apply_send_context(p_id uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  j record;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = p_id AND user_id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'not_found'); END IF;
  SELECT sj.status, sj.expires_at, sj.title INTO j FROM public.sponsored_jobs sj WHERE sj.id = a.job_id;
  RETURN jsonb_build_object(
    'ok', true,
    'status', a.status,
    'channel', a.channel,
    'title', a.title,
    'company', a.company,
    'open', FOUND AND j.status = 'published' AND (j.expires_at IS NULL OR j.expires_at > now()),
    'to', public.apply_channel_email(a.job_id),
    'candidateEmail', (SELECT u.email FROM auth.users u WHERE u.id = p_user),
    'sentBefore', (SELECT t.detail->'confirmation' FROM public.application_attempts t WHERE t.application_id = a.id AND t.result = 'sent' ORDER BY t.started_at DESC LIMIT 1),
    'resendKey', (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'),
    'from', (SELECT value FROM public.app_secrets WHERE name = 'email_from')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_send_context(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_send_context(uuid, uuid) TO service_role;

/* A job's application link, for reading its public question list (service role only). */
CREATE OR REPLACE FUNCTION public.apply_job_link(p_job uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(application_url, ''), nullif(official_url, '')) FROM public.sponsored_jobs WHERE id = p_job AND status = 'published';
$$;
REVOKE ALL ON FUNCTION public.apply_job_link(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_job_link(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Pause / resume / stop
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_queue_set(p_queue uuid, p_state text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  q public.application_queues;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('running', 'paused', 'stopped', 'done') THEN RAISE EXCEPTION 'Unknown state.'; END IF;
  SELECT * INTO q FROM public.application_queues WHERE id = p_queue AND user_id = me FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such batch.'; END IF;
  -- One that was being prepared when the page closed (or was paused) goes back in the queue.
  -- One being sent is left alone: only a confirmation, or a recorded failure, moves it on.
  IF p_state IN ('paused', 'stopped', 'running') THEN
    UPDATE public.job_applications SET status = 'queued', updated_at = now() WHERE queue_id = q.id AND status = 'preparing';
  END IF;
  IF q.state = p_state AND q.pause_reason IS NOT DISTINCT FROM (CASE WHEN p_state = 'paused' THEN coalesce(p_reason, 'you') END) THEN
    RETURN jsonb_build_object('id', q.id, 'state', q.state, 'reason', q.pause_reason, 'cvAt', q.cv_at, 'createdAt', q.created_at);
  END IF;
  UPDATE public.application_queues SET
    state = p_state,
    pause_reason = CASE WHEN p_state = 'paused' THEN CASE WHEN p_reason IN ('you', 'daily_limit', 'allowance', 'offline') THEN p_reason ELSE 'you' END END,
    finished_at = CASE WHEN p_state IN ('stopped', 'done') THEN now() END,
    updated_at = now()
  WHERE id = q.id RETURNING * INTO q;
  PERFORM public.apply_log(me, CASE p_state WHEN 'paused' THEN 'auto_apply_paused' WHEN 'running' THEN 'auto_apply_resumed' WHEN 'stopped' THEN 'auto_apply_stopped' ELSE 'auto_apply_completed' END,
                           NULL, q.id, CASE WHEN p_state = 'paused' THEN jsonb_build_object('reason', q.pause_reason) END);
  RETURN jsonb_build_object('id', q.id, 'state', q.state, 'reason', q.pause_reason, 'cvAt', q.cv_at, 'createdAt', q.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_queue_set(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_queue_set(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. What was used: the CV, the letter, the answers
-- ---------------------------------------------------------------------------
/*
p_cv: { name, content, meta } · p_letter: { name, content } or null · p_answers: [{ id, label, value, source, key }]
Kept while the application is being prepared; frozen once it is submitted,
so the receipt always shows exactly what went out.
*/
CREATE OR REPLACE FUNCTION public.apply_save(p_id uuid, p_cv jsonb, p_letter jsonb DEFAULT NULL, p_answers jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a public.job_applications;
  x jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.job_applications WHERE id = p_id AND user_id = me FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such application.'; END IF;
  IF a.status IN ('submitted', 'submitting') THEN RAISE EXCEPTION 'This application has been sent; what was sent can’t be changed.'; END IF;

  IF jsonb_typeof(p_cv) = 'object' AND coalesce(p_cv->>'content', '') <> '' THEN
    INSERT INTO public.application_documents (application_id, user_id, kind, name, content, meta)
    VALUES (a.id, me, 'cv', left(coalesce(p_cv->>'name', 'CV'), 200), left(p_cv->>'content', 80000), coalesce(p_cv->'meta', '{}'::jsonb))
    ON CONFLICT (application_id, kind) DO UPDATE SET name = excluded.name, content = excluded.content, meta = excluded.meta, created_at = now();
  END IF;

  IF jsonb_typeof(p_letter) = 'object' AND coalesce(p_letter->>'content', '') <> '' THEN
    INSERT INTO public.application_documents (application_id, user_id, kind, name, content)
    VALUES (a.id, me, 'cover_letter', left(coalesce(p_letter->>'name', 'Cover letter'), 200), left(p_letter->>'content', 20000))
    ON CONFLICT (application_id, kind) DO UPDATE SET name = excluded.name, content = excluded.content, created_at = now();
  ELSE
    DELETE FROM public.application_documents WHERE application_id = a.id AND kind = 'cover_letter';
  END IF;

  IF jsonb_typeof(p_answers) = 'array' THEN
    IF jsonb_array_length(p_answers) > 120 THEN RAISE EXCEPTION 'Too many answers.'; END IF;
    DELETE FROM public.application_answers WHERE application_id = a.id;
    FOR x IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
      CONTINUE WHEN coalesce(x->>'id', '') = '' OR coalesce(x->>'value', '') = '';
      INSERT INTO public.application_answers (application_id, user_id, question_id, label, value, source, key)
      VALUES (a.id, me, left(x->>'id', 200), left(coalesce(x->>'label', x->>'id'), 600), left(x->>'value', 6000),
              CASE WHEN x->>'source' IN ('you', 'cv', 'account', 'madevisa') THEN x->>'source' ELSE 'you' END, nullif(left(x->>'key', 40), ''))
      ON CONFLICT (application_id, question_id) DO UPDATE SET label = excluded.label, value = excluded.value, source = excluded.source, key = excluded.key;
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_save(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_save(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Product events from the page
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_event(p_name text, p_props jsonb DEFAULT NULL, p_queue uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  -- Only what the page itself can know; everything about an application is logged where it happens.
  IF p_name NOT IN ('cv_uploaded', 'matches_loaded', 'auto_apply_opened', 'auto_apply_preferences_saved', 'auto_apply_review_opened') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.application_events WHERE user_id = me AND at > now() - interval '1 hour') > 400 THEN RETURN; END IF;
  INSERT INTO public.application_events (user_id, name, queue_id, props)
  VALUES (me, p_name, p_queue, CASE WHEN p_props IS NOT NULL AND pg_column_size(p_props) < 2000 THEN p_props END);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_event(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_event(text, jsonb, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. What came of it (the funnel)
-- ---------------------------------------------------------------------------
/* The person records a stage on one of their applications. */
CREATE OR REPLACE FUNCTION public.apply_outcome(p_id uuid, p_stage text, p_on boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a public.job_applications;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF p_stage NOT IN ('viewed', 'response', 'interview', 'assessment', 'final_round', 'offer', 'rejected', 'withdrawn') THEN RAISE EXCEPTION 'Unknown stage.'; END IF;
  SELECT * INTO a FROM public.job_applications WHERE id = p_id AND user_id = me;
  IF NOT FOUND OR a.status <> 'submitted' THEN RAISE EXCEPTION 'Only a submitted application has an outcome.'; END IF;
  IF p_on THEN
    INSERT INTO public.application_outcomes (application_id, user_id, stage, source) VALUES (a.id, me, p_stage, 'you') ON CONFLICT (application_id, stage) DO NOTHING;
  ELSE
    DELETE FROM public.application_outcomes WHERE application_id = a.id AND stage = p_stage AND source = 'you';
  END IF;
  PERFORM public.apply_log(me, 'application_outcome_updated', a.id, a.queue_id, jsonb_build_object('stage', p_stage, 'on', p_on));
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('stage', o.stage, 'at', o.at, 'source', o.source) ORDER BY o.at) FROM public.application_outcomes o WHERE o.application_id = a.id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_outcome(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_outcome(uuid, text, boolean) TO authenticated;

/* An outcome recorded in the existing tracker counts here too. */
CREATE OR REPLACE FUNCTION public.apply_outcome_from_tracker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app uuid;
  st text;
BEGIN
  IF NEW.listing_kind <> 'job' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  st := CASE NEW.status WHEN 'viewed' THEN 'viewed' WHEN 'responded' THEN 'response' WHEN 'interview' THEN 'interview' WHEN 'offer' THEN 'offer' WHEN 'rejected' THEN 'rejected' WHEN 'withdrawn' THEN 'withdrawn' END;
  IF st IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO app FROM public.job_applications WHERE user_id = NEW.user_id AND job_id = NEW.listing_id AND status = 'submitted';
  IF app IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.application_outcomes (application_id, user_id, stage, source) VALUES (app, NEW.user_id, st, 'tracker') ON CONFLICT (application_id, stage) DO NOTHING;
  -- An interview or an offer is also a response.
  IF st IN ('interview', 'offer', 'rejected') THEN
    INSERT INTO public.application_outcomes (application_id, user_id, stage, source) VALUES (app, NEW.user_id, 'response', 'tracker') ON CONFLICT (application_id, stage) DO NOTHING;
  END IF;
  PERFORM public.apply_log(NEW.user_id, 'application_outcome_updated', app, NULL, jsonb_build_object('stage', st, 'source', 'tracker'));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS application_reports_apply_outcome ON public.application_reports;
CREATE TRIGGER application_reports_apply_outcome
  AFTER UPDATE OF status ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.apply_outcome_from_tracker();

-- ---------------------------------------------------------------------------
-- 12. For admins: the funnel, and what the outcomes say once there are enough
-- ---------------------------------------------------------------------------
/* People and events at each step, over the last p_days days. */
CREATE OR REPLACE FUNCTION public.apply_funnel(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'days', p_days,
    'steps', coalesce((
      SELECT jsonb_object_agg(name, jsonb_build_object('events', n, 'people', people))
      FROM (SELECT name, count(*) AS n, count(DISTINCT user_id) AS people FROM public.application_events
            WHERE at > now() - make_interval(days => greatest(1, least(365, p_days))) GROUP BY name) e
    ), '{}'::jsonb),
    'outcomes', coalesce((
      SELECT jsonb_object_agg(stage, n) FROM (SELECT stage, count(*) AS n FROM public.application_outcomes
            WHERE at > now() - make_interval(days => greatest(1, least(365, p_days))) GROUP BY stage) o
    ), '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_funnel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_funnel(integer) TO authenticated;

/* One row per submitted application old enough to have an outcome: what it was, and what came of it. */
CREATE OR REPLACE VIEW public.application_learning_facts
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.user_id,
  a.cc,
  a.channel,
  a.priority,
  a.sponsorship,
  a.cover_letter,
  CASE WHEN a.score >= 85 THEN '85+' WHEN a.score >= 75 THEN '75-84' WHEN a.score >= 65 THEN '65-74' ELSE 'under 65' END AS match_range,
  coalesce((SELECT (d.meta->'changes') <> '[]'::jsonb FROM public.application_documents d WHERE d.application_id = a.id AND d.kind = 'cv'), false) AS cv_tailored,
  a.publisher_id,
  a.submitted_at,
  EXISTS (SELECT 1 FROM public.application_outcomes o WHERE o.application_id = a.id AND o.stage IN ('response', 'interview', 'assessment', 'final_round', 'offer', 'rejected')) AS responded,
  EXISTS (SELECT 1 FROM public.application_outcomes o WHERE o.application_id = a.id AND o.stage IN ('interview', 'final_round', 'offer')) AS interviewed,
  EXISTS (SELECT 1 FROM public.application_outcomes o WHERE o.application_id = a.id AND o.stage = 'offer') AS offered
FROM public.job_applications a
WHERE a.status = 'submitted' AND a.submitted_at < now() - interval '14 days';
REVOKE ALL ON public.application_learning_facts FROM anon, authenticated;

/*
Response and interview rates by match range, country, priority, sponsorship,
tailored CV and cover letter — but only once at least p_min applications are
old enough to judge. Until then: { enough: false }. A group with fewer than
10 applications is left out, so no rate rests on a handful.
*/
CREATE OR REPLACE FUNCTION public.apply_learning(p_min integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int;
  res jsonb := '{}'::jsonb;
  dim text;
  part jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO total FROM public.application_learning_facts;
  IF total < greatest(10, p_min) THEN
    RETURN jsonb_build_object('enough', false, 'applications', total, 'needed', greatest(10, p_min));
  END IF;
  FOREACH dim IN ARRAY ARRAY['match_range', 'cc', 'priority', 'sponsorship', 'cv_tailored', 'cover_letter', 'channel'] LOOP
    EXECUTE format($f$
      SELECT coalesce(jsonb_agg(jsonb_build_object('value', v, 'applications', n, 'response_rate', round(100.0 * r / n), 'interview_rate', round(100.0 * i / n)) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT %1$I::text AS v, count(*) AS n, count(*) FILTER (WHERE responded) AS r, count(*) FILTER (WHERE interviewed) AS i
            FROM public.application_learning_facts GROUP BY 1 HAVING count(*) >= 10) g
    $f$, dim) INTO part;
    res := res || jsonb_build_object(dim, part);
  END LOOP;
  RETURN jsonb_build_object('enough', true, 'applications', total, 'by', res);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_learning(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_learning(integer) TO authenticated;

/* Admin: change how many applications come with each plan, the daily ceiling, or switch Auto Apply off. */
CREATE OR REPLACE FUNCTION public.apply_configure(p_enabled boolean DEFAULT NULL, p_free_monthly integer DEFAULT NULL, p_pro_monthly integer DEFAULT NULL, p_daily_max integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.apply_settings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  UPDATE public.apply_settings SET
    enabled = coalesce(p_enabled, enabled),
    free_monthly = coalesce(p_free_monthly, free_monthly),
    pro_monthly = coalesce(p_pro_monthly, pro_monthly),
    daily_max = coalesce(p_daily_max, daily_max),
    updated_at = now()
  RETURNING * INTO s;
  RETURN to_jsonb(s);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_configure(boolean, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_configure(boolean, integer, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
