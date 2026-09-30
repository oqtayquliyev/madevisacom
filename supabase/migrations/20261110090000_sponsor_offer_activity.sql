/*
# Sponsor offer activity (Admin → Offers)
Run AFTER 20261109090000_sponsor_offers_and_credits.sql. Safe to run more than once.

- offer_drafts: who opened the offer builder for a job (created an offer or not).
- hiring_briefs.pdf_saves / company_pdf_saves: "Save as PDF" presses by the
  owner and by anyone else (usually the company).
- admin_offer_activity(): one call for the admin tab — offers with their
  creator, builder opens that didn't turn into an offer, and totals.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- PDF saves
-- ---------------------------------------------------------------------------
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS pdf_saves integer NOT NULL DEFAULT 0;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS company_pdf_saves integer NOT NULL DEFAULT 0;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS last_pdf_at timestamptz;

-- Only record_offer_pdf() (or an admin) can change the counters.
CREATE OR REPLACE FUNCTION public.hiring_briefs_pdf_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('madevisa.pdf', true), '') <> '1' AND NOT public.is_admin() THEN
    NEW.pdf_saves := OLD.pdf_saves;
    NEW.company_pdf_saves := OLD.company_pdf_saves;
    NEW.last_pdf_at := OLD.last_pdf_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hiring_briefs_pdf_guard ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_pdf_guard
  BEFORE UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_pdf_guard();

CREATE OR REPLACE FUNCTION public.record_offer_pdf(p_share_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('madevisa.pdf', '1', true);
  UPDATE public.hiring_briefs
  SET pdf_saves = pdf_saves + 1,
      company_pdf_saves = company_pdf_saves + CASE WHEN auth.uid() IS NULL OR user_id <> auth.uid() THEN 1 ELSE 0 END,
      last_pdf_at = now()
  WHERE share_id = p_share_id AND status <> 'withdrawn';
  PERFORM set_config('madevisa.pdf', '', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_offer_pdf(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Builder opens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_drafts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  opens integer NOT NULL DEFAULT 1,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS offer_drafts_last_idx ON public.offer_drafts (last_at DESC);

ALTER TABLE public.offer_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offer_drafts_admin_read" ON public.offer_drafts;
CREATE POLICY "offer_drafts_admin_read" ON public.offer_drafts FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
GRANT SELECT ON public.offer_drafts TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_offer_draft(p_job_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.offer_drafts (user_id, job_id)
  SELECT auth.uid(), p_job_id
  WHERE auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.sponsored_jobs WHERE id = p_job_id)
  ON CONFLICT (user_id, job_id) DO UPDATE
    SET opens = public.offer_drafts.opens + 1, last_at = now();
$$;
REVOKE ALL ON FUNCTION public.touch_offer_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_offer_draft(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_offer_activity(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  lim integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  offers jsonb;
  drafts jsonb;
  totals jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb) INTO offers FROM (
    SELECT jsonb_build_object(
      'share_id', b.share_id,
      'created_at', b.created_at,
      'job_id', b.job_id,
      'job_title', b.job_title,
      'company_name', b.company_name,
      'country_code', b.country_code,
      'route_id', b.route_id,
      'split', b.split,
      'status', b.status,
      'views', b.view_count,
      'pdf_saves', b.pdf_saves,
      'company_pdf_saves', b.company_pdf_saves,
      'user_id', b.user_id,
      'user_name', p.full_name,
      'user_email', p.email,
      'username', p.username,
      'credits', public.brief_credits_for(b.user_id)
    ) AS x
    FROM public.hiring_briefs b
    LEFT JOIN public.profiles p ON p.id = b.user_id
    ORDER BY b.created_at DESC
    LIMIT lim
  ) t;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'last_at') DESC), '[]'::jsonb) INTO drafts FROM (
    SELECT jsonb_build_object(
      'job_id', d.job_id,
      'job_title', j.title,
      'company_name', pub.name,
      'country_code', c.iso_code,
      'opens', d.opens,
      'first_at', d.first_at,
      'last_at', d.last_at,
      'user_id', d.user_id,
      'user_name', p.full_name,
      'user_email', p.email
    ) AS x
    FROM public.offer_drafts d
    LEFT JOIN public.sponsored_jobs j ON j.id = d.job_id
    LEFT JOIN public.program_publishers pub ON pub.id = j.publisher_id
    LEFT JOIN public.countries c ON c.id = j.country_id
    LEFT JOIN public.profiles p ON p.id = d.user_id
    WHERE NOT EXISTS (SELECT 1 FROM public.hiring_briefs b WHERE b.user_id = d.user_id AND b.job_id = d.job_id)
    ORDER BY d.last_at DESC
    LIMIT lim
  ) t;

  SELECT jsonb_build_object(
    'offers', (SELECT count(*) FROM public.hiring_briefs),
    'creators', (SELECT count(DISTINCT user_id) FROM public.hiring_briefs),
    'offers_7d', (SELECT count(*) FROM public.hiring_briefs WHERE created_at > now() - interval '7 days'),
    'builder_users', (SELECT count(DISTINCT user_id) FROM public.offer_drafts),
    'pdf_saves', (SELECT coalesce(sum(pdf_saves), 0) FROM public.hiring_briefs),
    'company_opens', (SELECT count(*) FROM public.hiring_briefs WHERE view_count > 0),
    'credits_sold', (SELECT coalesce(sum(credits), 0) FROM public.brief_credit_grants WHERE credits > 0)
  ) INTO totals;

  RETURN jsonb_build_object('offers', offers, 'drafts', drafts, 'totals', totals);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_offer_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_activity(integer) TO authenticated;
