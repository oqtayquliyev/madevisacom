/*
# Auto Apply: attach the CV file the person uploaded
Run AFTER 20261206090000_apply_worker_schedule.sql. Safe to run more than once.

Until now the worker attached a Word file made from the CV's text (the
tailored version). Now it attaches the person's own file — the PDF or Word
document they uploaded on /cv-match, exactly as it is. The tailored version is
still prepared and kept with the application (the person can download it);
it is attached only when there is no original file (a pasted CV), or when
you choose it for everyone:

  update public.apply_settings set cv_file = 'tailored';   -- back to the Word version
  update public.apply_settings set cv_file = 'original';   -- the person's own file (default)
*/

SET lock_timeout = '5s';

ALTER TABLE public.apply_settings ADD COLUMN IF NOT EXISTS cv_file text NOT NULL DEFAULT 'original';
DO $$ BEGIN
  ALTER TABLE public.apply_settings ADD CONSTRAINT apply_settings_cv_file_check CHECK (cv_file IN ('original', 'tailored'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Which file went out with each application: 'original' or 'tailored'.
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS cv_file text;

/* For the worker: the person's uploaded CV file, and whether to attach it (service role only). */
CREATE OR REPLACE FUNCTION public.apply_worker_original_cv(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'use', (SELECT cv_file = 'original' FROM public.apply_settings),
    'path', (SELECT nullif(storage_path, '') FROM public.user_cvs WHERE user_id = p_user),
    'name', (SELECT file_name FROM public.user_cvs WHERE user_id = p_user)
  );
$$;
REVOKE ALL ON FUNCTION public.apply_worker_original_cv(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_original_cv(uuid) TO service_role;

/* The worker's report also records which file was attached. */
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
    cv_path = coalesce(left(d->>'cvPath', 300), cv_path),
    cv_file = CASE WHEN d->>'cvFile' IN ('original', 'tailored') THEN d->>'cvFile' ELSE cv_file END
  WHERE id = a.id;
  r := public.apply_transition(a.id, a.user_id, p_to, d, true);
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_worker_report(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_worker_report(uuid, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
