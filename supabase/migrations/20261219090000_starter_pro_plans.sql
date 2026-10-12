/*
# Starter and Pro: two plans, one entitlement service
Run AFTER 20261218090000_email_finder_and_names.sql. Paste the whole file once
in the Supabase SQL Editor. Safe to run more than once. Deletes nothing:
existing subscriptions, Gumroad memberships, checkouts and events are kept.

## Plans (flat monthly prices in USD, the same in every country)
  Free     $0
  Starter  $2.99 / month   (new)
  Pro      $8.99 / month   (was one PPP-priced "MadeVisa Pro", $5–$19 / month or yearly)
Existing Pro members keep Pro and keep paying what they agreed to on Gumroad;
nothing about their membership changes. New checkouts sell only the two
monthly plans above, with no regional discount codes.

## Tables
  billing_plans        the plans, their price in cents, and the Gumroad product
                       each paid plan is sold as (set by Admin → Plans → Connect).
  plan_entitlements    what each plan may use, with its fair-use limit.
  saved_jobs           "Save job" (Free: 5, paid plans: no limit).
  gumroad_checkouts    + plan, source (which button started it).
  gumroad_subscriptions + plan, product_id, access_until (when this membership's
                       access ends; the resolver reads it).

## One resolver (every gate in the database goes through it)
  plan_tier(user)              'free' | 'starter' | 'pro' — the highest plan the
                               person has right now, from an admin-granted plan
                               (subscriptions) or any Gumroad membership whose
                               paid access hasn't run out.
  is_pro(user)                 = plan_tier(user) = 'pro'. Every existing Pro gate
                               (Auto Apply, the Auto Apply service, "Jobs for you"
                               email size, …) keeps meaning Pro.
  is_paid(user)                Starter or Pro.
  entitlement(user, feature)   { allowed, limit, period, plan }
  has_feature(user, feature) / feature_limit(user, feature)
  my_entitlements()            what the signed-in person has, for the app.
  billing_catalog()            public: the plans, prices and limits, for the
                               pricing and checkout pages.

## Gates moved from "Pro" to the feature they protect
  cv_check / cv_checks_today   full CV report        → Starter and Pro
  visa_sponsors_in             sponsorship insights  → Starter and Pro
  brief_credits_for + guard    documents a month     → Starter 10, Pro 50
  create_job_alert             active alerts         → Free 1, Starter 5, Pro 10
  job_alerts row policy        direct edits          → Starter and Pro
  activate_plan                admin activation      → Starter or Pro requests

## Gumroad
  One membership product per paid plan. The product a payment belongs to
  decides the plan (the checkout link only says which account it is for).
  A checkout is only prepared when the product's price on Gumroad equals the
  plan's price here, so the amount shown is the amount charged (before any
  tax Gumroad adds). The old Pro product (gumroad_settings.product_id) keeps
  being read for existing members.

Needs: 20261203090000_gumroad_checkout.sql, 20261126090000_cv_match_one_plan.sql,
20261122090000_free_job_alert_emails.sql, 20261107090000_plans_notifications.sql.
Deploy the gumroad function after running this (see GUMROAD-PLANS-UPDATE.md).
*/

SET lock_timeout = '5s';

-- ===========================================================================
-- 1. Plans and what they include
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id text PRIMARY KEY CHECK (id IN ('free', 'starter', 'pro')),
  name text NOT NULL,
  rank integer NOT NULL UNIQUE,
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval = 'monthly'),
  -- Integer minor units (cents).
  price_amount integer NOT NULL CHECK (price_amount >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  provider text CHECK (provider IS NULL OR provider = 'gumroad'),
  provider_product_id text,
  provider_product_url text,
  provider_product_name text,
  -- What Gumroad says the monthly price is (checked on Connect). A checkout is refused unless it equals price_amount.
  provider_price_amount integer,
  connected_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plans FROM anon, authenticated;

INSERT INTO public.billing_plans (id, name, rank, billing_interval, price_amount, currency, provider) VALUES
  ('free', 'Free', 0, NULL, 0, 'USD', NULL),
  ('starter', 'Starter', 1, 'monthly', 299, 'USD', 'gumroad'),
  ('pro', 'Pro', 2, 'monthly', 899, 'USD', 'gumroad')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  plan_id text NOT NULL REFERENCES public.billing_plans(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature ~ '^[a-z_]{2,40}$'),
  allowed boolean NOT NULL,
  -- NULL = no limit. A number = that many per period (NULL period = at any one time).
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit >= 0),
  period text CHECK (period IS NULL OR period IN ('day', 'month')),
  PRIMARY KEY (plan_id, feature)
);
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_entitlements FROM anon, authenticated;

-- Same numbers as supabase/functions/_shared/plans.ts (a test compares them).
INSERT INTO public.plan_entitlements (plan_id, feature, allowed, usage_limit, period) VALUES
  ('free',    'cv_missing_skills',     true,  3,    'day'),
  ('free',    'cv_full_report',        false, 0,    NULL),
  ('free',    'saved_jobs',            true,  5,    NULL),
  ('free',    'job_alerts',            true,  1,    NULL),
  ('free',    'sponsorship_insights',  false, 0,    NULL),
  ('free',    'sponsorship_documents', false, 0,    'month'),
  ('free',    'auto_apply',            false, 0,    'month'),
  ('starter', 'cv_missing_skills',     true,  NULL, NULL),
  ('starter', 'cv_full_report',        true,  NULL, NULL),
  ('starter', 'saved_jobs',            true,  NULL, NULL),
  ('starter', 'job_alerts',            true,  5,    NULL),
  ('starter', 'sponsorship_insights',  true,  NULL, NULL),
  ('starter', 'sponsorship_documents', true,  10,   'month'),
  ('starter', 'auto_apply',            false, 0,    'month'),
  ('pro',     'cv_missing_skills',     true,  NULL, NULL),
  ('pro',     'cv_full_report',        true,  NULL, NULL),
  ('pro',     'saved_jobs',            true,  NULL, NULL),
  ('pro',     'job_alerts',            true,  10,   NULL),
  ('pro',     'sponsorship_insights',  true,  NULL, NULL),
  ('pro',     'sponsorship_documents', true,  50,   'month'),
  ('pro',     'auto_apply',            true,  NULL, 'month')
ON CONFLICT (plan_id, feature) DO NOTHING;

-- ===========================================================================
-- 2. Gumroad records learn which plan they are
-- ===========================================================================
ALTER TABLE public.gumroad_checkouts ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'pro';
ALTER TABLE public.gumroad_checkouts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.gumroad_checkouts DROP CONSTRAINT IF EXISTS gumroad_checkouts_plan_check;
ALTER TABLE public.gumroad_checkouts ADD CONSTRAINT gumroad_checkouts_plan_check CHECK (plan IN ('starter', 'pro'));
ALTER TABLE public.gumroad_checkouts DROP CONSTRAINT IF EXISTS gumroad_checkouts_source_check;
ALTER TABLE public.gumroad_checkouts ADD CONSTRAINT gumroad_checkouts_source_check CHECK (source IS NULL OR source ~ '^[a-z0-9_]{1,40}$');

ALTER TABLE public.gumroad_subscriptions ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE public.gumroad_subscriptions ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.gumroad_subscriptions ADD COLUMN IF NOT EXISTS access_until timestamptz;
CREATE INDEX IF NOT EXISTS gumroad_subscriptions_access_idx ON public.gumroad_subscriptions (user_id, access_until DESC);

