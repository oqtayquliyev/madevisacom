/*
# Scheduled syncs for import sources

Adds `sync_interval_hours` to import_sources (NULL or 0 = manual only).
The admin panel's Import center uses it to run due syncs automatically
while an admin has the panel open.

Also adds an index that makes the per-company job counts and the
"link older jobs" step fast.

Safe to run any time: adds a nullable column and an index, touches no data.
*/

ALTER TABLE public.import_sources
  ADD COLUMN IF NOT EXISTS sync_interval_hours integer;

ALTER TABLE public.import_sources DROP CONSTRAINT IF EXISTS import_sources_sync_interval_check;
ALTER TABLE public.import_sources
  ADD CONSTRAINT import_sources_sync_interval_check CHECK (sync_interval_hours IS NULL OR sync_interval_hours BETWEEN 0 AND 720);

CREATE INDEX IF NOT EXISTS sponsored_jobs_publisher_origin_source_idx
  ON public.sponsored_jobs (publisher_id, origin, import_source_id);
