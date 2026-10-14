/* Employer pricing has its own page now: /pricing/employers (job seekers' plans stay on /pricing).
   The second employer email links there. As with every template change, only a template still as
   MadeVisa wrote it is updated; an edited one is kept and Admin → Templates offers the new version.
   Old /pricing#employers links keep working: the page sends them on. */
UPDATE public.email_template_library
SET replaces = replaces || public.mv_template_hash(subject, preheader, eyebrow, headline, body, cta_label, cta_url),
    cta_url = 'https://madevisa.com/pricing/employers',
    version = version + 1,
    updated_at = now()
WHERE key = 'auto_employer_2' AND cta_url <> 'https://madevisa.com/pricing/employers';

DO $do$
DECLARE r jsonb := public.mv_template_library_sync();
BEGIN
  RAISE NOTICE 'Templates: %', r;
END $do$;

NOTIFY pgrst, 'reload schema';