-- Existing memberships were all MadeVisa Pro. Their access ends where gumroad_apply put it.
UPDATE public.gumroad_subscriptions g SET
  plan = coalesce(g.plan, 'pro'),
  access_until = coalesce(g.access_until, CASE
    WHEN g.ended_at IS NOT NULL OR g.status NOT IN ('alive', 'pending_cancellation', 'pending_failure', 'payment_method_update_required')
      THEN least(coalesce(g.paid_until, g.updated_at), coalesce(g.ended_at, g.updated_at))
    WHEN g.status = 'pending_cancellation' AND g.cancel_at IS NOT NULL THEN g.cancel_at
    WHEN g.last_paid_at IS NULL THEN g.updated_at
    ELSE g.paid_until + interval '3 days' END)
WHERE g.plan IS NULL OR g.access_until IS NULL;

ALTER TABLE public.plan_requests DROP CONSTRAINT IF EXISTS plan_requests_plan_check;
ALTER TABLE public.plan_requests ADD CONSTRAINT plan_requests_plan_check
  CHECK (plan IN ('starter', 'pro', 'relocation', 'sponsored_job', 'featured_social', 'employer', 'hiring_brief', 'brief_credits'));

-- ===========================================================================
-- 3. The resolver
-- ===========================================================================
-- A stored plan name → one of the three plans. Everything sold before Starter existed was Pro.
CREATE OR REPLACE FUNCTION public.plan_of(p_plan text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE WHEN p_plan IS NULL OR p_plan = 'free' THEN 'free' WHEN p_plan = 'starter' THEN 'starter' ELSE 'pro' END $$;

CREATE OR REPLACE FUNCTION public.plan_rank(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT CASE public.plan_of(p_plan) WHEN 'pro' THEN 2 WHEN 'starter' THEN 1 ELSE 0 END $$;

-- Every source of paid access the person has right now.
CREATE OR REPLACE FUNCTION public.plan_access(p_user uuid)
RETURNS TABLE (plan text, rank integer, source text, until timestamptz, ref text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.plan_of(s.plan), public.plan_rank(s.plan), coalesce(s.provider, 'manual'), s.current_period_end, s.provider_ref
  FROM public.subscriptions s
  WHERE s.user_id = p_user AND s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now())
  UNION ALL
  SELECT public.plan_of(coalesce(g.plan, 'pro')), public.plan_rank(coalesce(g.plan, 'pro')), 'gumroad', g.access_until, g.subscription_id
  FROM public.gumroad_subscriptions g
  WHERE g.user_id = p_user AND g.access_until > now();
$$;
REVOKE ALL ON FUNCTION public.plan_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.plan_tier(p_user uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT a.plan FROM public.plan_access(p_user) a ORDER BY a.rank DESC LIMIT 1), 'free');
$$;
REVOKE ALL ON FUNCTION public.plan_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_tier(uuid) TO authenticated, service_role;

-- Pro means the Pro plan. Same signature and grants as before, so every caller keeps working.
CREATE OR REPLACE FUNCTION public.is_pro(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.plan_tier(p_user) = 'pro' $$;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_paid(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.plan_tier(p_user) <> 'free' $$;
REVOKE ALL ON FUNCTION public.is_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_paid(uuid) TO authenticated, service_role;

-- { allowed, limit, period, plan } for one feature. Unknown features are not allowed.
CREATE OR REPLACE FUNCTION public.entitlement(p_user uuid, p_feature text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (SELECT public.plan_tier(p_user) AS plan)
  SELECT coalesce(
    (SELECT jsonb_build_object('allowed', e.allowed, 'limit', CASE WHEN e.allowed THEN e.usage_limit ELSE 0 END, 'period', e.period, 'plan', t.plan)
     FROM public.plan_entitlements e WHERE e.plan_id = t.plan AND e.feature = p_feature),
    jsonb_build_object('allowed', false, 'limit', 0, 'period', NULL, 'plan', t.plan))
  FROM t;
$$;
REVOKE ALL ON FUNCTION public.entitlement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entitlement(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_feature(p_user uuid, p_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT (public.entitlement(p_user, p_feature)->>'allowed')::boolean $$;
REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;

-- NULL = no limit; 0 = not included.
CREATE OR REPLACE FUNCTION public.feature_limit(p_user uuid, p_feature text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT (public.entitlement(p_user, p_feature)->>'limit')::integer $$;
REVOKE ALL ON FUNCTION public.feature_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feature_limit(uuid, text) TO authenticated, service_role;

-- The plans, prices and limits, for anyone (pricing and checkout pages). No product ids or links.
CREATE OR REPLACE FUNCTION public.billing_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'card_payments', coalesce((SELECT enabled FROM public.gumroad_settings WHERE id), false),
    'plans', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'rank', b.rank, 'interval', b.billing_interval,
        'price_amount', b.price_amount, 'currency', b.currency,
        -- Can be bought by card right now: connected, Gumroad's price is this price, and card payments are on.
        'available', b.id <> 'free' AND b.is_active AND b.provider_product_id IS NOT NULL AND b.connected_at IS NOT NULL
                     AND b.provider_price_amount = b.price_amount
                     AND coalesce((SELECT enabled FROM public.gumroad_settings WHERE id), false),
        'features', coalesce((SELECT jsonb_object_agg(e.feature, jsonb_build_object('allowed', e.allowed, 'limit', CASE WHEN e.allowed THEN e.usage_limit ELSE 0 END, 'period', e.period))
                              FROM public.plan_entitlements e WHERE e.plan_id = b.id), '{}'::jsonb)
      ) ORDER BY b.rank) FROM public.billing_plans b WHERE b.is_active), '[]'::jsonb),
    'auto_apply', (SELECT jsonb_build_object('enabled', s.enabled, 'free_monthly', s.free_monthly, 'pro_monthly', s.pro_monthly) FROM public.apply_settings s LIMIT 1),
    'documents_per_week', 30
  );
$$;
REVOKE ALL ON FUNCTION public.billing_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_catalog() TO anon, authenticated, service_role;

-- What the signed-in person has: plan, billing state, features and usage. The app reads only this.
CREATE OR REPLACE FUNCTION public.my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  v_plan text;
  best record;
  g public.gumroad_subscriptions;
  s public.subscriptions;
  v_sub jsonb := NULL;
  v_last jsonb := NULL;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('signed_in', false, 'plan', 'free',
      'features', (SELECT jsonb_object_agg(e.feature, jsonb_build_object('allowed', e.allowed, 'limit', e.usage_limit, 'period', e.period)) FROM public.plan_entitlements e WHERE e.plan_id = 'free'));
  END IF;
  v_plan := public.plan_tier(me);
  SELECT a.* INTO best FROM public.plan_access(me) a ORDER BY a.rank DESC, a.until DESC NULLS FIRST LIMIT 1;

  IF FOUND AND best.source = 'gumroad' THEN
    SELECT * INTO g FROM public.gumroad_subscriptions WHERE subscription_id = best.ref;
    v_sub := jsonb_build_object(
      'plan', v_plan, 'status', 'active', 'current_period_end', g.access_until, 'provider', 'gumroad', 'provider_ref', g.subscription_id,
      'billing', g.recurrence, 'cancel_at_period_end', g.status = 'pending_cancellation',
      'provider_status', g.status, 'price_cents', g.price_cents, 'last_paid_at', g.last_paid_at,
      -- When the next charge is due: the paid period's end (Gumroad charges on the same day each period).
      'renews_at', CASE WHEN g.status = 'alive' THEN g.paid_until END,
      'payment_issue', g.status IN ('pending_failure', 'payment_method_update_required'));
  ELSIF FOUND THEN
    SELECT * INTO s FROM public.subscriptions WHERE user_id = me;
    v_sub := jsonb_build_object(
      'plan', v_plan, 'status', 'active', 'current_period_end', s.current_period_end, 'provider', s.provider, 'provider_ref', s.provider_ref,
      'billing', s.billing, 'cancel_at_period_end', s.cancel_at_period_end, 'provider_status', NULL, 'price_cents', NULL,
      'renews_at', NULL, 'payment_issue', false);
  ELSE
    -- No plan now: the latest one that ended, for "Your Pro ended on …".
    SELECT jsonb_build_object('plan', public.plan_of(coalesce(x.plan, 'pro')), 'ended_at', x.access_until, 'provider_status', x.status)
    INTO v_last FROM public.gumroad_subscriptions x WHERE x.user_id = me ORDER BY x.access_until DESC NULLS LAST, x.updated_at DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'signed_in', true,
    'plan', v_plan,
    'sub', v_sub,
    'last', v_last,
    -- Other memberships still running (e.g. Starter running out after switching to Pro): billed separately until they end.
    'others', coalesce((SELECT jsonb_agg(jsonb_build_object('plan', public.plan_of(x.plan), 'status', x.status, 'until', x.access_until, 'provider_ref', x.subscription_id) ORDER BY x.access_until DESC)
                        FROM public.gumroad_subscriptions x WHERE x.user_id = me AND x.access_until > now() AND x.subscription_id IS DISTINCT FROM (v_sub->>'provider_ref')), '[]'::jsonb),
    'features', (SELECT jsonb_object_agg(e.feature, jsonb_build_object('allowed', e.allowed, 'limit', CASE WHEN e.allowed THEN e.usage_limit ELSE 0 END, 'period', e.period))
                 FROM public.plan_entitlements e WHERE e.plan_id = v_plan),
    'usage', jsonb_build_object(
      'saved_jobs', (SELECT count(*) FROM public.saved_jobs WHERE user_id = me),
      'job_alerts', (SELECT count(*) FROM public.job_alerts WHERE user_id = me AND active),
      'documents_this_month', (SELECT count(*) FROM public.hiring_briefs WHERE user_id = me AND paid_with = 'pro' AND created_at >= date_trunc('month', now())),
      'cv_checks_today', (SELECT count(*) FROM public.cv_checks WHERE user_id = me AND unlocked AND unlocked_on = (now() AT TIME ZONE 'utc')::date))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_entitlements() TO authenticated;

-- ===========================================================================
-- 4. Saved jobs (Free: 5; Starter and Pro: no limit)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.saved_jobs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.sponsored_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS saved_jobs_user_idx ON public.saved_jobs (user_id, created_at DESC);
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved_jobs_own_read" ON public.saved_jobs;
CREATE POLICY "saved_jobs_own_read" ON public.saved_jobs FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "saved_jobs_own_delete" ON public.saved_jobs;
CREATE POLICY "saved_jobs_own_delete" ON public.saved_jobs FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
-- Adding goes through save_job(), which applies the plan's limit.
REVOKE ALL ON public.saved_jobs FROM anon, authenticated;
GRANT SELECT, DELETE ON public.saved_jobs TO authenticated;

CREATE OR REPLACE FUNCTION public.save_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  lim integer;
  n integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in to save jobs.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sponsored_jobs WHERE id = p_job AND status = 'published') THEN
    RAISE EXCEPTION 'That job is no longer listed.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.saved_jobs WHERE user_id = me AND job_id = p_job) THEN
    RETURN jsonb_build_object('saved', true, 'existing', true);
  END IF;
  -- One at a time per person, so two quick clicks can't both pass the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('saved_jobs:' || me::text, 0));
  lim := public.feature_limit(me, 'saved_jobs');
  SELECT count(*) INTO n FROM public.saved_jobs WHERE user_id = me;
  IF lim IS NOT NULL AND n >= lim THEN
    RAISE EXCEPTION 'You have saved % jobs, the most on the Free plan. Remove one, or save as many as you like with Starter.', lim USING ERRCODE = 'P0001', HINT = 'limit:saved_jobs';
  END IF;
  INSERT INTO public.saved_jobs (user_id, job_id) VALUES (me, p_job) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('saved', true, 'existing', false, 'count', n + 1, 'limit', lim);
END;
$$;
REVOKE ALL ON FUNCTION public.save_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unsave_job(p_job uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ DELETE FROM public.saved_jobs WHERE user_id = auth.uid() AND job_id = p_job $$;
REVOKE ALL ON FUNCTION public.unsave_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsave_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_saved_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id, 'title', j.title, 'company', p.name, 'logo', p.logo_url, 'city', j.city, 'country', c.name,
    'open', j.status = 'published' AND j.closed_at IS NULL AND (j.expires_at IS NULL OR j.expires_at > now()),
    'saved_at', sj.created_at) ORDER BY sj.created_at DESC), '[]'::jsonb)
  FROM public.saved_jobs sj
  JOIN public.sponsored_jobs j ON j.id = sj.job_id
  LEFT JOIN public.program_publishers p ON p.id = j.publisher_id
  LEFT JOIN public.countries c ON c.id = j.country_id
  WHERE sj.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_saved_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_saved_jobs() TO authenticated;

