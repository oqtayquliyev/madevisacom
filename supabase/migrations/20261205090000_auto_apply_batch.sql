/*
# Auto Apply, batch edition: MadeVisa applies on the employer's own site
Run AFTER 20261204090000_auto_apply.sql. Safe to run more than once.
One paste, one tab, one click.

## What changes
Before: MadeVisa prepared each application in the person's browser, one
at a time, and handed most of them over ("open the employer's page, attach
this CV"). Questions were asked per job, mid-batch.

Now:
  1. "Apply to 16 jobs" creates ONE batch. The page reads all 16 forms,
     works out what it already knows, and asks the person the few things it
     doesn't — once, in one form (application_queues.plan).
  2. Every application is prepared (tailored CV, letter, exact answers) and
     becomes `ready`.
  3. The application worker — a small server with a real browser, see
     worker/README.md — claims ready applications, opens the employer's
     careers page, fills it in, uploads the CV, submits, and reports back
     with evidence. It runs whether or not the person keeps the page open.
  4. One that can't be completed (a sign-in, a CAPTCHA, a question nobody
     can answer for the person) becomes `needs_attention` / `blocked`. The
     rest of the batch carries on.

## States (job_applications.status)
  queued → analyzing → preparing → ready → submitting → submitted
  plus needs_attention · blocked · failed · skipped · already_applied · expired
  (needs_answer and review_required are folded into needs_attention.)

## Who may do what
  The page:   prepare its own applications up to `ready`; skip; retry;
              say "I submitted it myself" (submitted, never verified).
  The worker: (service role) claim `ready` → `submitting`; report
              submitted (verified, with evidence) / failed / needs_attention /
              blocked / back to ready.
  "Submitted" + verified is only ever set by the worker or the email channel,
  with a confirmation.

## Credits (configurable in apply_settings)
  A submitted application uses one. One is held while submitting; a failure
  before submission gives it back; skipped, duplicate, blocked, needs
  attention — nothing, until it is actually submitted.
  charge_self_sent: whether "I submitted it myself" uses one (default: no).
  application_credit_grants: extra applications for a person for a month
  (bought, given, or a goodwill top-up), on top of their plan.

## Background processing
  apply_workers holds each worker's heartbeat. apply_status() says
  worker.online only when one has checked in within the last 3 minutes —
  the page tells people they can leave only then.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Settings and credits
-- ---------------------------------------------------------------------------
ALTER TABLE public.apply_settings
  ADD COLUMN IF NOT EXISTS charge_self_sent boolean NOT NULL DEFAULT false,
  -- false = the worker fills every form but never presses Submit (for trying it out safely).
  ADD COLUMN IF NOT EXISTS auto_submit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS worker_concurrency integer NOT NULL DEFAULT 2;
DO $$ BEGIN
  ALTER TABLE public.apply_settings ADD CONSTRAINT apply_settings_worker_concurrency_check CHECK (worker_concurrency BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.application_credit_grants (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Extra applications for this month ('YYYY-MM', UTC).
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  reason text CHECK (length(reason) <= 300),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_credit_grants_user_idx ON public.application_credit_grants (user_id, period);
ALTER TABLE public.application_credit_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "application_credit_grants_read" ON public.application_credit_grants;
CREATE POLICY "application_credit_grants_read" ON public.application_credit_grants FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
REVOKE ALL ON public.application_credit_grants FROM anon, authenticated;
GRANT SELECT ON public.application_credit_grants TO authenticated;

/* Applications this month for this person: their plan, plus anything granted for this month. */
CREATE OR REPLACE FUNCTION public.apply_limit(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT s.enabled THEN 0
    ELSE (CASE WHEN public.is_pro(p_user) THEN s.pro_monthly ELSE s.free_monthly END)
         + coalesce((SELECT sum(g.amount)::int FROM public.application_credit_grants g WHERE g.user_id = p_user AND g.period = public.apply_period()), 0)
  END
  FROM public.apply_settings s;
$$;
REVOKE ALL ON FUNCTION public.apply_limit(uuid) FROM PUBLIC, anon, authenticated;

/* Admin: give a person extra applications this month (or another month). */
CREATE OR REPLACE FUNCTION public.apply_grant(p_user uuid, p_amount integer, p_reason text DEFAULT NULL, p_period text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.application_credit_grants (user_id, period, amount, reason, created_by)
  VALUES (p_user, coalesce(p_period, public.apply_period()), p_amount, left(p_reason, 300), auth.uid());
  RETURN jsonb_build_object('ok', true, 'limit', public.apply_limit(p_user), 'used', public.apply_used(p_user));
END;
$$;
REVOKE ALL ON FUNCTION public.apply_grant(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_grant(uuid, integer, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Profile: answers that depend on the job's country
-- ---------------------------------------------------------------------------
ALTER TABLE public.application_profiles
  ADD COLUMN IF NOT EXISTS by_country jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  ALTER TABLE public.application_profiles ADD CONSTRAINT application_profiles_by_country_check CHECK (jsonb_typeof(by_country) = 'object' AND pg_column_size(by_country) < 60000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Batches
-- ---------------------------------------------------------------------------
ALTER TABLE public.application_queues DROP CONSTRAINT IF EXISTS application_queues_state_check;
ALTER TABLE public.application_queues ADD CONSTRAINT application_queues_state_check
  CHECK (state IN ('analyzing', 'awaiting_answers', 'running', 'paused', 'stopped', 'done'));
-- Exact creation time, so two batches started in quick succession are always in order.
ALTER TABLE public.application_queues ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE public.application_queues
  -- What the page worked out: the consolidated questions, coverage, and what each job waits on.
  ADD COLUMN IF NOT EXISTS plan jsonb,
  -- The email the applications are sent with.
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.application_queues ADD CONSTRAINT application_queues_plan_size CHECK (plan IS NULL OR pg_column_size(plan) < 200000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. Applications: the new states, and what the worker records
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_applications DROP CONSTRAINT IF EXISTS job_applications_status_check;
-- Applications from before: a question waiting for the person, or one handed over to send by hand.
UPDATE public.job_applications SET status = 'needs_attention', reason_code = coalesce(reason_code, 'question') WHERE status = 'needs_answer';
UPDATE public.job_applications
   SET status = 'needs_attention',
       reason = 'Prepared before MadeVisa could submit on employers’ sites. Press “Let MadeVisa submit it”, or send it yourself.',
       reason_code = 'handover'
 WHERE status = 'review_required';
ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_status_check
  CHECK (status IN ('queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted', 'needs_attention', 'failed', 'skipped', 'blocked', 'already_applied', 'expired'));

ALTER TABLE public.job_applications
  -- The batch this application was first made for.
  ADD COLUMN IF NOT EXISTS origin_queue uuid,
  -- greenhouse | lever | ashby | workday | … | other | email
  ADD COLUMN IF NOT EXISTS platform text,
  -- The person's answers by concept for this job (what the worker falls back on when a live form asks more).
  ADD COLUMN IF NOT EXISTS concepts jsonb,
  ADD COLUMN IF NOT EXISTS email_used text,
  ADD COLUMN IF NOT EXISTS cv_sha256 text,
  ADD COLUMN IF NOT EXISTS cv_path text,
  -- What the worker saw: final address, confirmation text, screenshot path.
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  -- For the progress screen: opening | filling | uploading | submitting.
  ADD COLUMN IF NOT EXISTS progress text,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  -- Set the moment Submit is pressed: after that, an interrupted attempt is never simply retried.
  ADD COLUMN IF NOT EXISTS submit_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS tries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_try_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_concepts_size CHECK (concepts IS NULL OR pg_column_size(concepts) < 20000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.job_applications ADD CONSTRAINT job_applications_evidence_size CHECK (evidence IS NULL OR pg_column_size(evidence) < 20000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS job_applications_ready_idx ON public.job_applications (status, next_try_at) WHERE status IN ('ready', 'submitting');

ALTER TABLE public.application_attempts DROP CONSTRAINT IF EXISTS application_attempts_result_check;
ALTER TABLE public.application_attempts ADD CONSTRAINT application_attempts_result_check
  CHECK (result IS NULL OR result IN ('sent', 'failed', 'handover', 'attention', 'blocked', 'retry', 'interrupted'));
ALTER TABLE public.application_attempts ADD COLUMN IF NOT EXISTS worker text;

ALTER TABLE public.application_answers DROP CONSTRAINT IF EXISTS application_answers_source_check;
ALTER TABLE public.application_answers ADD CONSTRAINT application_answers_source_check CHECK (source IN ('you', 'cv', 'account', 'madevisa', 'derived'));

/* Each application's form, as read before anything was filled in. */
CREATE TABLE IF NOT EXISTS public.application_forms (
  application_id uuid PRIMARY KEY REFERENCES public.job_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text,
  status text NOT NULL CHECK (status IN ('ok', 'live', 'login', 'none', 'closed')),
  questions jsonb CHECK (questions IS NULL OR (jsonb_typeof(questions) = 'array' AND pg_column_size(questions) < 120000)),
  read_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.application_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "application_forms_read" ON public.application_forms;
CREATE POLICY "application_forms_read" ON public.application_forms FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
REVOKE ALL ON public.application_forms FROM anon, authenticated;
GRANT SELECT ON public.application_forms TO authenticated;

/* The workers: one row each, with when they last checked in. */
CREATE TABLE IF NOT EXISTS public.apply_workers (
  id text PRIMARY KEY CHECK (length(id) <= 80),
  version text,
  info jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.apply_workers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apply_workers FROM anon, authenticated;

/* The files the worker sent (the exact CV), and screenshots of the employer's confirmation. Private: the owner reads their own. */
INSERT INTO storage.buckets (id, name, public) VALUES ('application-files', 'application-files', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "application_files_owner_read" ON storage.objects;
CREATE POLICY "application_files_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'application-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 4. The allowed moves (the same table as src/lib/apply/machine.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_can_move(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_from
    WHEN 'queued' THEN p_to IN ('analyzing', 'preparing', 'skipped', 'already_applied', 'expired')
    WHEN 'analyzing' THEN p_to IN ('queued', 'preparing', 'needs_attention', 'blocked', 'skipped', 'already_applied', 'expired')
    WHEN 'preparing' THEN p_to IN ('queued', 'ready', 'needs_attention', 'blocked', 'failed', 'skipped', 'already_applied', 'expired')
    WHEN 'ready' THEN p_to IN ('submitting', 'queued', 'needs_attention', 'skipped', 'expired')
    WHEN 'submitting' THEN p_to IN ('submitted', 'failed', 'needs_attention', 'blocked', 'ready', 'expired')
    WHEN 'needs_attention' THEN p_to IN ('queued', 'ready', 'submitted', 'skipped', 'expired')
    WHEN 'blocked' THEN p_to IN ('queued', 'ready', 'submitted', 'skipped')
    WHEN 'failed' THEN p_to IN ('queued', 'ready', 'submitted', 'skipped')
    WHEN 'skipped' THEN p_to IN ('queued')
    ELSE false
  END;
$$;

/* Still to be worked on — by the page or by the worker. */
CREATE OR REPLACE FUNCTION public.apply_pending(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT p_status IN ('queued', 'analyzing', 'preparing', 'ready', 'submitting'); $$;

CREATE OR REPLACE FUNCTION public.apply_row(a public.job_applications)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'jobId', a.job_id, 'queueId', a.queue_id, 'title', a.title, 'company', a.company, 'cc', a.cc, 'country', a.country,
    'score', a.score, 'status', a.status, 'priority', a.priority, 'rank', a.rank, 'channel', a.channel, 'sponsorship', a.sponsorship,
    'url', a.url, 'reason', a.reason, 'reasonCode', a.reason_code, 'needs', a.needs, 'verified', a.verified, 'confirmation', a.confirmation,
    'cvName', a.cv_name, 'coverLetter', a.cover_letter, 'submittedAt', a.submitted_at, 'updatedAt', a.updated_at, 'createdAt', a.created_at,
    'platform', a.platform, 'emailUsed', a.email_used, 'progress', a.progress, 'evidence', a.evidence
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Status: allowance, the batch in progress, and whether a worker is on
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_worker_online()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.apply_workers WHERE seen_at > now() - interval '3 minutes'); $$;
REVOKE ALL ON FUNCTION public.apply_worker_online() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_queue_json(q public.application_queues)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', q.id, 'state', q.state, 'reason', q.pause_reason, 'cvAt', q.cv_at, 'createdAt', q.created_at,
    'plan', q.plan, 'email', q.email, 'confirmedAt', q.confirmed_at, 'finishedAt', q.finished_at
  ) END;
$$;

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
    RETURN jsonb_build_object('signedIn', false, 'enabled', s.enabled, 'freeMonthly', s.free_monthly, 'proMonthly', s.pro_monthly, 'worker', jsonb_build_object('online', public.apply_worker_online()));
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
    'chargeSelfSent', s.charge_self_sent,
    'worker', jsonb_build_object('online', public.apply_worker_online(), 'autoSubmit', s.auto_submit),
    'queue', public.apply_queue_json(q)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_status() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Queue a batch (now starts as "analyzing": nothing is sent before the person confirms)
-- ---------------------------------------------------------------------------
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
  IF (SELECT count(*) FROM public.job_applications WHERE user_id = me AND public.apply_pending(status)) >= 200 THEN
    RAISE EXCEPTION 'You already have 200 applications waiting. Let some of them finish first.';
  END IF;

  -- A batch still being set up is replaced by this one: its applications go back to nothing.
  FOR q IN SELECT * FROM public.application_queues WHERE user_id = me AND state IN ('analyzing', 'awaiting_answers') FOR UPDATE LOOP
    -- Made for that batch: removed. Brought into it from an earlier batch: left skipped, with its history.
    DELETE FROM public.job_applications WHERE queue_id = q.id AND origin_queue = q.id AND status IN ('queued', 'analyzing', 'preparing', 'ready', 'needs_attention', 'blocked')
      AND NOT EXISTS (SELECT 1 FROM public.application_credits c WHERE c.application_id = job_applications.id AND c.state <> 'released');
    UPDATE public.job_applications SET status = 'skipped', reason = 'Left out of a batch you replaced.', reason_code = 'replaced', updated_at = now()
     WHERE queue_id = q.id AND status IN ('queued', 'analyzing', 'preparing', 'ready');
    UPDATE public.application_queues SET state = 'stopped', finished_at = now(), updated_at = now() WHERE id = q.id;
  END LOOP;

  INSERT INTO public.application_queues (user_id, cv_at, state) VALUES (me, left(p_cv_at, 40), 'analyzing') RETURNING * INTO q;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT sj.id, sj.title, sj.publisher_id, sj.status, sj.expires_at, sj.application_url, sj.official_url,
           p.name AS company, c.name AS country, c.iso_code AS cc
      INTO j
      FROM public.sponsored_jobs sj
      LEFT JOIN public.program_publishers p ON p.id = sj.publisher_id
      LEFT JOIN public.countries c ON c.id = sj.country_id
     WHERE sj.id = (it->>'jobId')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Applied to (or queued) before: a skipped or failed one joins this batch again; anything else is left as it is.
    SELECT * INTO a FROM public.job_applications x WHERE x.user_id = me AND x.job_id = j.id;
    IF FOUND THEN
      IF a.status IN ('skipped', 'failed', 'blocked', 'needs_attention') AND NOT public.apply_pending(a.status) THEN
        UPDATE public.job_applications SET queue_id = q.id, status = 'queued', reason = NULL, reason_code = NULL, needs = '[]'::jsonb,
          score = least(100, greatest(0, coalesce((it->>'score')::int, score))), rank = least(200, greatest(-50, coalesce((it->>'rank')::int, rank))), updated_at = now()
        WHERE id = a.id;
        added := added + 1;
      ELSE
        PERFORM public.apply_log(me, 'application_duplicate', a.id, q.id, jsonb_build_object('job', j.id, 'why', 'queued_before'));
      END IF;
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
                    AND (x.status = 'submitted' OR public.apply_pending(x.status)))
       OR EXISTS (SELECT 1 FROM public.application_reports r
                  WHERE r.user_id = me AND r.listing_kind = 'job' AND r.listing_id <> j.id AND r.publisher_id = j.publisher_id
                    AND r.status NOT IN ('clicked', 'withdrawn') AND public.apply_norm_title(r.listing_title) = nt) THEN
      st := 'already_applied'; why := 'This role at ' || coalesce(j.company, 'this company') || ' is already in your applications.'; code := 'same_role';
    END IF;

    INSERT INTO public.job_applications (
      user_id, queue_id, origin_queue, job_id, publisher_id, title, company, norm_title, cc, country, score, quality, decision, priority, rank, sponsorship, channel, url, status, reason, reason_code
    ) VALUES (
      me, q.id, q.id, j.id, j.publisher_id, left(j.title, 300), left(coalesce(j.company, 'Company'), 200), nt, j.cc, j.country,
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
    'queue', public.apply_queue_json(q),
    'applications', coalesce((SELECT jsonb_agg(public.apply_row(x) ORDER BY x.rank DESC, x.score DESC) FROM public.job_applications x WHERE x.queue_id = q.id), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Moving an application
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_transition(p_id uuid, p_user uuid, p_to text, p_detail jsonb, p_service boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  j record;
  s public.apply_settings;
  d jsonb := coalesce(p_detail, '{}'::jsonb);
  today date := (now() AT TIME ZONE 'utc')::date;
  period text := public.apply_period();
  c public.application_credits;
  conf jsonb;
  is_verified boolean := false;
  refund boolean := false;
  charge boolean := false;
  as_owner boolean := false;
  self_sent boolean := false;
  from_status text;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = p_id AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'error', 'message', 'No such application.'); END IF;
  SELECT * INTO s FROM public.apply_settings;
  from_status := a.status;

  IF a.status = p_to THEN RETURN jsonb_build_object('ok', true, 'app', public.apply_row(a)); END IF;
  IF NOT public.apply_can_move(a.status, p_to) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'An application that is ' || a.status || ' can’t become ' || p_to || '.', 'app', public.apply_row(a));
  END IF;

  -- What only the worker (or the email channel) may do.
  IF NOT p_service THEN
    IF p_to = 'submitting' OR a.status = 'submitting' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'MadeVisa is submitting this application right now.', 'app', public.apply_row(a));
    END IF;
    -- The person can only say they submitted one MadeVisa couldn't.
    IF p_to = 'submitted' AND a.status NOT IN ('needs_attention', 'blocked', 'failed') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Only a confirmation can mark this application as submitted.', 'app', public.apply_row(a));
    END IF;
  END IF;
  self_sent := p_to = 'submitted' AND NOT p_service;

  -- Re-check the job before work starts on it.
  IF p_to IN ('analyzing', 'preparing', 'ready') AND a.status IN ('queued', 'analyzing', 'needs_attention', 'blocked', 'failed') THEN
    SELECT sj.status, sj.expires_at INTO j FROM public.sponsored_jobs sj WHERE sj.id = a.job_id;
    IF NOT FOUND OR j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at <= now()) THEN
      UPDATE public.job_applications SET status = 'expired', reason = 'The job is no longer open.', reason_code = 'closed', updated_at = now() WHERE id = a.id RETURNING * INTO a;
      PERFORM public.apply_log(p_user, 'application_skipped', a.id, a.queue_id, jsonb_build_object('why', 'closed'));
      RETURN jsonb_build_object('ok', false, 'code', 'expired', 'message', a.reason, 'app', public.apply_row(a));
    END IF;
    IF EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = p_user AND r.listing_kind = 'job' AND r.listing_id = a.job_id AND r.status NOT IN ('clicked', 'withdrawn')) THEN
      UPDATE public.job_applications SET status = 'already_applied', reason = 'This job is already in your applications.', reason_code = 'already_applied', updated_at = now() WHERE id = a.id RETURNING * INTO a;
      PERFORM public.apply_log(p_user, 'application_duplicate', a.id, a.queue_id, NULL);
      RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'message', a.reason, 'app', public.apply_row(a));
    END IF;
  END IF;

  -- Ready means ready: the CV it will be sent with is saved.
  IF p_to = 'ready' AND NOT EXISTS (SELECT 1 FROM public.application_documents dd WHERE dd.application_id = a.id AND dd.kind = 'cv') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'This application has no CV saved yet.', 'app', public.apply_row(a));
  END IF;

  SELECT * INTO c FROM public.application_credits WHERE application_id = a.id FOR UPDATE;

  IF p_to = 'submitting' THEN
    -- The daily limit counts applications MadeVisa starts submitting today.
    IF a.day_started IS DISTINCT FROM today THEN
      IF (SELECT count(*) FROM public.job_applications x WHERE x.user_id = p_user AND x.day_started = today) >= public.apply_daily_limit(p_user) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'daily_limit', 'message', 'Today’s limit is reached. The rest carry on tomorrow.', 'app', public.apply_row(a));
      END IF;
      a.day_started := today;
    END IF;
    -- One is set aside before submitting, so two at once can't both take the last one.
    IF c.application_id IS NULL OR c.state = 'released' THEN
      PERFORM pg_advisory_xact_lock(hashtext('apply:' || p_user::text));
      IF public.apply_used(p_user) >= public.apply_limit(p_user) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'allowance', 'message', 'You’ve used this month’s applications.', 'app', public.apply_row(a));
      END IF;
      INSERT INTO public.application_credits (application_id, user_id, state, period) VALUES (a.id, p_user, 'held', period)
      ON CONFLICT (application_id) DO UPDATE SET state = 'held', period = excluded.period, updated_at = now();
    END IF;
    INSERT INTO public.application_attempts (application_id, user_id, channel, worker) VALUES (a.id, p_user, a.channel, left(d->>'worker', 80));
  END IF;

  IF p_to = 'submitted' THEN
    IF p_service AND coalesce(d->'confirmation'->>'kind', 'self') <> 'self' AND (coalesce(d->'confirmation'->>'id', '') <> '' OR d->'confirmation'->>'kind' = 'site') THEN
      conf := jsonb_build_object('kind', d->'confirmation'->>'kind', 'id', coalesce(nullif(left(d->'confirmation'->>'id', 200), ''), a.id::text), 'at', now());
      is_verified := true;
      charge := true;
    ELSE
      conf := jsonb_build_object('kind', 'self', 'at', now());
      charge := s.charge_self_sent;
    END IF;
    IF charge THEN
      IF c.application_id IS NULL OR c.state = 'released' THEN
        PERFORM pg_advisory_xact_lock(hashtext('apply:' || p_user::text));
        -- A confirmed submission is never undone for want of an allowance: it is counted either way.
        IF NOT is_verified AND public.apply_used(p_user) >= public.apply_limit(p_user) THEN
          RETURN jsonb_build_object('ok', false, 'code', 'allowance', 'message', 'You’ve used this month’s applications.', 'app', public.apply_row(a));
        END IF;
        INSERT INTO public.application_credits (application_id, user_id, state, period) VALUES (a.id, p_user, 'used', period)
        ON CONFLICT (application_id) DO UPDATE SET state = 'used', period = excluded.period, updated_at = now();
      ELSIF c.state = 'held' THEN
        UPDATE public.application_credits SET state = 'used', updated_at = now() WHERE application_id = a.id;
      END IF;
      PERFORM public.apply_log(p_user, 'application_credit_used', a.id, a.queue_id, NULL);
    ELSIF c.state = 'held' THEN
      UPDATE public.application_credits SET state = 'released', updated_at = now() WHERE application_id = a.id;
      refund := true;
    END IF;
  ELSIF p_to <> 'submitting' AND c.state = 'held' THEN
    -- Not submitted after all: the one set aside is given back.
    UPDATE public.application_credits SET state = 'released', updated_at = now() WHERE application_id = a.id;
    refund := true;
  END IF;

  UPDATE public.job_applications SET
    status = p_to,
    day_started = a.day_started,
    reason = CASE WHEN p_to IN ('queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted') THEN NULL ELSE left(coalesce(d->>'reason', reason), 600) END,
    reason_code = CASE WHEN p_to IN ('queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted') THEN NULL ELSE left(coalesce(d->>'code', reason_code), 60) END,
    needs = CASE WHEN p_to = 'needs_attention' AND jsonb_typeof(d->'needs') = 'array' AND pg_column_size(d->'needs') < 40000 THEN d->'needs' ELSE '[]'::jsonb END,
    cv_name = coalesce(left(d->>'cvName', 200), cv_name),
    cover_letter = coalesce((d->>'coverLetter')::boolean, cover_letter),
    platform = coalesce(left(d->>'platform', 40), platform),
    verified = is_verified,
    confirmation = CASE WHEN p_to = 'submitted' THEN conf ELSE NULL END,
    submitted_at = CASE WHEN p_to = 'submitted' THEN now() ELSE NULL END,
    evidence = CASE WHEN jsonb_typeof(d->'evidence') = 'object' AND pg_column_size(d->'evidence') < 20000 THEN d->'evidence' ELSE evidence END,
    progress = CASE WHEN p_to = 'submitting' THEN 'opening' ELSE NULL END,
    locked_by = CASE WHEN p_to = 'submitting' THEN left(d->>'worker', 80) ELSE NULL END,
    locked_at = CASE WHEN p_to = 'submitting' THEN now() ELSE NULL END,
    submit_clicked_at = CASE WHEN p_to = 'submitting' THEN NULL ELSE submit_clicked_at END,
    tries = CASE WHEN p_to = 'submitting' THEN tries + 1 WHEN p_to IN ('queued') THEN 0 ELSE tries END,
    next_try_at = CASE WHEN p_to = 'ready' AND (d->>'retryInSeconds') ~ '^\d{1,6}$' THEN now() + make_interval(secs => (d->>'retryInSeconds')::int) ELSE NULL END,
    updated_at = now()
  WHERE id = a.id RETURNING * INTO a;

  IF refund THEN PERFORM public.apply_log(p_user, 'application_credit_refunded', a.id, a.queue_id, jsonb_build_object('to', p_to)); END IF;

  IF p_to = 'submitted' THEN
    PERFORM public.apply_log(p_user, 'application_submitted', a.id, a.queue_id, jsonb_build_object('channel', a.channel, 'verified', a.verified, 'score', a.score, 'platform', a.platform, 'self', self_sent));
    INSERT INTO public.application_outcomes (application_id, user_id, stage, source) VALUES (a.id, p_user, 'applied', 'auto_apply') ON CONFLICT DO NOTHING;
    -- Into the existing application tracker, as a confirmed application. Never allowed to undo the submission.
    BEGIN
      IF a.publisher_id IS NOT NULL THEN
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
  ELSIF p_to IN ('needs_attention', 'blocked') THEN
    PERFORM public.apply_log(p_user, 'application_requires_review', a.id, a.queue_id, jsonb_build_object('code', a.reason_code, 'status', p_to));
  ELSIF p_to IN ('skipped', 'expired') THEN
    PERFORM public.apply_log(p_user, 'application_skipped', a.id, a.queue_id, jsonb_build_object('code', a.reason_code));
  END IF;

  -- How the attempt ended.
  IF from_status = 'submitting' AND p_to IN ('submitted', 'failed', 'needs_attention', 'blocked', 'ready', 'expired') THEN
    UPDATE public.application_attempts SET finished_at = now(),
      result = CASE p_to WHEN 'submitted' THEN 'sent' WHEN 'failed' THEN 'failed' WHEN 'needs_attention' THEN 'attention' WHEN 'blocked' THEN 'blocked' WHEN 'ready' THEN coalesce(d->>'attempt', 'retry') ELSE 'failed' END,
      detail = coalesce(detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('code', d->>'code', 'reason', left(d->>'reason', 300), 'confirmation', conf, 'sha256', d->>'sha256'))
    WHERE id = (SELECT id FROM public.application_attempts WHERE application_id = a.id AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1);
  END IF;

  PERFORM public.apply_queue_settle(a.queue_id);
  RETURN jsonb_build_object('ok', true, 'app', public.apply_row(a));
END;
$$;
REVOKE ALL ON FUNCTION public.apply_transition(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

/*
A running batch with nothing left to work on is done: the person is told
(the bell, and an email when the mail service is set up) — once.
*/
CREATE OR REPLACE FUNCTION public.apply_queue_settle(p_queue uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.application_queues;
  sent int;
  attention int;
  skipped int;
  key text;
  sender text;
  body text;
BEGIN
  IF p_queue IS NULL THEN RETURN; END IF;
  SELECT * INTO q FROM public.application_queues WHERE id = p_queue;
  IF q.state <> 'running' OR EXISTS (SELECT 1 FROM public.job_applications x WHERE x.queue_id = q.id AND public.apply_pending(x.status)) THEN RETURN; END IF;
  UPDATE public.application_queues SET state = 'done', pause_reason = NULL, finished_at = now(), updated_at = now() WHERE id = q.id AND state = 'running';
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.apply_log(q.user_id, 'auto_apply_completed', NULL, q.id, NULL);

  SELECT count(*) FILTER (WHERE status = 'submitted'),
         count(*) FILTER (WHERE status IN ('needs_attention', 'blocked', 'failed')),
         count(*) FILTER (WHERE status IN ('skipped', 'already_applied', 'expired'))
    INTO sent, attention, skipped
    FROM public.job_applications WHERE queue_id = q.id;
  IF q.notified_at IS NOT NULL OR sent + attention = 0 THEN RETURN; END IF;
  UPDATE public.application_queues SET notified_at = now() WHERE id = q.id;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (q.user_id, 'auto_apply_done',
          CASE WHEN sent > 0 THEN sent || CASE WHEN sent = 1 THEN ' application submitted' ELSE ' applications submitted' END ELSE 'Your applications need your attention' END,
          concat_ws(' · ', CASE WHEN q.email IS NOT NULL THEN 'Using ' || q.email END, CASE WHEN attention > 0 THEN attention || ' need your attention' END),
          '/cv-match#applications');

  -- An email as well, when the mail service is set up (the same Resend key the job alerts use).
  SELECT value INTO key FROM public.app_secrets WHERE name = 'resend_api_key';
  IF coalesce(key, '') = '' OR coalesce(q.email, '') = '' THEN RETURN; END IF;
  SELECT value INTO sender FROM public.app_secrets WHERE name = 'email_from';
  body := concat_ws(E'\n',
    'Your applications are out.',
    '',
    sent || CASE WHEN sent = 1 THEN ' application was' ELSE ' applications were' END || ' submitted on the employers’ career sites using ' || q.email || '.',
    CASE WHEN attention > 0 THEN attention || CASE WHEN attention = 1 THEN ' application needs' ELSE ' applications need' END || ' your attention — for example an employer that asks you to sign in.' END,
    CASE WHEN skipped > 0 THEN skipped || ' skipped (already applied, or no longer open).' END,
    '',
    'Employers reply to ' || q.email || ' directly. Confirmation emails from them will arrive there too.',
    '',
    'See every application, with the CV and answers used: https://madevisa.com/cv-match#applications');
  BEGIN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json', 'Idempotency-Key', 'madevisa-batch-' || q.id),
      body := jsonb_build_object(
        'from', coalesce(sender, 'MadeVisa <onboarding@resend.dev>'),
        'to', jsonb_build_array(q.email),
        'subject', CASE WHEN sent > 0 THEN sent || CASE WHEN sent = 1 THEN ' application submitted' ELSE ' applications submitted' END || ' — MadeVisa' ELSE 'Your MadeVisa applications need your attention' END,
        'text', body
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'apply: completion email not sent: %', SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_queue_settle(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The batch from the page: plan, confirm, pause, resume, stop
-- ---------------------------------------------------------------------------
/*
p_state:
  awaiting_answers   the page read every form; p_plan holds the consolidated questions
  running            the person confirmed ("Save answers & apply to 16 jobs"); p_email is the address used
  paused | stopped   as before
*/
DROP FUNCTION IF EXISTS public.apply_queue_set(uuid, text, text);
CREATE OR REPLACE FUNCTION public.apply_queue_set(p_queue uuid, p_state text, p_reason text DEFAULT NULL, p_plan jsonb DEFAULT NULL, p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  q public.application_queues;
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('awaiting_answers', 'running', 'paused', 'stopped') THEN RAISE EXCEPTION 'Unknown state.'; END IF;
  SELECT * INTO q FROM public.application_queues WHERE id = p_queue AND user_id = me FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such batch.'; END IF;
  IF q.state IN ('stopped', 'done') AND p_state <> 'running' THEN
    RETURN public.apply_queue_json(q);
  END IF;
  IF v_email <> '' AND v_email !~* '^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]{2,}$' THEN RAISE EXCEPTION 'That email address doesn’t look right.'; END IF;
  IF p_state = 'running' AND q.confirmed_at IS NULL AND v_email = '' THEN RAISE EXCEPTION 'Applications need an email address for employers to reply to.'; END IF;

  -- Stopping or pausing: nothing half-prepared is left behind (one being submitted finishes on its own).
  IF p_state IN ('paused', 'stopped') THEN
    UPDATE public.job_applications SET status = 'queued', updated_at = now() WHERE queue_id = q.id AND status IN ('analyzing', 'preparing');
  END IF;
  IF p_state = 'stopped' THEN
    UPDATE public.job_applications SET status = 'skipped', reason = 'You stopped this batch before it was submitted.', reason_code = 'stopped', updated_at = now()
     WHERE queue_id = q.id AND status IN ('queued', 'ready');
  END IF;

  UPDATE public.application_queues SET
    state = p_state,
    pause_reason = CASE WHEN p_state = 'paused' THEN CASE WHEN p_reason IN ('you', 'daily_limit', 'allowance', 'offline') THEN p_reason ELSE 'you' END END,
    plan = CASE WHEN p_plan IS NOT NULL AND jsonb_typeof(p_plan) = 'object' THEN p_plan ELSE plan END,
    email = CASE WHEN v_email <> '' THEN v_email ELSE email END,
    confirmed_at = CASE WHEN p_state = 'running' THEN coalesce(confirmed_at, now()) ELSE confirmed_at END,
    finished_at = CASE WHEN p_state = 'stopped' THEN now() WHEN p_state = 'running' THEN NULL ELSE finished_at END,
    updated_at = now()
  WHERE id = q.id RETURNING * INTO q;

  PERFORM public.apply_log(me, CASE p_state WHEN 'paused' THEN 'auto_apply_paused' WHEN 'running' THEN 'auto_apply_resumed' WHEN 'stopped' THEN 'auto_apply_stopped' ELSE 'auto_apply_planned' END,
                           NULL, q.id, CASE WHEN p_state = 'paused' THEN jsonb_build_object('reason', q.pause_reason)
                                            WHEN p_state = 'awaiting_answers' THEN jsonb_build_object('asked', jsonb_array_length(coalesce(q.plan->'ask', '[]'::jsonb)), 'coverage', q.plan->'coverage'->'pct') END);
  IF p_state = 'running' THEN PERFORM public.apply_queue_settle(q.id); SELECT * INTO q FROM public.application_queues WHERE id = q.id; END IF;
  RETURN public.apply_queue_json(q);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_queue_set(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_queue_set(uuid, text, text, jsonb, text) TO authenticated;

/* The page saves what it read of an application's form. */
CREATE OR REPLACE FUNCTION public.apply_save_form(p_id uuid, p_platform text, p_status text, p_questions jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.job_applications WHERE id = p_id AND user_id = me) THEN RAISE EXCEPTION 'No such application.'; END IF;
  IF p_status NOT IN ('ok', 'live', 'login', 'none', 'closed') THEN RAISE EXCEPTION 'Unknown form status.'; END IF;
  INSERT INTO public.application_forms (application_id, user_id, platform, status, questions)
  VALUES (p_id, me, left(p_platform, 40), p_status, CASE WHEN jsonb_typeof(p_questions) = 'array' THEN p_questions END)
  ON CONFLICT (application_id) DO UPDATE SET platform = excluded.platform, status = excluded.status, questions = excluded.questions, read_at = now();
  UPDATE public.job_applications SET platform = left(p_platform, 40) WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_save_form(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_save_form(uuid, text, text, jsonb) TO authenticated;

/* For the apply function: where each of a person's applications is sent (service role only). */
CREATE OR REPLACE FUNCTION public.apply_form_targets(p_user uuid, p_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'url', a.url,
    'email', a.channel = 'madevisa',
    'open', sj.status = 'published' AND (sj.expires_at IS NULL OR sj.expires_at > now())
  )), '[]'::jsonb)
  FROM public.job_applications a
  LEFT JOIN public.sponsored_jobs sj ON sj.id = a.job_id
  WHERE a.user_id = p_user AND a.id = ANY (p_ids[1:60]);
$$;
REVOKE ALL ON FUNCTION public.apply_form_targets(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_form_targets(uuid, uuid[]) TO service_role;

/* For the apply function: keep what it read of each form (service role only). p_forms: { <application id>: { platform, status, questions } } */
CREATE OR REPLACE FUNCTION public.apply_forms_store(p_user uuid, p_forms jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  v jsonb;
  n int := 0;
BEGIN
  IF jsonb_typeof(p_forms) <> 'object' THEN RETURN 0; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_forms) LOOP
    CONTINUE WHEN k !~* '^[0-9a-f-]{36}$' OR coalesce(v->>'status', '') NOT IN ('ok', 'live', 'login', 'none', 'closed');
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.job_applications WHERE id = k::uuid AND user_id = p_user);
    INSERT INTO public.application_forms (application_id, user_id, platform, status, questions)
    VALUES (k::uuid, p_user, left(v->>'platform', 40), v->>'status', CASE WHEN jsonb_typeof(v->'questions') = 'array' AND pg_column_size(v->'questions') < 120000 THEN v->'questions' END)
    ON CONFLICT (application_id) DO UPDATE SET platform = excluded.platform, status = excluded.status, questions = excluded.questions, read_at = now();
    UPDATE public.job_applications SET platform = left(v->>'platform', 40) WHERE id = k::uuid;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_forms_store(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_forms_store(uuid, jsonb) TO service_role;

/* What was prepared: the CV, the letter, the answers — and the answers by concept for the worker. */
DROP FUNCTION IF EXISTS public.apply_save(uuid, jsonb, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.apply_save(p_id uuid, p_cv jsonb, p_letter jsonb DEFAULT NULL, p_answers jsonb DEFAULT NULL, p_concepts jsonb DEFAULT NULL)
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
  ELSIF p_cv IS NOT NULL THEN
    DELETE FROM public.application_documents WHERE application_id = a.id AND kind = 'cover_letter';
  END IF;

  IF jsonb_typeof(p_answers) = 'array' THEN
    IF jsonb_array_length(p_answers) > 120 THEN RAISE EXCEPTION 'Too many answers.'; END IF;
    DELETE FROM public.application_answers WHERE application_id = a.id;
    FOR x IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
      CONTINUE WHEN coalesce(x->>'id', '') = '' OR coalesce(x->>'value', '') = '';
      INSERT INTO public.application_answers (application_id, user_id, question_id, label, value, source, key)
      VALUES (a.id, me, left(x->>'id', 200), left(coalesce(x->>'label', x->>'id'), 600), left(x->>'value', 6000),
              CASE WHEN x->>'source' IN ('you', 'cv', 'account', 'madevisa', 'derived') THEN x->>'source' ELSE 'you' END, nullif(left(x->>'key', 40), ''))
      ON CONFLICT (application_id, question_id) DO UPDATE SET label = excluded.label, value = excluded.value, source = excluded.source, key = excluded.key;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_concepts) = 'object' THEN
    UPDATE public.job_applications SET concepts = p_concepts WHERE id = a.id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_save(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_save(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. The worker (service role only)
-- ---------------------------------------------------------------------------
/* Check in. Returns the settings the worker runs with. */
CREATE OR REPLACE FUNCTION public.apply_worker_beat(p_worker text, p_version text DEFAULT NULL, p_info jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s public.apply_settings;
BEGIN
  INSERT INTO public.apply_workers (id, version, info, seen_at) VALUES (left(p_worker, 80), left(p_version, 40), p_info, now())
  ON CONFLICT (id) DO UPDATE SET version = excluded.version, info = excluded.info, seen_at = now();
  DELETE FROM public.apply_workers WHERE seen_at < now() - interval '7 days';
  SELECT * INTO s FROM public.apply_settings;
  RETURN jsonb_build_object('enabled', s.enabled, 'autoSubmit', s.auto_submit, 'concurrency', s.worker_concurrency);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_beat(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_beat(text, text, jsonb) TO service_role;

/*
Applications left "submitting" by a worker that stopped (crashed, redeployed):
  • Submit was never pressed → back to ready, the held credit given back.
  • Submit was pressed, no result → needs attention: it may have gone through,
    and sending it twice would be worse than asking.
*/
CREATE OR REPLACE FUNCTION public.apply_worker_reap(p_minutes integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  n int := 0;
BEGIN
  FOR a IN SELECT * FROM public.job_applications WHERE status = 'submitting' AND locked_at < now() - make_interval(mins => greatest(2, p_minutes)) FOR UPDATE SKIP LOCKED LOOP
    IF a.submit_clicked_at IS NULL THEN
      PERFORM public.apply_transition(a.id, a.user_id, 'ready', jsonb_build_object('attempt', 'interrupted', 'retryInSeconds', 60), true);
    ELSE
      PERFORM public.apply_transition(a.id, a.user_id, 'needs_attention', jsonb_build_object('code', 'unconfirmed',
        'reason', 'MadeVisa pressed Submit but couldn’t confirm the result. Check your email for a confirmation from the employer before applying again.'), true);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_reap(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_reap(integer) TO service_role;

/*
Take up to p_limit ready applications from running batches, oldest batch
first, best match first — and move each to "submitting" (credit held, daily
limit checked). Returns everything needed to submit each one.
*/
CREATE OR REPLACE FUNCTION public.apply_worker_claim(p_worker text, p_limit integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cand public.job_applications;
  a public.job_applications;
  q public.application_queues;
  r jsonb;
  out jsonb := '[]'::jsonb;
  s public.apply_settings;
  lim int := greatest(1, least(10, coalesce(p_limit, 1)));
BEGIN
  SELECT * INTO s FROM public.apply_settings;
  IF NOT s.enabled THEN RETURN out; END IF;
  PERFORM public.apply_worker_reap(15);
  FOR cand IN
    SELECT x.* FROM public.job_applications x
      JOIN public.application_queues qq ON qq.id = x.queue_id
     WHERE x.status = 'ready' AND qq.state = 'running' AND (x.next_try_at IS NULL OR x.next_try_at <= now())
     ORDER BY qq.created_at, x.rank DESC, x.score DESC
     LIMIT lim * 4
     FOR UPDATE OF x SKIP LOCKED
  LOOP
    EXIT WHEN jsonb_array_length(out) >= lim;
    r := public.apply_transition(cand.id, cand.user_id, 'submitting', jsonb_build_object('worker', p_worker), true);
    IF NOT (r->>'ok')::boolean THEN
      IF r->>'code' = 'daily_limit' THEN
        -- Today's limit: it carries on by itself tomorrow.
        UPDATE public.job_applications SET next_try_at = ((date_trunc('day', now() AT TIME ZONE 'utc') + interval '1 day') AT TIME ZONE 'utc')
         WHERE user_id = cand.user_id AND status = 'ready' AND queue_id = cand.queue_id;
      ELSIF r->>'code' = 'allowance' THEN
        -- The month is used up: the batch waits, with the reason on screen, until the person continues it.
        UPDATE public.application_queues SET state = 'paused', pause_reason = 'allowance', updated_at = now() WHERE id = cand.queue_id AND state = 'running';
        IF FOUND THEN PERFORM public.apply_log(cand.user_id, 'auto_apply_paused', NULL, cand.queue_id, jsonb_build_object('reason', 'allowance')); END IF;
      END IF;
      CONTINUE;
    END IF;
    SELECT * INTO q FROM public.application_queues WHERE id = cand.queue_id;
    UPDATE public.job_applications SET email_used = coalesce(
        (SELECT value FROM public.application_answers WHERE application_id = cand.id AND key = 'email' LIMIT 1), q.email,
        (SELECT u.email FROM auth.users u WHERE u.id = cand.user_id))
     WHERE id = cand.id RETURNING * INTO a;
    out := out || jsonb_build_array(jsonb_build_object(
      'id', a.id,
      'userId', a.user_id,
      'jobId', a.job_id,
      'title', a.title,
      'company', a.company,
      'cc', a.cc,
      'country', a.country,
      'url', a.url,
      'platform', a.platform,
      'channel', a.channel,
      'email', a.email_used,
      'autoSubmit', s.auto_submit,
      'concepts', coalesce(a.concepts, '{}'::jsonb),
      'answers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', aa.question_id, 'label', aa.label, 'value', aa.value, 'key', aa.key) ORDER BY aa.id) FROM public.application_answers aa WHERE aa.application_id = a.id), '[]'::jsonb),
      'form', (SELECT jsonb_build_object('platform', f.platform, 'status', f.status, 'questions', f.questions) FROM public.application_forms f WHERE f.application_id = a.id),
      'cv', (SELECT jsonb_build_object('name', dd.name, 'content', dd.content, 'lines', dd.meta->'lines') FROM public.application_documents dd WHERE dd.application_id = a.id AND dd.kind = 'cv'),
      'letter', (SELECT jsonb_build_object('name', dd.name, 'content', dd.content) FROM public.application_documents dd WHERE dd.application_id = a.id AND dd.kind = 'cover_letter'),
      -- The email channel: where the employer asked for applications, and the mail service.
      'mail', CASE WHEN a.channel = 'madevisa' THEN jsonb_build_object(
        'to', public.apply_channel_email(a.job_id),
        'key', (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'),
        'from', (SELECT value FROM public.app_secrets WHERE name = 'email_from')) END
    ));
  END LOOP;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_claim(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_claim(text, integer) TO service_role;

/* Where the worker is with one application — for the progress screen. "submitting" also records that Submit was pressed. */
CREATE OR REPLACE FUNCTION public.apply_worker_progress(p_id uuid, p_worker text, p_stage text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_stage NOT IN ('opening', 'filling', 'uploading', 'submitting') THEN RETURN false; END IF;
  UPDATE public.job_applications SET progress = p_stage, locked_at = now(),
    submit_clicked_at = CASE WHEN p_stage = 'submitting' THEN coalesce(submit_clicked_at, now()) ELSE submit_clicked_at END
   WHERE id = p_id AND status = 'submitting' AND locked_by = p_worker;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_progress(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_progress(uuid, text, text) TO service_role;

/*
How it ended. p_to: submitted | failed | needs_attention | blocked | ready (try again later).
p_detail: { reason, code, confirmation: {kind:'site'|'email', id}, evidence: {...}, needs: [...],
            sha256, cvPath, retryInSeconds }
A worker can only report on an application it holds.
*/
CREATE OR REPLACE FUNCTION public.apply_worker_report(p_id uuid, p_worker text, p_to text, p_detail jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.job_applications;
  d jsonb := coalesce(p_detail, '{}'::jsonb);
  r jsonb;
BEGIN
  IF p_to NOT IN ('submitted', 'failed', 'needs_attention', 'blocked', 'ready', 'expired') THEN RAISE EXCEPTION 'Unknown result.'; END IF;
  SELECT * INTO a FROM public.job_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR a.status <> 'submitting' OR a.locked_by IS DISTINCT FROM p_worker THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_held', 'message', 'This worker doesn’t hold that application.');
  END IF;
  -- Three tries at most; then it needs the person.
  IF p_to = 'ready' AND a.tries >= 3 THEN
    p_to := 'failed';
    d := d || jsonb_build_object('reason', coalesce(d->>'reason', 'The employer’s site didn’t respond after three tries.'), 'code', coalesce(d->>'code', 'retries'));
  END IF;
  UPDATE public.job_applications SET
    cv_sha256 = coalesce(left(d->>'sha256', 80), cv_sha256),
    cv_path = coalesce(left(d->>'cvPath', 300), cv_path)
  WHERE id = a.id;
  r := public.apply_transition(a.id, a.user_id, p_to, d, true);
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_report(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_report(uuid, text, text, jsonb) TO service_role;

/* The email channel through the edge function (unchanged behaviour): it reads the same send context. */
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
    'candidateEmail', coalesce(a.email_used, (SELECT u.email FROM auth.users u WHERE u.id = p_user)),
    'sentBefore', (SELECT t.detail->'confirmation' FROM public.application_attempts t WHERE t.application_id = a.id AND t.result = 'sent' ORDER BY t.started_at DESC LIMIT 1),
    'resendKey', (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'),
    'from', (SELECT value FROM public.app_secrets WHERE name = 'email_from')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Product events from the page (two more)
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
  IF p_name NOT IN ('cv_uploaded', 'matches_loaded', 'auto_apply_opened', 'auto_apply_preferences_saved', 'auto_apply_review_opened', 'auto_apply_analyzed', 'auto_apply_answers_saved') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.application_events WHERE user_id = me AND at > now() - interval '1 hour') > 400 THEN RETURN; END IF;
  INSERT INTO public.application_events (user_id, name, queue_id, props)
  VALUES (me, p_name, p_queue, CASE WHEN p_props IS NOT NULL AND pg_column_size(p_props) < 2000 THEN p_props END);
END;
$$;

/* Admin: the switches, now with billing and the worker. */
DROP FUNCTION IF EXISTS public.apply_configure(boolean, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.apply_configure(p_enabled boolean DEFAULT NULL, p_free_monthly integer DEFAULT NULL, p_pro_monthly integer DEFAULT NULL, p_daily_max integer DEFAULT NULL,
                                       p_charge_self_sent boolean DEFAULT NULL, p_auto_submit boolean DEFAULT NULL, p_worker_concurrency integer DEFAULT NULL)
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
    charge_self_sent = coalesce(p_charge_self_sent, charge_self_sent),
    auto_submit = coalesce(p_auto_submit, auto_submit),
    worker_concurrency = coalesce(p_worker_concurrency, worker_concurrency),
    updated_at = now()
  RETURNING * INTO s;
  RETURN to_jsonb(s) || jsonb_build_object('workerOnline', public.apply_worker_online());
END;
$$;
REVOKE ALL ON FUNCTION public.apply_configure(boolean, integer, integer, integer, boolean, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_configure(boolean, integer, integer, integer, boolean, boolean, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
