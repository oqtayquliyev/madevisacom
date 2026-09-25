/*
# Listing requests (/submit-job) with bot protection

The quick "Post a job" form for people who don't have a company on MadeVisa
yet (signed in or not). The MadeVisa team replies by email, sets up the
company, and — for a sponsored job — sends the payment link after approval.

## listing_requests
One row per request: full name, email, company, optional job link, the plan
(sponsored_job $299 / free_job), and the terms the person accepted (with the
version and time). Only admins can read or change rows. Nobody can insert
directly — only through submit_listing_request().

## submit_listing_request(...)  — callable by anyone
Rejects bots and floods without a third-party captcha:
- Hidden "website" field (honeypot): filled → pretend success, store nothing.
- Time on page: the form must have been open at least 4 seconds.
- Proof of work: the browser must find a nonce so that
  sha256('<timestamp>:<nonce>') starts with "0000" (~65k hashes, 1–2 s for
  a person, expensive at scale for a bot). Each solution works once, and
  expires after 30 minutes.
- Rate limits: 3 per hour and 6 per day per network (IP, stored only as a
  salted hash), 3 per day per email, and 60 per hour in total.
- Same email + company still waiting → returns the existing request.
- Field checks: lengths, email format, http(s) links, accepted terms.
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.listing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 80),
  email text NOT NULL CHECK (length(email) <= 120 AND email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  company_name text NOT NULL CHECK (length(btrim(company_name)) BETWEEN 2 AND 120),
  job_url text CHECK (job_url IS NULL OR (length(job_url) <= 500 AND job_url ~* '^https?://\S+$')),
  plan text NOT NULL CHECK (plan IN ('sponsored_job', 'free_job')),
  price_usd int NOT NULL DEFAULT 0,
  terms_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_hash text,
  pow_hash text UNIQUE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed', 'spam')),
  admin_notes text CHECK (admin_notes IS NULL OR length(admin_notes) <= 2000)
);

CREATE INDEX IF NOT EXISTS listing_requests_created_idx ON public.listing_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS listing_requests_ip_idx ON public.listing_requests (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS listing_requests_email_idx ON public.listing_requests (lower(email), created_at);

ALTER TABLE public.listing_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listing_requests_admin_select" ON public.listing_requests;
CREATE POLICY "listing_requests_admin_select" ON public.listing_requests FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "listing_requests_admin_update" ON public.listing_requests;
CREATE POLICY "listing_requests_admin_update" ON public.listing_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "listing_requests_admin_delete" ON public.listing_requests;
CREATE POLICY "listing_requests_admin_delete" ON public.listing_requests FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.submit_listing_request(
  p_full_name text,
  p_email text,
  p_company text,
  p_job_url text,
  p_plan text,
  p_accept_terms boolean,
  p_accept_privacy boolean,
  p_website text,          -- honeypot: real people never see or fill it
  p_started_at bigint,     -- ms since epoch when the form opened
  p_pow_ts bigint,         -- ms since epoch used in the proof of work
  p_pow_nonce text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  now_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text;
  ip_h text;
  pow text;
  email_clean text := lower(btrim(coalesce(p_email, '')));
  name_clean text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  company_clean text := regexp_replace(btrim(coalesce(p_company, '')), '\s+', ' ', 'g');
  url_clean text := nullif(btrim(coalesce(p_job_url, '')), '');
  n int;
  existing uuid;
  new_id uuid;
BEGIN
  -- 1. Honeypot: look successful, store nothing.
  IF coalesce(p_website, '') <> '' THEN
    RETURN json_build_object('ok', true, 'id', null);
  END IF;

  -- 2. Time on page.
  IF p_started_at IS NULL OR now_ms - p_started_at < 4000 OR now_ms - p_started_at > 7200000 THEN
    RAISE EXCEPTION 'Please reload the page and try again.';
  END IF;

  -- 3. Proof of work (single use, 30 minutes).
  IF p_pow_ts IS NULL OR p_pow_nonce IS NULL OR length(p_pow_nonce) > 32
     OR now_ms - p_pow_ts > 1800000 OR p_pow_ts - now_ms > 120000 THEN
    RAISE EXCEPTION 'Verification expired. Please reload the page and try again.';
  END IF;
  pow := encode(digest(p_pow_ts::text || ':' || p_pow_nonce, 'sha256'), 'hex');
  IF left(pow, 4) <> '0000' THEN
    RAISE EXCEPTION 'Verification failed. Please reload the page and try again.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.listing_requests WHERE pow_hash = pow) THEN
    RAISE EXCEPTION 'This form was already sent. Please reload the page to send another request.';
  END IF;

  -- 4. Fields.
  IF length(name_clean) < 2 OR length(name_clean) > 80 THEN RAISE EXCEPTION 'Please enter your full name.'; END IF;
  IF length(email_clean) > 120 OR email_clean !~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Please enter a valid email address.'; END IF;
  IF length(company_clean) < 2 OR length(company_clean) > 120 THEN RAISE EXCEPTION 'Please enter your company name.'; END IF;
  IF url_clean IS NOT NULL AND (length(url_clean) > 500 OR url_clean !~* '^https?://\S+$') THEN
    RAISE EXCEPTION 'The job link must start with http:// or https://';
  END IF;
  IF p_plan NOT IN ('sponsored_job', 'free_job') THEN RAISE EXCEPTION 'Please choose a plan.'; END IF;
  IF NOT coalesce(p_accept_privacy, false) THEN RAISE EXCEPTION 'Please accept the privacy notice.'; END IF;
  IF p_plan = 'sponsored_job' AND NOT coalesce(p_accept_terms, false) THEN
    RAISE EXCEPTION 'Please accept the sponsored listing terms.';
  END IF;

  -- 5. Rate limits.
  ip := coalesce(headers->>'cf-connecting-ip', headers->>'x-real-ip', btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)));
  ip_h := CASE WHEN coalesce(ip, '') = '' THEN NULL ELSE encode(digest('mv-listing-requests:' || ip, 'sha256'), 'hex') END;

  SELECT count(*) INTO n FROM public.listing_requests WHERE created_at > now() - interval '1 hour';
  IF n >= 60 THEN RAISE EXCEPTION 'We are receiving a lot of requests right now. Please try again in an hour, or email hello@madevisa.com.'; END IF;

  IF ip_h IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.listing_requests WHERE ip_hash = ip_h AND created_at > now() - interval '1 hour';
    IF n >= 3 THEN RAISE EXCEPTION 'Too many requests from your network. Please try again later.'; END IF;
    SELECT count(*) INTO n FROM public.listing_requests WHERE ip_hash = ip_h AND created_at > now() - interval '24 hours';
    IF n >= 6 THEN RAISE EXCEPTION 'Too many requests from your network today. Please try again tomorrow.'; END IF;
  END IF;

  SELECT id INTO existing FROM public.listing_requests
    WHERE lower(email) = email_clean AND lower(company_name) = lower(company_clean) AND status = 'new'
    ORDER BY created_at DESC LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'id', existing, 'duplicate', true);
  END IF;

  SELECT count(*) INTO n FROM public.listing_requests WHERE lower(email) = email_clean AND created_at > now() - interval '24 hours';
  IF n >= 3 THEN RAISE EXCEPTION 'You have already sent 3 requests today. We will be in touch soon.'; END IF;

  INSERT INTO public.listing_requests (full_name, email, company_name, job_url, plan, price_usd, terms_version, user_id, ip_hash, pow_hash)
  VALUES (
    name_clean, email_clean, company_clean, url_clean, p_plan,
    CASE WHEN p_plan = 'sponsored_job' THEN 299 ELSE 0 END,
    'sponsored-listing-terms-2026-09',
    auth.uid(), ip_h, pow
  )
  RETURNING id INTO new_id;

  RETURN json_build_object('ok', true, 'id', new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_listing_request(text, text, text, text, text, boolean, boolean, text, bigint, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_listing_request(text, text, text, text, text, boolean, boolean, text, bigint, bigint, text) TO anon, authenticated;