-- ===========================================================================
-- 5. Existing gates, now asking for the feature
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.cv_check(p_job text, p_score integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  today date := (now() AT TIME ZONE 'utc')::date;
  lim integer := public.cv_free_daily_checks();
  pro boolean;
  used integer;
  was boolean;
  is_open boolean;
  key text := left(btrim(coalesce(p_job, '')), 80);
  sc integer := greatest(0, least(100, coalesce(p_score, 0)));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF key = '' THEN RAISE EXCEPTION 'No job.' USING ERRCODE = 'P0001'; END IF;
  -- 'pro' in the answer means "has the full report" (Starter or Pro); the app reads it that way.
  pro := public.has_feature(me, 'cv_full_report');

  SELECT unlocked INTO was FROM public.cv_checks WHERE user_id = me AND job_key = key FOR UPDATE;
  SELECT count(*) INTO used FROM public.cv_checks WHERE user_id = me AND unlocked AND unlocked_on = today;

  IF was IS TRUE THEN
    is_open := true;
  ELSIF pro OR used < lim THEN
    is_open := true;
    IF NOT pro THEN used := used + 1; END IF;
  ELSE
    is_open := false;
  END IF;

  INSERT INTO public.cv_checks (user_id, job_key, score, unlocked, unlocked_on)
  VALUES (me, key, sc, is_open, CASE WHEN is_open AND NOT pro THEN today END)
  ON CONFLICT (user_id, job_key) DO UPDATE SET
    score = excluded.score,
    checks = public.cv_checks.checks + 1,
    unlocked = public.cv_checks.unlocked OR excluded.unlocked,
    unlocked_on = coalesce(public.cv_checks.unlocked_on, excluded.unlocked_on),
    updated_at = now();

  RETURN jsonb_build_object('unlocked', is_open, 'used', used, 'limit', lim, 'pro', pro, 'plan', public.plan_tier(me));
END;
$$;
REVOKE ALL ON FUNCTION public.cv_check(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cv_check(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.cv_checks_today()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'used', (SELECT count(*) FROM public.cv_checks WHERE user_id = auth.uid() AND unlocked AND unlocked_on = (now() AT TIME ZONE 'utc')::date),
    'limit', public.cv_free_daily_checks(),
    'pro', public.has_feature(auth.uid(), 'cv_full_report'),
    'plan', public.plan_tier(auth.uid()),
    'jobs', coalesce((SELECT jsonb_object_agg(job_key, jsonb_build_object('score', score, 'unlocked', unlocked))
                      FROM (SELECT job_key, score, unlocked FROM public.cv_checks WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 300) t), '{}'::jsonb)
  ) END;
$$;
REVOKE ALL ON FUNCTION public.cv_checks_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cv_checks_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.visa_sponsors_in(p_iso text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
DECLARE
  d jsonb;
BEGIN
  IF NOT (public.has_feature(auth.uid(), 'sponsorship_insights') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Part of Starter and Pro.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO d FROM (
    SELECT jsonb_build_object('id', p.id, 'name', p.name, 'logo', p.logo_url, 'jobs', count(*)) AS x
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    JOIN public.countries c ON c.id = s.country_id
    WHERE c.iso_code = upper(p_iso) AND (s.visa_status = 'offered' OR s.visa_sponsorship)
      AND s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
    GROUP BY p.id, p.name, p.logo_url
    ORDER BY count(*) DESC
    LIMIT 10
  ) t;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.visa_sponsors_in(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visa_sponsors_in(text) TO authenticated;

-- Sponsorship documents: the plan's monthly allowance (Starter 10, Pro 50), then any older credit.
-- 'pro' / 'pro_left' keep their names for the app; they now mean "the plan's allowance".
CREATE OR REPLACE FUNCTION public.brief_credits_for(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  quota integer := coalesce(public.feature_limit(p_user, 'sponsorship_documents'), 0);
  cutoff timestamptz := (SELECT value::timestamptz FROM public.plan_settings WHERE key = 'free_document_until');
  joined timestamptz := (SELECT created_at FROM auth.users WHERE id = p_user);
  signup integer;
  granted integer;
  spent integer;
  used integer;
  pro boolean := quota > 0;
  pro_used integer := 0;
  docs integer;
  pro_left integer;
BEGIN
  signup := CASE WHEN cutoff IS NOT NULL AND joined IS NOT NULL AND joined < cutoff THEN 1 ELSE 0 END;
  SELECT coalesce(sum(credits), 0) INTO granted FROM public.brief_credit_grants WHERE user_id = p_user;
  SELECT count(*) FILTER (WHERE paid_with = 'credit'), count(*) INTO spent, used FROM public.hiring_briefs WHERE user_id = p_user;
  IF pro THEN
    SELECT count(*) INTO pro_used FROM public.hiring_briefs
    WHERE user_id = p_user AND paid_with = 'pro' AND created_at >= date_trunc('month', now());
  END IF;
  docs := greatest(0, signup + granted - spent);
  pro_left := CASE WHEN pro THEN greatest(0, quota - pro_used) ELSE 0 END;
  RETURN jsonb_build_object(
    'unit', 'documents',
    'docs', docs,
    'granted', granted,
    'spent', spent,
    'used', used,
    'pro', pro,
    'plan', public.plan_tier(p_user),
    'pro_left', pro_left,
    'quota', quota,
    'left', docs + pro_left
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
  n integer;
  counters boolean := coalesce(current_setting('madevisa.brief_counters', true), '') = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO n FROM public.hiring_briefs WHERE user_id = NEW.user_id AND created_at > now() - interval '7 days';
    IF n >= 30 THEN
      RAISE EXCEPTION 'That''s 30 sponsorship documents this week — the fair-use limit. Try again in a few days.' USING ERRCODE = 'P0001';
    END IF;
    c := public.brief_credits_for(NEW.user_id);
    IF (c->>'pro')::boolean AND (c->>'pro_left')::int > 0 THEN
      NEW.paid_with := 'pro';
    ELSIF (c->>'docs')::int >= 1 THEN
      NEW.paid_with := 'credit';
    ELSIF (c->>'pro')::boolean AND c->>'plan' = 'starter' THEN
      RAISE EXCEPTION 'You''ve used all % sponsorship documents for this month. They renew on the 1st, or Pro includes 50 a month.', c->>'quota' USING ERRCODE = 'P0001';
    ELSIF (c->>'pro')::boolean THEN
      RAISE EXCEPTION 'You''ve used all % sponsorship documents for this month. They renew on the 1st.', c->>'quota' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'Sponsorship documents come with Starter (10 a month) and Pro (50 a month). See Pricing.' USING ERRCODE = 'P0001';
    END IF;
    NEW.cost_usd := 0;
    NEW.view_count := 0;
    NEW.first_viewed_at := NULL;
    NEW.last_viewed_at := NULL;
    NEW.status := 'created';
  ELSE
    IF NOT public.is_admin() THEN
      IF NOT counters THEN
        NEW.view_count := OLD.view_count;
        NEW.first_viewed_at := OLD.first_viewed_at;
        NEW.last_viewed_at := OLD.last_viewed_at;
      END IF;
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

-- Job alerts: Free 1 (a new one replaces it), Starter 5, Pro 10.
CREATE OR REPLACE FUNCTION public.create_job_alert(p_keywords text, p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  kw text := left(btrim(regexp_replace(coalesce(p_keywords, ''), '\s+', ' ', 'g')), 120);
  cc text := nullif(btrim(coalesce(p_country, '')), '');
  n integer;
  cap integer;
  existing public.job_alerts;
  rec public.job_alerts;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF cc IS NOT NULL THEN
    SELECT iso_code INTO cc FROM public.countries WHERE iso_code = upper(cc) OR lower(name) = lower(cc) LIMIT 1;
  END IF;
  IF kw = '' AND cc IS NULL THEN RAISE EXCEPTION 'Choose a country or a keyword for your alert.'; END IF;

  cap := coalesce(public.feature_limit(me, 'job_alerts'), 1000);

  SELECT * INTO existing FROM public.job_alerts
  WHERE user_id = me AND lower(keywords) = lower(kw) AND coalesce(country_code, '') = coalesce(cc, '');
  IF FOUND THEN
    IF NOT existing.active THEN
      SELECT count(*) INTO n FROM public.job_alerts WHERE user_id = me AND active;
      IF n >= cap AND cap <= 1 THEN
        UPDATE public.job_alerts SET active = false WHERE user_id = me AND active;
      ELSIF n >= cap THEN
        RAISE EXCEPTION 'You have % alerts, the most on your plan. Remove one first.', cap USING HINT = 'limit:job_alerts';
      END IF;
    END IF;
    UPDATE public.job_alerts SET active = true, email_enabled = true WHERE id = existing.id RETURNING * INTO rec;
    RETURN jsonb_build_object('id', rec.id, 'keywords', rec.keywords, 'country_code', rec.country_code, 'existing', true);
  END IF;

  SELECT count(*) INTO n FROM public.job_alerts WHERE user_id = me AND created_at > now() - interval '24 hours';
  IF n >= 3 THEN RAISE EXCEPTION 'You can add 3 alerts a day. Try again tomorrow.'; END IF;

  SELECT count(*) INTO n FROM public.job_alerts WHERE user_id = me AND active;
  IF n >= cap THEN
    IF cap <= 1 THEN
      -- Free plan: replace the old alert instead of refusing.
      UPDATE public.job_alerts SET active = false WHERE user_id = me AND active;
    ELSIF public.plan_tier(me) = 'starter' THEN
      RAISE EXCEPTION 'You have % alerts, the most on Starter. Remove one first, or follow up to 10 with Pro.', cap USING HINT = 'limit:job_alerts';
    ELSE
      RAISE EXCEPTION 'You have % alerts — the maximum. Remove one first.', cap USING HINT = 'limit:job_alerts';
    END IF;
  END IF;

  INSERT INTO public.job_alerts (user_id, keywords, country_code, label, last_checked_at)
  VALUES (me, kw, cc, nullif(concat_ws(' · ', nullif(kw, ''), (SELECT name FROM public.countries WHERE iso_code = cc)), ''), now())
  RETURNING * INTO rec;
  RETURN jsonb_build_object('id', rec.id, 'keywords', rec.keywords, 'country_code', rec.country_code, 'existing', false);
END;
$$;
REVOKE ALL ON FUNCTION public.create_job_alert(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_job_alert(text, text) TO authenticated;

-- Direct edits of alert rows (the job page's "Alert me" box): paid plans. Free alerts go through create_job_alert().
DROP POLICY IF EXISTS "job_alerts_own" ON public.job_alerts;
CREATE POLICY "job_alerts_own" ON public.job_alerts FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_paid());

-- A paid plan can't get round its alert limit by inserting rows directly.
CREATE OR REPLACE FUNCTION public.job_alerts_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  n integer;
BEGIN
  -- Server-side callers (create_job_alert, admins, cron) are checked where they are.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.user_id OR NOT NEW.active THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.active THEN RETURN NEW; END IF;
  cap := coalesce(public.feature_limit(NEW.user_id, 'job_alerts'), 1000);
  SELECT count(*) INTO n FROM public.job_alerts WHERE user_id = NEW.user_id AND active AND id IS DISTINCT FROM NEW.id;
  IF n >= cap THEN
    RAISE EXCEPTION 'You have % alerts, the most on your plan. Remove one first.', cap USING ERRCODE = 'P0001', HINT = 'limit:job_alerts';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_alerts_cap ON public.job_alerts;
CREATE TRIGGER job_alerts_cap BEFORE INSERT OR UPDATE OF active ON public.job_alerts FOR EACH ROW EXECUTE FUNCTION public.job_alerts_cap();

-- Admin activates a request after payment (card payments off). Starter or Pro; documents as before.
CREATE OR REPLACE FUNCTION public.activate_plan(p_request uuid, p_months integer DEFAULT 1)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests;
  n integer := greatest(coalesce(p_months, 1), 1);
  v_plan text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.plan_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;

  IF r.user_id IS NOT NULL AND r.plan IN ('starter', 'pro', 'relocation') THEN
    v_plan := public.plan_of(r.plan);
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, current_period_end, note)
    VALUES (r.user_id, v_plan, 'active', now(), now() + make_interval(months => n), 'Request ' || r.id)
    ON CONFLICT (user_id) DO UPDATE SET plan = v_plan, status = 'active', provider = NULL, provider_ref = NULL, billing = 'monthly', cancel_at_period_end = false,
      current_period_end = CASE WHEN public.subscriptions.plan = v_plan
                                THEN greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + make_interval(months => n)
                                ELSE now() + make_interval(months => n) END,
      note = excluded.note, updated_at = now();
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'plan_active', 'Your MadeVisa ' || initcap(v_plan) || ' is active',
            CASE v_plan WHEN 'starter'
              THEN 'Full CV match reports on every job, 10 sponsorship documents a month, up to 5 job alerts and sponsorship insights are unlocked. Thank you for supporting MadeVisa!'
              ELSE 'Auto Apply, full CV match reports, 50 sponsorship documents a month, up to 10 job alerts and sponsorship insights are unlocked. Thank you for supporting MadeVisa!' END,
            '/jobs');
  ELSIF r.user_id IS NOT NULL AND r.plan = 'brief_credits' THEN
    INSERT INTO public.brief_credit_grants (user_id, credits, amount_usd, reason)
    VALUES (r.user_id, n, NULL, 'Request ' || r.id || coalesce(' · ' || r.price_label, ''));
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (r.user_id, 'credits_added', n::text || ' sponsorship document' || CASE WHEN n > 1 THEN 's' ELSE '' END || ' added',
            'Open a job, check your match, and prepare the document from there.', '/offers');
  END IF;
  UPDATE public.plan_requests SET status = 'active', handled_at = now() WHERE id = p_request;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_plan(uuid, integer) TO authenticated;

-- ===========================================================================
-- 6. Gumroad: one product per plan
-- ===========================================================================
-- The function's view of the settings: + the product of each plan, and the old Pro product (still read for its members).
CREATE OR REPLACE FUNCTION public.gumroad_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s) || jsonb_build_object(
    'plans', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'plan', b.id, 'price_cents', b.price_amount, 'currency', b.currency, 'product_id', b.provider_product_id,
        'product_url', b.provider_product_url, 'product_name', b.provider_product_name,
        'provider_price_cents', b.provider_price_amount, 'connected_at', b.connected_at, 'active', b.is_active) ORDER BY b.rank)
      FROM public.billing_plans b WHERE b.id <> 'free'), '[]'::jsonb),
    'legacy_product_id', s.product_id)
  FROM public.gumroad_settings s WHERE id;
$$;
REVOKE ALL ON FUNCTION public.gumroad_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_config() TO service_role;

-- Saves what Connect found for one plan's product (service role). p: product_id, product_url, product_name, price_cents, connected.
CREATE OR REPLACE FUNCTION public.gumroad_plan_save(p_plan text, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_plan NOT IN ('starter', 'pro') THEN RAISE EXCEPTION 'Unknown plan.' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.billing_plans SET
    provider = 'gumroad',
    provider_product_id   = CASE WHEN p ? 'product_id'   THEN p->>'product_id'   ELSE provider_product_id END,
    provider_product_url  = CASE WHEN p ? 'product_url'  THEN p->>'product_url'  ELSE provider_product_url END,
    provider_product_name = CASE WHEN p ? 'product_name' THEN p->>'product_name' ELSE provider_product_name END,
    provider_price_amount = CASE WHEN p ? 'price_cents'  THEN (p->>'price_cents')::integer ELSE provider_price_amount END,
    connected_at = CASE WHEN p ? 'connected' THEN CASE WHEN (p->>'connected')::boolean THEN now() ELSE NULL END ELSE connected_at END,
    updated_at = now()
  WHERE id = p_plan;
  -- No plan connected any more: card payments off.
  UPDATE public.gumroad_settings SET enabled = false, updated_at = now()
  WHERE id AND enabled AND NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE provider_product_id IS NOT NULL AND connected_at IS NOT NULL);
  RETURN public.gumroad_config();
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_plan_save(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_plan_save(text, jsonb) TO service_role;

-- Who is asking: + every membership that is still being billed (not cancelled), with its plan.
CREATE OR REPLACE FUNCTION public.gumroad_user(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'email_verified', EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.email_verified_at IS NOT NULL AND p.verified_email = lower(u.email)),
    'is_admin', EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.role = 'admin'),
    'plan', public.plan_tier(u.id),
    'subscription_ids', coalesce((SELECT jsonb_agg(g.subscription_id ORDER BY g.updated_at DESC) FROM public.gumroad_subscriptions g WHERE g.user_id = u.id), '[]'::jsonb),
    'alive_subscription', (SELECT g.subscription_id FROM public.gumroad_subscriptions g
                           WHERE g.user_id = u.id AND g.ended_at IS NULL AND g.status IN ('alive', 'pending_failure', 'payment_method_update_required')
                           ORDER BY g.updated_at DESC LIMIT 1),
    'alive', coalesce((SELECT jsonb_agg(jsonb_build_object('subscription_id', g.subscription_id, 'plan', public.plan_of(coalesce(g.plan, 'pro')), 'status', g.status, 'until', g.access_until) ORDER BY g.updated_at DESC)
                       FROM public.gumroad_subscriptions g
                       WHERE g.user_id = u.id AND g.ended_at IS NULL AND g.status IN ('alive', 'pending_failure', 'payment_method_update_required')), '[]'::jsonb)
  )
  FROM auth.users u WHERE u.id = p_user;
$$;
REVOKE ALL ON FUNCTION public.gumroad_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_user(uuid) TO service_role;

-- A checkout for one plan. The price comes from billing_plans, never from the caller, and only
-- when Gumroad's product has that same price. An open one from the last 12 hours is used again.
CREATE OR REPLACE FUNCTION public.gumroad_checkout_begin(p_user uuid, p_plan text, p_source text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.billing_plans;
  c public.gumroad_checkouts;
  v_source text := CASE WHEN p_source ~ '^[a-z0-9_]{1,40}$' THEN p_source END;
BEGIN
  IF p_plan IS NULL OR p_plan NOT IN ('starter', 'pro') THEN
    RAISE EXCEPTION 'Unknown plan.' USING ERRCODE = 'P0001', HINT = 'plan';
  END IF;
  SELECT * INTO b FROM public.billing_plans WHERE id = p_plan AND is_active;
  IF NOT FOUND OR b.provider_product_id IS NULL OR b.provider_product_url IS NULL OR b.connected_at IS NULL THEN
    RAISE EXCEPTION 'This plan can''t be bought by card yet.' USING ERRCODE = 'P0001', HINT = 'unavailable';
  END IF;
  IF b.provider_price_amount IS DISTINCT FROM b.price_amount THEN
    RAISE EXCEPTION 'The price on Gumroad (% cents) is not the plan''s price (% cents).', b.provider_price_amount, b.price_amount USING ERRCODE = 'P0001', HINT = 'price_mismatch';
  END IF;

  SELECT * INTO c FROM public.gumroad_checkouts
  WHERE user_id = p_user AND plan = p_plan AND billing = 'monthly' AND price_cents = b.price_amount
    AND used_at IS NULL AND offer_code IS NULL AND created_at > now() - interval '12 hours'
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    IF (SELECT count(*) FROM public.gumroad_checkouts WHERE user_id = p_user AND created_at > now() - interval '1 day') >= 20 THEN
      RAISE EXCEPTION 'Too many checkouts today. Try again tomorrow, or write to hello@madevisa.com.' USING ERRCODE = 'P0001', HINT = 'rate';
    END IF;
    INSERT INTO public.gumroad_checkouts (user_id, plan, billing, country, price_cents, list_cents, source)
    VALUES (p_user, p_plan, 'monthly', NULL, b.price_amount, b.price_amount, v_source)
    RETURNING * INTO c;
  END IF;
  RETURN jsonb_build_object('id', c.id, 'plan', c.plan, 'price_cents', c.price_cents, 'currency', b.currency,
                            'product_url', b.provider_product_url, 'product_id', b.provider_product_id, 'reused', c.created_at < now() - interval '1 second');
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_checkout_begin(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_checkout_begin(uuid, text, text) TO service_role;

-- A checkout of mine (the confirmation page): which plan, at what price, and whether a payment came back for it.
CREATE OR REPLACE FUNCTION public.my_checkout(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('id', c.id, 'plan', c.plan, 'price_cents', c.price_cents, 'billing', c.billing, 'created_at', c.created_at, 'paid', c.used_at IS NOT NULL)
  FROM public.gumroad_checkouts c WHERE c.id = p_id AND c.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_checkout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_checkout(uuid) TO authenticated;

-- Is card payment on? On once any plan is connected and an admin switched it on.
CREATE OR REPLACE FUNCTION public.gumroad_public()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', s.enabled AND EXISTS (SELECT 1 FROM public.billing_plans b WHERE b.provider_product_id IS NOT NULL AND b.connected_at IS NOT NULL),
    'connected', EXISTS (SELECT 1 FROM public.billing_plans b WHERE b.provider_product_id IS NOT NULL AND b.connected_at IS NOT NULL)
  ) FROM public.gumroad_settings s WHERE id;
$$;
REVOKE ALL ON FUNCTION public.gumroad_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gumroad_public() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gumroad_admin_enable(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF p_enabled AND NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE provider_product_id IS NOT NULL AND connected_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Connect the Gumroad product of Starter or Pro first.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.gumroad_settings SET enabled = coalesce(p_enabled, false), updated_at = now() WHERE id;
  RETURN public.gumroad_admin();
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_admin_enable(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gumroad_admin_enable(boolean) TO authenticated;

-- Admin → Plans: + each plan's product, members' plans, and the checkout funnel by plan and source.
CREATE OR REPLACE FUNCTION public.gumroad_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.gumroad_settings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.gumroad_settings WHERE id;
  RETURN jsonb_build_object(
    'enabled', s.enabled,
    'connected', EXISTS (SELECT 1 FROM public.billing_plans b WHERE b.provider_product_id IS NOT NULL AND b.connected_at IS NOT NULL),
    'legacy_product_url', s.product_url,
    'legacy_product_name', s.product_name,
    'product_url', s.product_url,
    'product_name', s.product_name,
    'monthly_cents', s.monthly_cents,
    'yearly_cents', s.yearly_cents,
    'hooks', jsonb_array_length(s.hooks),
    'connected_at', s.connected_at,
    'last_ping_at', s.last_ping_at,
    'last_error', s.last_error,
    'plans', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'plan', b.id, 'name', b.name, 'price_cents', b.price_amount, 'product_url', b.provider_product_url, 'product_name', b.provider_product_name,
        'provider_price_cents', b.provider_price_amount, 'connected_at', b.connected_at,
        'members', (SELECT count(*) FROM public.gumroad_subscriptions g WHERE g.plan = b.id AND g.access_until > now())) ORDER BY b.rank)
      FROM public.billing_plans b WHERE b.id <> 'free'), '[]'::jsonb),
    'checkouts_7d', (SELECT count(*) FROM public.gumroad_checkouts WHERE created_at > now() - interval '7 days'),
    'funnel_30d', coalesce((SELECT jsonb_agg(f ORDER BY f->>'plan', f->>'source') FROM (
        SELECT jsonb_build_object('plan', plan, 'source', coalesce(source, 'other'), 'started', count(DISTINCT user_id), 'paid', count(DISTINCT user_id) FILTER (WHERE used_at IS NOT NULL)) AS f
        FROM public.gumroad_checkouts WHERE created_at > now() - interval '30 days' GROUP BY plan, coalesce(source, 'other')) t), '[]'::jsonb),
    'members', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'updated_at') DESC) FROM (
        SELECT jsonb_build_object(
          'subscription_id', g.subscription_id, 'plan', public.plan_of(coalesce(g.plan, 'pro')), 'email', g.email, 'name', pr.full_name, 'linked', g.user_id IS NOT NULL,
          'recurrence', g.recurrence, 'status', g.status, 'price_cents', g.price_cents,
          'paid_until', g.paid_until, 'access_until', g.access_until, 'cancel_at', g.cancel_at, 'ended_at', g.ended_at,
          'card_country', g.card_country, 'priced_country', g.priced_country, 'test', g.test, 'updated_at', g.updated_at) AS x
        FROM public.gumroad_subscriptions g LEFT JOIN public.profiles pr ON pr.id = g.user_id
        ORDER BY g.updated_at DESC LIMIT 100) t), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'resource', e.resource, 'email', e.email, 'ok', e.ok, 'note', e.note) ORDER BY e.id DESC)
      FROM (SELECT * FROM public.gumroad_events ORDER BY id DESC LIMIT 25) e), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gumroad_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- The membership as Gumroad's API describes it → access, the person's plan, and what they are told.
