/*
# Auto Apply: "Apply now" and "Apply all"
Run AFTER 20261211090000_apply_auto_prefer_no_login.sql. Safe to run more than once.

A ready application can sit in a batch that was paused or stopped, or wait
for a retry time. "Apply now" (one) and "Apply all" (every ready one) send
them to MadeVisa's application service straight away. The month's allowance
still applies: a batch paused because it ran out stays paused.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.apply_send_now(p_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  n integer;
  left_ integer;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'signed_out'); END IF;
  left_ := greatest(0, public.apply_limit(me) - public.apply_used(me));
  IF left_ < 1 THEN RETURN jsonb_build_object('ok', false, 'code', 'allowance', 'left', 0); END IF;

  -- No waiting for a retry time.
  UPDATE public.job_applications SET next_try_at = NULL, updated_at = now()
   WHERE user_id = me AND status = 'ready' AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Their batches run again (the person pressing the button is the confirmation).
  UPDATE public.application_queues q
     SET state = 'running', pause_reason = NULL, finished_at = NULL, confirmed_at = coalesce(q.confirmed_at, now()), updated_at = now()
   WHERE q.user_id = me
     AND q.state IN ('running', 'paused', 'stopped', 'done')
     AND EXISTS (SELECT 1 FROM public.job_applications a WHERE a.queue_id = q.id AND a.status = 'ready' AND (p_ids IS NULL OR a.id = ANY (p_ids)));

  RETURN jsonb_build_object('ok', true, 'ready', n, 'left', left_, 'online', public.apply_worker_online());
END;
$$;
REVOKE ALL ON FUNCTION public.apply_send_now(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_send_now(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
