/*
  Restructures job/program publishing per the new spec:
  - category becomes a constrained list (was free text), separate
    lists for jobs vs programs
  - status expands from 3 states to 8, keeping the existing 3 string
    values ('pending', 'published', 'rejected') unchanged so none of
    the existing queries/UI break — only new values are added
  - salary/cost move from a single free-text field to a status enum
    (disclosed/not_disclosed/volunteer/negotiable, or
    free/fully_funded/cost_available/cost_not_disclosed/
    contact_provider) plus proper numeric fields, so numbers can
    never end up in a text field
  - adds the extra category-specific and admin-only fields the new
    forms need

  Existing rows: any category value that doesn't match the new list
  is normalized to 'Other' before the constraint is added, so this is
  safe to run even with existing data.
*/

-- 1. Normalize existing category values before constraining them.
UPDATE public.programs
SET category = 'Other'
WHERE category NOT IN (
  'Scholarship', 'University / Education', 'Language course', 'Exchange program',
  'Government program', 'Immigration / Visa program', 'Relocation program',
  'Business / Investment program', 'Travel program', 'Internship / Training',
  'Au pair', 'Volunteer program', 'Housing / Accommodation', 'Other'
);

UPDATE public.sponsored_jobs
SET category = 'Other'
WHERE category NOT IN (
  'Full time', 'Part time', 'Internship', 'Seasonal work', 'Contract / Freelance',
  'Volunteer', 'Apprenticeship', 'Sponsored job', 'Other'
);

-- 2. Replace the category constraints.
ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_category_check;
ALTER TABLE public.programs ADD CONSTRAINT programs_category_check
  CHECK (category IN (
    'Scholarship', 'University / Education', 'Language course', 'Exchange program',
    'Government program', 'Immigration / Visa program', 'Relocation program',
    'Business / Investment program', 'Travel program', 'Internship / Training',
    'Au pair', 'Volunteer program', 'Housing / Accommodation', 'Other'
  ));

ALTER TABLE public.sponsored_jobs DROP CONSTRAINT IF EXISTS sponsored_jobs_category_check;
ALTER TABLE public.sponsored_jobs ADD CONSTRAINT sponsored_jobs_category_check
  CHECK (category IN (
    'Full time', 'Part time', 'Internship', 'Seasonal work', 'Contract / Freelance',
    'Volunteer', 'Apprenticeship', 'Sponsored job', 'Other'
  ));

-- 3. Expand status to 8 states. The 3 existing values are kept
-- unchanged so no existing code/query needs to change.
ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_status_check;
ALTER TABLE public.programs ADD CONSTRAINT programs_status_check
  CHECK (status IN (
    'draft', 'pending', 'needs_information', 'under_review',
    'verified', 'published', 'rejected', 'expired'
  ));

ALTER TABLE public.sponsored_jobs DROP CONSTRAINT IF EXISTS sponsored_jobs_status_check;
ALTER TABLE public.sponsored_jobs ADD CONSTRAINT sponsored_jobs_status_check
  CHECK (status IN (
    'draft', 'pending', 'needs_information', 'under_review',
    'verified', 'published', 'rejected', 'expired'
  ));

-- 4. Program cost/funding: status enum + numeric fields, so a free
-- program is never forced to carry a fake "$0".
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'cost_not_disclosed'
    CHECK (cost_status IN ('free', 'fully_funded', 'cost_available', 'cost_not_disclosed', 'contact_provider')),
  ADD COLUMN IF NOT EXISTS cost_amount_min numeric CHECK (cost_amount_min IS NULL OR cost_amount_min >= 0),
  ADD COLUMN IF NOT EXISTS cost_amount_max numeric CHECK (cost_amount_max IS NULL OR cost_amount_max >= 0),
  ADD COLUMN IF NOT EXISTS cost_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS duration_text text,
  ADD COLUMN IF NOT EXISTS eligibility_notes text,
  ADD COLUMN IF NOT EXISTS benefits text,
  ADD COLUMN IF NOT EXISTS application_url text,
  -- Admin-only — never selected by public-facing queries.
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS source_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_info_message text;

-- 5. Job salary: same pattern as program cost.
ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS salary_status text NOT NULL DEFAULT 'not_disclosed'
    CHECK (salary_status IN ('disclosed', 'not_disclosed', 'volunteer', 'negotiable')),
  ADD COLUMN IF NOT EXISTS salary_min numeric CHECK (salary_min IS NULL OR salary_min >= 0),
  ADD COLUMN IF NOT EXISTS salary_max numeric CHECK (salary_max IS NULL OR salary_max >= 0),
  ADD COLUMN IF NOT EXISTS salary_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS salary_period text NOT NULL DEFAULT 'year'
    CHECK (salary_period IN ('hour', 'day', 'week', 'month', 'year')),
  ADD COLUMN IF NOT EXISTS visa_sponsorship boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS languages text[],
  ADD COLUMN IF NOT EXISTS application_deadline date,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS benefits text,
  ADD COLUMN IF NOT EXISTS application_url text,
  -- Admin-only.
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS source_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_info_message text;

-- 6. Program application dates were named applications_open_at /
-- applications_close_at already — add a matching deadline alias-free
-- column isn't needed there, but programs also gained a "duration"
-- concept above for things like exchange/travel programs.

-- 7. Backfill: existing compensation_text / funding_text rows become
-- "disclosed" / "cost_available" so nothing that already had a real
-- value silently reverts to "not disclosed".
UPDATE public.sponsored_jobs
SET salary_status = 'disclosed'
WHERE compensation_text IS NOT NULL AND compensation_text <> '' AND salary_status = 'not_disclosed';

UPDATE public.programs
SET cost_status = 'cost_available'
WHERE funding_text IS NOT NULL AND funding_text <> '' AND cost_status = 'cost_not_disclosed';
