/*
# Auto Apply with Pro: MadeVisa applies to new matching jobs by itself
Run AFTER 20261208090000_apply_submitted_email.sql. Safe to run more than once.

A Pro member switches on "Auto-apply to new jobs" on /cv-match. From then
on, the application worker (worker/src/auto.ts) checks every hour:
  1. new jobs since the last check, that the person hasn't applied to;
  2. scores each against their CV (the same rules as the match score);
  3. applies to the ones at or above their minimum (75% by default), with
     their saved answers — up to what is left of their month and day;
  4. anything only they can answer → "Needs attention" (and an email for
     every one that is submitted, from 20261208090000).

Free accounts: 3 applications a month (was 5) — the "apply to your top 3" box.
Change with: select apply_configure(p_free_monthly => 5);
*/

SET lock_timeout = '5s';

-- Free: 3 a month — only if it was still the old default (an admin's own choice is kept).
UPDATE public.apply_settings SET free_monthly = 3 WHERE free_monthly = 5;
ALTER TABLE public.apply_settings ALTER COLUMN free_monthly SET DEFAULT 3;

/* When each person's new jobs were last checked. */
CREATE TABLE IF NOT EXISTS public.apply_auto_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  -- Jobs published up to here have been looked at.
  seen_until timestamptz,
  applied integer NOT NULL DEFAULT 0
);
ALTER TABLE public.apply_auto_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apply_auto_state_read" ON public.apply_auto_state;
CREATE POLICY "apply_auto_state_read" ON public.apply_auto_state FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.apply_auto_state FROM anon, authenticated;
GRANT SELECT ON public.apply_auto_state TO authenticated;

/* People whose new jobs are due to be checked (service role only). */
CREATE OR REPLACE FUNCTION public.apply_auto_due(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'userId', p.user_id,
      'prefs', p.prefs,
      'cvText', c.text,
      'answers', coalesce(ap.answers, '{}'::jsonb),
      'custom', coalesce(ap.custom, '{}'::jsonb),
      'byCountry', coalesce(ap.by_country, '{}'::jsonb),
      'email', coalesce(nullif(ap.answers->'email'->>'value', ''), u.email),
      -- The first time: jobs from the last 3 days, then only what is new since the last check.
      'since', coalesce(st.seen_until, now() - interval '3 days'),
      'left', greatest(0, public.apply_limit(p.user_id) - public.apply_used(p.user_id))
    ) AS x
    FROM public.application_preferences p
    JOIN public.user_cvs c ON c.user_id = p.user_id
    JOIN auth.users u ON u.id = p.user_id
    LEFT JOIN public.application_profiles ap ON ap.user_id = p.user_id
    LEFT JOIN public.apply_auto_state st ON st.user_id = p.user_id
    WHERE (p.prefs->>'autoNew') = 'true'
      AND (SELECT enabled FROM public.apply_settings)
      AND public.is_pro(p.user_id)
      AND (st.checked_at IS NULL OR st.checked_at < now() - interval '50 minutes')
      AND public.apply_used(p.user_id) < public.apply_limit(p.user_id)
      -- Never while the person is in the middle of setting up a batch themselves.
      AND NOT EXISTS (SELECT 1 FROM public.application_queues q WHERE q.user_id = p.user_id AND q.state IN ('analyzing', 'awaiting_answers') AND q.updated_at > now() - interval '2 hours')
    ORDER BY st.checked_at NULLS FIRST
    LIMIT greatest(1, least(50, p_limit))
  ) t;
$$;
REVOKE ALL ON FUNCTION public.apply_auto_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_due(integer) TO service_role;

