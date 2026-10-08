/*
# Auto Apply: tidy up what the old version left behind
Run AFTER 20261209090000_apply_auto_new_jobs.sql. Safe to run more than once.

Two things from before the batch update (20261205090000):
1. The old version counted an application against the month as soon as it was
   PREPARED ("ready to send"). Now only a SUBMITTED application counts. Those
   old counts are given back, so people aren't told "this month's applications
   are used" for applications that were never sent.
2. Batches the old version started and never finished (still "running" or
   "paused", never confirmed the new way) are closed. Their unsent
   applications become "Skipped — prepared by the old version"; pressing
   "Apply" on those jobs again puts them into a new batch.
*/

SET lock_timeout = '5s';

-- 1. Only submitted applications count against the month.
UPDATE public.application_credits c
   SET state = 'released', updated_at = now()
  FROM public.job_applications a
 WHERE a.id = c.application_id
   AND c.state IN ('used', 'held')
   AND a.status NOT IN ('submitted', 'submitting');

-- 2. Old, unfinished batches.
UPDATE public.job_applications a
   SET status = 'skipped', reason = 'Prepared by the earlier version of Auto Apply and never sent. Apply again to let MadeVisa submit it.', reason_code = 'old_batch', updated_at = now()
  FROM public.application_queues q
 WHERE q.id = a.queue_id
   AND q.confirmed_at IS NULL
   AND q.state IN ('running', 'paused')
   AND a.status IN ('queued', 'analyzing', 'preparing');
UPDATE public.application_queues
   SET state = 'stopped', pause_reason = NULL, finished_at = coalesce(finished_at, now()), updated_at = now()
 WHERE confirmed_at IS NULL AND state IN ('running', 'paused');

NOTIFY pgrst, 'reload schema';
