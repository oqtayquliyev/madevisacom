-- Fast "which jobs still need details detected?" lookups.
-- Checking facts->>'v' made Postgres unpack every job's stored facts (they
-- include a cleaned copy of the description) → statement timeouts on 50k+
-- jobs. A small column kept in sync by Postgres answers it instantly.
ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS facts_v smallint GENERATED ALWAYS AS (((facts ->> 'v'))::smallint) STORED;

CREATE INDEX IF NOT EXISTS sponsored_jobs_facts_v_id_idx ON public.sponsored_jobs (facts_v, id);
