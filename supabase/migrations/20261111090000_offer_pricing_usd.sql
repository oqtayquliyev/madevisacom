/*
# Sponsorship document pricing: $15 each, $20 sign-up credit, Pro = 10 a month
Run AFTER 20261110090000_sponsor_offer_activity.sql. Safe to run more than once.

- Every document costs $15 of account credit (hiring_briefs.cost_usd).
- Every account starts with $20 credit (enough for one document).
- Top-ups: brief_credit_grants.amount_usd (admin activates "Document credit"
  requests with the number of documents paid for).
- Pro: 10 documents per calendar month at no cost (paid_with = 'pro');
  after that, Pro members pay from credit too.
- Documents made before this migration are 'legacy' and cost $0, so every
  existing account starts fresh with the $20 credit.
*/

SET lock_timeout = '5s';

ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS cost_usd numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.hiring_briefs ADD COLUMN IF NOT EXISTS paid_with text NOT NULL DEFAULT 'legacy';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hiring_briefs_paid_with_check') THEN
    ALTER TABLE public.hiring_briefs ADD CONSTRAINT hiring_briefs_paid_with_check CHECK (paid_with IN ('legacy', 'credit', 'pro'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS hiring_briefs_user_month_idx ON public.hiring_briefs (user_id, created_at) WHERE paid_with = 'pro';

ALTER TABLE public.brief_credit_grants ADD COLUMN IF NOT EXISTS amount_usd numeric(10,2);
-- Earlier packs were counted in offers; each is worth $15 now.
UPDATE public.brief_credit_grants SET amount_usd = credits * 15 WHERE amount_usd IS NULL;

CREATE OR REPLACE FUNCTION public.brief_credits_for(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  price constant numeric := 15;
  signup constant numeric := 20;
  quota constant integer := 10;
  granted numeric;
  spent numeric;
  used integer;
  pro boolean := public.is_pro(p_user);
  pro_used integer := 0;
  balance numeric;
  pro_left integer;
BEGIN
  SELECT coalesce(sum(coalesce(amount_usd, credits * price)), 0) INTO granted FROM public.brief_credit_grants WHERE user_id = p_user;
  SELECT coalesce(sum(cost_usd), 0), count(*) INTO spent, used FROM public.hiring_briefs WHERE user_id = p_user;
  IF pro THEN
    SELECT count(*) INTO pro_used FROM public.hiring_briefs
    WHERE user_id = p_user AND paid_with = 'pro' AND created_at >= date_trunc('month', now());
  END IF;
  balance := greatest(0, signup + granted - spent);
  pro_left := CASE WHEN pro THEN greatest(0, quota - pro_used) ELSE 0 END;
  RETURN jsonb_build_object(
    'balance', balance,
    'price', price,
    'granted', granted,
    'spent', spent,
    'used', used,
    'pro', pro,
    'pro_left', pro_left,
    'left', floor(balance / price)::int + pro_left
  );
END;
$$;
REVOKE ALL ON FUNCTION public.brief_credits_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hiring_briefs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- $15 a document: from the Pro monthly allowance first, then credit.
    c := public.brief_credits_for(NEW.user_id);
    IF (c->>'pro')::boolean AND (c->>'pro_left')::int > 0 THEN
      NEW.paid_with := 'pro';
      NEW.cost_usd := 0;
    ELSIF (c->>'balance')::numeric >= 15 THEN
      NEW.paid_with := 'credit';
      NEW.cost_usd := 15;
    ELSE
      RAISE EXCEPTION 'A new sponsorship document costs $15 and your credit is $%. Top up on the Pricing page.', (c->>'balance')
        USING ERRCODE = 'P0001';
    END IF;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
  ELSE
    IF NOT public.is_admin() THEN
      NEW.view_count := OLD.view_count;
      NEW.first_viewed_at := OLD.first_viewed_at;
      NEW.last_viewed_at := OLD.last_viewed_at;
      NEW.share_id := OLD.share_id;
      NEW.user_id := OLD.user_id;
      NEW.job_id := OLD.job_id;
      NEW.route_id := OLD.route_id;
      NEW.country_code := OLD.country_code;
      NEW.created_at := OLD.created_at;
      NEW.cost_usd := OLD.cost_usd;
      NEW.paid_with := OLD.paid_with;
    END IF;
    IF NEW.status = 'sent' AND OLD.status = 'created' AND NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;
    IF NEW.status IN ('replied', 'interview', 'offer', 'declined') AND NEW.responded_at IS NULL THEN
      NEW.responded_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hiring_briefs_guard ON public.hiring_briefs;
CREATE TRIGGER hiring_briefs_guard
  BEFORE INSERT OR UPDATE ON public.hiring_briefs
  FOR EACH ROW EXECUTE FUNCTION public.hiring_briefs_guard();

CREATE OR REPLACE FUNCTION public.activate_plan(p_request uuid, p_months integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.plan_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF r.user_id IS NOT NULL AND r.plan IN ('pro', 'relocation') THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, current_period_end, note)
    VALUES (r.user_id, r.plan, 'active', now(), now() + make_interval(months => greatest(p_months, 1)), 'Request ' || r.id)
    ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, status = 'active',
      current_period_end = greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + make_interval(months => greatest(p_months, 1)),
      note = excluded.note, updated_at = now();
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'plan_active', 'Your MadeVisa Pro is active',
            'Pro insights and job alerts are unlocked. Thank you for supporting MadeVisa!', '/jobs');
  ELSIF r.user_id IS NOT NULL AND r.plan = 'brief_credits' THEN
    -- p_months = documents paid for, $15 each.
    INSERT INTO public.brief_credit_grants (user_id, credits, amount_usd, reason)
    VALUES (r.user_id, greatest(p_months, 1), 15 * greatest(p_months, 1), 'Request ' || r.id);
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'credits_added', '$' || (15 * greatest(p_months, 1))::text || ' credit added',
            'That''s ' || greatest(p_months, 1)::text || ' sponsorship document' || CASE WHEN p_months > 1 THEN 's' ELSE '' END || '. Open a job and press "Sponsorship offer".',
            '/offers');
  END IF;
  UPDATE public.plan_requests SET status = 'active', handled_at = now() WHERE id = p_request;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plan(uuid, integer) TO authenticated;

-- Admin: credit sold in dollars, how each document was paid.
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
      'paid_with', b.paid_with,
      'cost_usd', b.cost_usd,
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
    'credits_sold', (SELECT coalesce(sum(amount_usd), 0) FROM public.brief_credit_grants WHERE amount_usd > 0)
  ) INTO totals;

  RETURN jsonb_build_object('offers', offers, 'drafts', drafts, 'totals', totals);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_offer_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_activity(integer) TO authenticated;
