/*
# "Update all jobs" run history

One row per click on Admin → "Update all jobs": when it ran, how long it
took, and what it did (sources synced, jobs added/removed, job details
detected). Shown as "Last update" and the recent-runs list in the panel.
Admins only.
*/

CREATE TABLE IF NOT EXISTS public.job_update_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'stopped', 'failed')),
  sources_total int NOT NULL DEFAULT 0,
  sources_ok int NOT NULL DEFAULT 0,
  sources_failed int NOT NULL DEFAULT 0,
  jobs_fetched int NOT NULL DEFAULT 0,
  jobs_added int NOT NULL DEFAULT 0,
  jobs_removed int NOT NULL DEFAULT 0,
  details_checked int NOT NULL DEFAULT 0,
  details_filled int NOT NULL DEFAULT 0,
  live_before int,
  live_after int,
  error text CHECK (error IS NULL OR length(error) <= 2000),
  run_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS job_update_runs_started_idx ON public.job_update_runs (started_at DESC);

ALTER TABLE public.job_update_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_update_runs_admin_all" ON public.job_update_runs;
CREATE POLICY "job_update_runs_admin_all" ON public.job_update_runs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
