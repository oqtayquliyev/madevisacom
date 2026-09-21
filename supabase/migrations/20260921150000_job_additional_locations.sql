/*
  Free-text list of additional office/location names beyond the job's
  primary country_id — e.g. a Greenhouse job with offices ["US",
  "Germany Locations", "Japan Locations"] gets these stored here for
  a "hiring in multiple countries" display, without trying to model
  a proper many-to-many country relationship for what's ultimately
  a cosmetic hint, not a hard filter.
*/

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS additional_locations text[];