/* New published jobs for one person since a time, not applied to yet (service role only). */
CREATE OR REPLACE FUNCTION public.apply_auto_jobs(p_user uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', j.id, 'title', j.title, 'company', pub.name, 'publisherId', j.publisher_id,
      'cc', c.iso_code, 'country', c.name,
      'html', coalesce(nullif(j.facts->>'html', ''), j.description, ''),
      'jobFunction', j.job_function, 'experience', j.experience_level,
      'visa', j.visa_sponsorship,
      'at', coalesce(j.released_at, j.approved_at, j.created_at)
    ) AS x
    FROM public.sponsored_jobs j
    LEFT JOIN public.program_publishers pub ON pub.id = j.publisher_id
    LEFT JOIN public.countries c ON c.id = j.country_id
    WHERE j.status = 'published'
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND coalesce(j.released_at, j.approved_at, j.created_at) > p_since
      AND coalesce(nullif(j.application_url, ''), nullif(j.official_url, '')) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.job_applications a WHERE a.user_id = p_user AND a.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM public.application_reports r WHERE r.user_id = p_user AND r.listing_kind = 'job' AND r.listing_id = j.id)
    ORDER BY coalesce(j.released_at, j.approved_at, j.created_at) DESC
    LIMIT 400
  ) t;
$$;
REVOKE ALL ON FUNCTION public.apply_auto_jobs(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_jobs(uuid, timestamptz) TO service_role;

/* Note that a person's new jobs were checked, up to a time (service role only). */
CREATE OR REPLACE FUNCTION public.apply_auto_mark(p_user uuid, p_seen_until timestamptz, p_applied integer DEFAULT 0)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.apply_auto_state (user_id, checked_at, seen_until, applied) VALUES (p_user, now(), p_seen_until, greatest(0, p_applied))
  ON CONFLICT (user_id) DO UPDATE SET checked_at = now(), seen_until = greatest(coalesce(apply_auto_state.seen_until, excluded.seen_until), excluded.seen_until), applied = apply_auto_state.applied + greatest(0, p_applied);
$$;
REVOKE ALL ON FUNCTION public.apply_auto_mark(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_mark(uuid, timestamptz, integer) TO service_role;

/*
The worker acting for one person, through the very same functions the page
uses — so every rule (duplicates, allowance, who may do what) is the same.
Service role only.
*/
CREATE OR REPLACE FUNCTION public.apply_auto_enqueue(p_user uuid, p_items jsonb, p_email text, p_given jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb; q jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  r := public.apply_enqueue(p_items, NULL);
  q := public.apply_queue_set((r->'queue'->>'id')::uuid, 'running', NULL, jsonb_build_object('auto', true, 'given', coalesce(p_given, '{}'::jsonb)), p_email);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN jsonb_build_object('queue', q, 'applications', r->'applications');
END;
$$;
REVOKE ALL ON FUNCTION public.apply_auto_enqueue(uuid, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_enqueue(uuid, jsonb, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_auto_save(p_user uuid, p_id uuid, p_cv jsonb, p_letter jsonb, p_answers jsonb, p_concepts jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM public.apply_save(p_id, p_cv, p_letter, p_answers, p_concepts);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_auto_save(uuid, uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_save(uuid, uuid, jsonb, jsonb, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_auto_move(p_user uuid, p_id uuid, p_to text, p_detail jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.apply_transition(p_id, p_user, p_to, p_detail, false); $$;
REVOKE ALL ON FUNCTION public.apply_auto_move(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_move(uuid, uuid, text, jsonb) TO service_role;

/* For the page: is auto-apply on, and what has it done this month. */
CREATE OR REPLACE FUNCTION public.apply_auto_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'on', coalesce((SELECT (prefs->>'autoNew') = 'true' FROM public.application_preferences WHERE user_id = auth.uid()), false),
    'checkedAt', (SELECT checked_at FROM public.apply_auto_state WHERE user_id = auth.uid()),
    'thisMonth', (SELECT count(*) FROM public.job_applications a JOIN public.application_queues q ON q.id = a.queue_id
                  WHERE a.user_id = auth.uid() AND (q.plan->>'auto') = 'true' AND a.status = 'submitted' AND a.submitted_at >= date_trunc('month', now()))
  );
$$;
REVOKE ALL ON FUNCTION public.apply_auto_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_auto_status() TO authenticated;

/* For the scheduled worker's quick check: anyone due? */
CREATE OR REPLACE FUNCTION public.apply_auto_due_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT jsonb_array_length(public.apply_auto_due(50)); $$;
REVOKE ALL ON FUNCTION public.apply_auto_due_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_due_count() TO service_role;

NOTIFY pgrst, 'reload schema';