-- p: subscription_id (required), plan ('starter' | 'pro', from the PRODUCT the function verified),
--    product_id, status, recurrence, email, last_sale_id, last_paid_at, cancel_at, ended_at,
--    price_cents, card_country, test, checkout_id, claim_user.
-- Applying the same state twice changes nothing and tells nobody twice (idempotent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gumroad_apply(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := nullif(btrim(p->>'subscription_id'), '');
  v_status text := coalesce(nullif(p->>'status', ''), 'alive');
  v_recurrence text := nullif(p->>'recurrence', '');
  v_email text := nullif(lower(btrim(p->>'email')), '');
  v_last_paid timestamptz := nullif(p->>'last_paid_at', '')::timestamptz;
  v_cancel_at timestamptz := nullif(p->>'cancel_at', '')::timestamptz;
  v_ended_at timestamptz := nullif(p->>'ended_at', '')::timestamptz;
  v_checkout uuid := CASE WHEN (p->>'checkout_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'checkout_id')::uuid END;
  v_claim uuid := nullif(p->>'claim_user', '')::uuid;
  v_plan text;
  v_alive boolean;
  v_period interval;
  v_paid_until timestamptz;
  v_until timestamptz;
  v_user uuid;
  v_priced text;
  v_is_new boolean;
  v_old_status text;
  v_before text := 'free';
  v_after text := 'free';
  g public.gumroad_subscriptions;
  best public.gumroad_subscriptions;
  s public.subscriptions;
  c public.gumroad_checkouts;
  v_matches integer;
  v_keep_manual boolean := false;
  v_name text;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'subscription_id is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gumroad:' || v_id, 0));
  v_alive := v_status IN ('alive', 'pending_cancellation', 'pending_failure', 'payment_method_update_required') AND v_ended_at IS NULL;

  SELECT * INTO g FROM public.gumroad_subscriptions WHERE subscription_id = v_id FOR UPDATE;
  v_is_new := NOT FOUND;
  v_old_status := g.status;
  -- The plan is the product's (verified by the function); an older row without one was Pro.
  v_plan := CASE WHEN p->>'plan' IN ('starter', 'pro') THEN p->>'plan' ELSE public.plan_of(coalesce(g.plan, 'pro')) END;
  v_recurrence := coalesce(v_recurrence, g.recurrence, 'monthly');
  IF v_last_paid IS NULL AND v_alive AND (g.test OR coalesce((p->>'test')::boolean, false)) THEN
    v_last_paid := coalesce(g.last_paid_at, now());
  END IF;
  v_period := CASE v_recurrence
    WHEN 'yearly' THEN interval '1 year'
    WHEN 'quarterly' THEN interval '3 months'
    WHEN 'biannually' THEN interval '6 months'
    WHEN 'every_two_years' THEN interval '2 years'
    ELSE interval '1 month' END;
  v_paid_until := coalesce(v_last_paid + v_period, now());
  -- Grace: 3 days after a paid period while the membership is alive, so a late renewal notice cuts nobody off.
  v_until := CASE
    WHEN NOT v_alive THEN least(v_paid_until, now())
    WHEN v_status = 'pending_cancellation' AND v_cancel_at IS NOT NULL THEN v_cancel_at
    WHEN v_last_paid IS NULL THEN now()
    ELSE v_paid_until + interval '3 days' END;

  -- Whose is it? Once matched it stays with that account.
  v_user := g.user_id;
  v_priced := g.priced_country;
  IF v_checkout IS NOT NULL THEN
    SELECT * INTO c FROM public.gumroad_checkouts WHERE id = v_checkout;
    IF FOUND THEN
      v_user := coalesce(v_user, c.user_id);
      v_priced := coalesce(v_priced, c.country);
      UPDATE public.gumroad_checkouts SET used_at = coalesce(used_at, now()), sale_id = coalesce(sale_id, p->>'last_sale_id') WHERE id = c.id;
    ELSE
      v_checkout := NULL;
    END IF;
  END IF;
  IF v_user IS NULL AND v_claim IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_claim) THEN
    v_user := v_claim;
  END IF;
  IF v_user IS NULL AND v_email IS NOT NULL THEN
    SELECT count(*), (array_agg(u.id))[1] INTO v_matches, v_user
    FROM auth.users u JOIN public.profiles pr ON pr.id = u.id
    WHERE lower(u.email) = v_email AND pr.email_verified_at IS NOT NULL AND pr.verified_email = lower(u.email);
    IF v_matches <> 1 THEN v_user := NULL; END IF;
  END IF;

  IF v_user IS NOT NULL THEN
    -- One change at a time per person (two memberships can be updated at once).
    PERFORM pg_advisory_xact_lock(hashtextextended('plan:' || v_user::text, 0));
    v_before := public.plan_tier(v_user);
  END IF;

  INSERT INTO public.gumroad_subscriptions AS t
    (subscription_id, user_id, email, recurrence, status, last_sale_id, last_paid_at, paid_until, cancel_at, ended_at, price_cents, card_country, priced_country, checkout_id, test,
     plan, product_id, access_until)
  VALUES
    (v_id, v_user, v_email, v_recurrence, v_status, nullif(p->>'last_sale_id', ''), v_last_paid, v_paid_until, v_cancel_at,
     CASE WHEN v_alive THEN NULL ELSE coalesce(v_ended_at, now()) END,
     nullif(p->>'price_cents', '')::integer, nullif(upper(left(coalesce(p->>'card_country', ''), 2)), ''), v_priced, v_checkout, coalesce((p->>'test')::boolean, false),
     v_plan, nullif(p->>'product_id', ''), v_until)
  ON CONFLICT (subscription_id) DO UPDATE SET
    user_id = coalesce(t.user_id, excluded.user_id),
    email = coalesce(excluded.email, t.email),
    recurrence = excluded.recurrence,
    status = excluded.status,
    last_sale_id = coalesce(excluded.last_sale_id, t.last_sale_id),
    last_paid_at = excluded.last_paid_at,
    paid_until = excluded.paid_until,
    cancel_at = excluded.cancel_at,
    ended_at = CASE WHEN v_alive THEN NULL ELSE coalesce(t.ended_at, excluded.ended_at) END,
    price_cents = coalesce(excluded.price_cents, t.price_cents),
    card_country = coalesce(excluded.card_country, t.card_country),
    priced_country = coalesce(t.priced_country, excluded.priced_country),
    checkout_id = coalesce(t.checkout_id, excluded.checkout_id),
    test = t.test OR excluded.test,
    plan = excluded.plan,
    product_id = coalesce(excluded.product_id, t.product_id),
    access_until = excluded.access_until,
    updated_at = now()
  RETURNING * INTO g;

  v_name := CASE v_plan WHEN 'starter' THEN 'Starter' ELSE 'Pro' END;

  IF v_user IS NULL THEN
    IF v_is_new AND v_alive THEN
      INSERT INTO public.notifications (audience, kind, title, body, link)
      VALUES ('admin', 'plan_paid', v_name || ' paid, but no account matched',
              coalesce(v_email, 'A buyer') || ' paid for ' || v_name || ' on Gumroad without using the checkout on MadeVisa, and no MadeVisa account has that email verified. The plan switches on when they sign in with that email, verify it, and press "Check my payment" on the checkout page or in Settings → Billing.', '/admin?tab=plans');
    END IF;
    RETURN jsonb_build_object('linked', false, 'active', false, 'until', v_until, 'new', v_is_new, 'plan', v_plan);
  END IF;

  -- The person's subscriptions row shows their best membership (the resolver reads all of them anyway).
  SELECT * INTO best FROM public.gumroad_subscriptions
  WHERE user_id = v_user
  -- Running: the highest plan. All ended: the one that ended last.
  ORDER BY (access_until > now()) DESC, CASE WHEN access_until > now() THEN public.plan_rank(plan) ELSE 0 END DESC, access_until DESC NULLS LAST, updated_at DESC
  LIMIT 1;
  SELECT * INTO s FROM public.subscriptions WHERE user_id = v_user FOR UPDATE;
  IF FOUND AND s.provider IS DISTINCT FROM 'gumroad' AND s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN
    -- A plan an admin switched on stays when it is higher, or the same and runs longer.
    v_keep_manual := public.plan_rank(s.plan) > public.plan_rank(best.plan)
      OR (public.plan_rank(s.plan) = public.plan_rank(best.plan) AND (s.current_period_end IS NULL OR s.current_period_end >= best.access_until))
      OR best.access_until <= now();
  END IF;
  IF NOT v_keep_manual THEN
    INSERT INTO public.subscriptions AS t (user_id, plan, status, started_at, current_period_end, note, provider, provider_ref, billing, cancel_at_period_end, updated_at)
    VALUES (v_user, public.plan_of(best.plan), CASE WHEN best.access_until > now() THEN 'active' ELSE 'cancelled' END, now(), best.access_until,
            'Gumroad ' || best.subscription_id, 'gumroad', best.subscription_id, best.recurrence, best.status = 'pending_cancellation', now())
    ON CONFLICT (user_id) DO UPDATE SET
      plan = excluded.plan,
      status = excluded.status,
      started_at = CASE WHEN t.plan = excluded.plan AND t.status = 'active' THEN t.started_at ELSE now() END,
      current_period_end = excluded.current_period_end,
      note = excluded.note,
      provider = 'gumroad',
      provider_ref = excluded.provider_ref,
      billing = excluded.billing,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now()
    WHERE (t.plan, t.status, t.current_period_end, t.provider_ref, t.billing, t.cancel_at_period_end, t.provider)
          IS DISTINCT FROM (excluded.plan, excluded.status, excluded.current_period_end, excluded.provider_ref, excluded.billing, excluded.cancel_at_period_end, 'gumroad');
  END IF;

  v_after := public.plan_tier(v_user);

  -- Tell the person only when what they have changed.
  IF v_before = 'free' AND v_after <> 'free' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_user, 'plan_active', 'Your MadeVisa ' || initcap(v_after) || ' is active',
            CASE v_after WHEN 'starter'
              THEN 'Full CV match reports on every job, 10 sponsorship documents a month, up to 5 job alerts and sponsorship insights are unlocked. Thank you for supporting MadeVisa!'
              ELSE 'Auto Apply, full CV match reports, 50 sponsorship documents a month, up to 10 job alerts and sponsorship insights are unlocked. Thank you for supporting MadeVisa!' END,
            '/jobs');
  ELSIF v_before <> 'free' AND v_after = 'free' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_user, 'plan_ended', 'Your MadeVisa ' || initcap(v_before) || ' has ended',
            'Your account is back on the free plan. Your CV, matches, saved jobs, applications and documents are all still here. You can start a plan again any time.', '/pricing');
  ELSIF v_before <> v_after THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_user, 'plan_changed', 'You''re on MadeVisa ' || initcap(v_after) || ' now',
            CASE v_after WHEN 'pro' THEN 'Auto Apply, 50 sponsorship documents a month and up to 10 job alerts are unlocked.'
              ELSE 'Your Pro has ended and Starter continues: full CV match reports, 10 sponsorship documents a month and up to 5 job alerts.' END,
            '/profile?tab=settings#billing');
  END IF;
  -- A renewal that failed: once, when it starts failing.
  IF v_status IN ('pending_failure', 'payment_method_update_required') AND v_old_status IS DISTINCT FROM v_status
     AND v_old_status NOT IN ('pending_failure', 'payment_method_update_required') THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_user, 'plan_payment_issue', 'Your ' || v_name || ' payment didn''t go through',
            'Gumroad couldn''t charge your card for the renewal. Update your payment method on Gumroad to keep ' || v_name || '. Your plan stays on for a few days while Gumroad tries again.',
            '/profile?tab=settings#billing');
  END IF;

  IF v_is_new AND v_alive THEN
    INSERT INTO public.notifications (audience, kind, title, body, link)
    VALUES ('admin', 'plan_paid', 'New ' || v_name || ' member' || CASE WHEN g.test THEN ' (test purchase)' ELSE '' END,
            concat_ws(' · ', coalesce(v_email, 'A buyer'), v_recurrence,
              CASE WHEN g.price_cents IS NOT NULL THEN '$' || trim(to_char(g.price_cents / 100.0, 'FM999990.00')) END,
              CASE WHEN g.card_country IS NOT NULL THEN 'paid from ' || g.card_country END),
            '/admin?tab=plans');
  END IF;

  RETURN jsonb_build_object('linked', true, 'user_id', v_user, 'active', g.access_until > now(), 'until', v_until, 'new', v_is_new,
                            'plan', v_plan, 'before', v_before, 'after', v_after, 'kept_other_plan', v_keep_manual);
END;
$$;
REVOKE ALL ON FUNCTION public.gumroad_apply(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gumroad_apply(jsonb) TO service_role;

-- Notification wording that promised the old single plan.
UPDATE public.notifications SET body = replace(body, 'You can start Pro again any time.', 'You can start a plan again any time.')
WHERE read_at IS NULL AND body LIKE '%You can start Pro again any time.%';
