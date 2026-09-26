-- Imported companies (no owner account) that have published jobs but were
-- never marked verified. Visitors can only read verified companies, so
-- their job pages showed "Verified sponsor" instead of the company name
-- (e.g. Okta). Companies an admin rejected or suspended are left alone.
UPDATE public.program_publishers p
SET verification_status = 'verified'
WHERE p.owner_id IS NULL
  AND p.verification_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.sponsored_jobs j
    WHERE j.publisher_id = p.id AND j.status = 'published'
  );
