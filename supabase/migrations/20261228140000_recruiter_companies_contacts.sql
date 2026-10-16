/*
  /network (Recruiters): every company MadeVisa has a contact email for — not only those with sponsored jobs.

  Emails come from three places:
  - the company's own contact address (program_publishers.contact_email),
  - addresses printed in its job ads (job_contacts),
  - employer contacts in Outreach (email_contacts, audience 'employer') that are still subscribed —
    unsubscribed, bounced and complained addresses are never shown.
  Outreach contacts are matched to a MadeVisa company by email domain = website domain, or by the same
  company name; the rest are listed on their own (name from the contact's company, else the domain).
  MadeVisa's own and example addresses, and free-mail addresses without a company name, are left out.
*/
CREATE OR REPLACE FUNCTION public.recruiter_companies()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH free_mail AS (
    SELECT unnest(ARRAY['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com',
      'mail.ru', 'yandex.ru', 'gmx.de', 'web.de', 'proton.me', 'protonmail.com', 'msn.com', 'me.com']) AS d
  ),
  live AS (
    SELECT s.publisher_id,
      count(*)::int AS jobs,
      count(*) FILTER (WHERE s.visa_sponsorship OR s.visa_status = 'offered')::int AS sponsored
    FROM public.sponsored_jobs s
    WHERE s.status = 'published' AND NOT coalesce(s.awaiting_release, false)
      AND (s.expires_at IS NULL OR s.expires_at > now()) AND s.publisher_id IS NOT NULL
    GROUP BY s.publisher_id
  ),
  pubs AS (
    SELECT p.id, p.name, p.logo_url, p.website, p.country_id,
      nullif(lower(regexp_replace(coalesce(p.website, ''), '^(https?://)?(www\.)?([^/:?#]+).*$', '\3')), '') AS domain,
      lower(regexp_replace(p.name, '[^[:alnum:]]+', '', 'g')) AS nkey
    FROM public.program_publishers p
    WHERE p.verification_status = 'verified'
  ),
  contacts AS (
    SELECT lower(btrim(c.email)) AS email, nullif(btrim(c.company), '') AS company, nullif(btrim(c.country), '') AS country,
      split_part(lower(btrim(c.email)), '@', 2) AS domain
    FROM public.email_contacts c
    WHERE c.audience = 'employer' AND c.status = 'subscribed'
  ),
  -- Each Outreach contact matched to a MadeVisa company where possible (plain joins, so it stays fast):
  -- same domain, then one level up (jobs.acme.de → acme.de), then the same company name.
  candidates AS (
    SELECT c.email, p.id, 1 AS pri FROM contacts c JOIN pubs p ON p.domain = c.domain
    UNION ALL
    SELECT c.email, p.id, 2 FROM contacts c JOIN pubs p ON p.domain = regexp_replace(c.domain, '^[^.]+\.', '')
    UNION ALL
    SELECT c.email, p.id, 3 FROM contacts c JOIN pubs p ON c.company IS NOT NULL AND p.nkey = lower(regexp_replace(c.company, '[^[:alnum:]]+', '', 'g'))
  ),
  best AS (SELECT DISTINCT ON (email) email, id FROM candidates ORDER BY email, pri, id),
  matched AS (
    SELECT c.*, b.id AS publisher_id FROM contacts c LEFT JOIN best b ON b.email = c.email
  ),
  raw AS (
    -- key: the publisher id, or for unmatched contacts the company name (else the email domain)
    SELECT p.id::text AS ckey, lower(btrim(p.contact_email)) AS email, 0 AS pri FROM public.program_publishers p JOIN pubs ON pubs.id = p.id
    UNION ALL
    SELECT s.publisher_id::text, lower(btrim(jc.email)), 1
    FROM public.job_contacts jc
    JOIN public.sponsored_jobs s ON s.id = jc.job_id
    WHERE s.status = 'published' AND (s.expires_at IS NULL OR s.expires_at > now()) AND s.publisher_id IS NOT NULL
    UNION ALL
    SELECT coalesce(m.publisher_id::text, 'c:' || coalesce(lower(regexp_replace(m.company, '[^[:alnum:]]+', '', 'g')), m.domain)), m.email, 2
    FROM matched m
    WHERE m.publisher_id IS NOT NULL OR m.company IS NOT NULL OR m.domain NOT IN (SELECT d FROM free_mail)
  ),
  emails AS (
    SELECT ckey, (array_agg(email ORDER BY pri, email))[1:3] AS list, count(*)::int AS n
    FROM (SELECT DISTINCT ON (ckey, email) ckey, email, pri FROM raw
          WHERE email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' AND email !~ '@(madevisa\.com|example\.com|example\.org)$'
          ORDER BY ckey, email, pri) d
    GROUP BY ckey
  ),
  -- Unmatched Outreach companies: a display name and country.
  loose AS (
    SELECT DISTINCT ON (k) k AS ckey,
      coalesce(m.company, initcap(split_part(m.domain, '.', 1))) AS name,
      m.domain, m.country
    FROM (SELECT *, 'c:' || coalesce(lower(regexp_replace(company, '[^[:alnum:]]+', '', 'g')), domain) AS k FROM matched WHERE publisher_id IS NULL) m
    ORDER BY k, (m.company IS NULL), m.email
  ),
  cards AS (
    SELECT p.id::text AS ckey, p.id AS publisher_id, p.name, p.logo_url, p.website, co.name AS country, co.iso_code AS country_code,
      coalesce(l.jobs, 0) AS jobs, coalesce(l.sponsored, 0) AS sponsored
    FROM pubs p
    LEFT JOIN live l ON l.publisher_id = p.id
    LEFT JOIN public.countries co ON co.id = p.country_id
    UNION ALL
    SELECT lo.ckey, NULL::uuid, lo.name, NULL, 'https://' || lo.domain,
      coalesce((SELECT name FROM public.countries WHERE lower(name) = lower(lo.country) OR upper(iso_code) = upper(lo.country) LIMIT 1), lo.country),
      (SELECT iso_code FROM public.countries WHERE lower(name) = lower(lo.country) OR upper(iso_code) = upper(lo.country) LIMIT 1),
      0, 0
    FROM loose lo
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.ckey, 'publisher_id', c.publisher_id, 'name', c.name, 'logo_url', c.logo_url, 'website', c.website,
      'country', c.country, 'country_code', c.country_code,
      'jobs', c.jobs, 'sponsored', c.sponsored, 'countries', '[]'::jsonb,
      'emails', to_jsonb(e.list), 'email_count', e.n)
    ORDER BY c.sponsored DESC, c.jobs DESC, c.name), '[]'::jsonb)
  FROM cards c
  JOIN emails e ON e.ckey = c.ckey;
$$;
REVOKE ALL ON FUNCTION public.recruiter_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recruiter_companies() TO anon, authenticated;

CREATE INDEX IF NOT EXISTS email_contacts_employer_idx ON public.email_contacts (audience, status) WHERE audience = 'employer';

NOTIFY pgrst, 'reload schema';
