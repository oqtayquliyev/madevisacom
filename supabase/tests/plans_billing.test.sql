-- Tests for 20261219090000_starter_pro_plans.sql: plans, the entitlement resolver, the
-- Gumroad lifecycle (purchase, duplicates, switching, refunds, failures, unmatched buyers)
-- and the server-side gates.
-- Scratch database with every migration applied — never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/plans_billing.test.sql
-- Everything happens in one transaction that is rolled back at the end.
BEGIN;
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon, service_role;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon, service_role;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true); SET LOCAL ROLE authenticated; END $$;
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); RESET ROLE; END $$;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;
-- Runs SQL that must fail with a message containing `want`.
CREATE FUNCTION t.fails(q text, want text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%' || want || '%' THEN RAISE EXCEPTION 'FAILED: % (got: %)', what, SQLERRM; END IF;
    RAISE NOTICE 'ok: %', what; RETURN;
  END;
  RAISE EXCEPTION 'FAILED: % (did not fail)', what;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated, anon, service_role;
CREATE FUNCTION t.notes(k text, kind text) RETURNS integer LANGUAGE sql STABLE AS $$ SELECT count(*)::integer FROM public.notifications WHERE user_id = t.id(k) AND notifications.kind = $2 $$;
-- A Gumroad membership as the function would apply it.
CREATE FUNCTION t.apply(sub text, plan text, status text, paid_ago interval, extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.gumroad_apply(jsonb_build_object('subscription_id', sub, 'plan', plan, 'product_id', 'prod_' || plan, 'status', status, 'recurrence', 'monthly',
    'last_paid_at', CASE WHEN paid_ago IS NULL THEN NULL ELSE now() - paid_ago END, 'last_sale_id', 'sale_' || sub,
    'price_cents', CASE plan WHEN 'starter' THEN 299 ELSE 899 END) || extra)
$$;

INSERT INTO t.ids VALUES ('free', gen_random_uuid()), ('starter', gen_random_uuid()), ('pro', gen_random_uuid()), ('manual', gen_random_uuid()),
  ('switch', gen_random_uuid()), ('late', gen_random_uuid()), ('admin', gen_random_uuid()), ('legacy', gen_random_uuid());
INSERT INTO auth.users (id, email, email_confirmed_at, created_at) SELECT v, k || '@example.com', now(), now() - interval '40 days' FROM t.ids;
INSERT INTO public.profiles (id, email, full_name) SELECT v, k || '@example.com', initcap(k) FROM t.ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
-- 'late' verified their email the MadeVisa way; nobody else did.
UPDATE public.profiles SET email_verified_at = now(), verified_email = 'late@example.com' WHERE id = t.id('late');
INSERT INTO t.ids VALUES ('acme', gen_random_uuid());
INSERT INTO public.program_publishers (id, org_type, name, verification_status, website) VALUES (t.id('acme'), 'company', 'Acme', 'verified', 'https://acme.example');
INSERT INTO public.sponsored_jobs (publisher_id, title, category, status, released_at, visa_sponsorship, country_id)
SELECT t.id('acme'), 'Data Analyst ' || g, 'Full time', 'published', now() - interval '1 hour', true, (SELECT id FROM public.countries WHERE iso_code = 'DE')
FROM generate_series(1, 8) g;
UPDATE public.sponsored_jobs SET awaiting_release = false WHERE publisher_id = t.id('acme');
CREATE TABLE t.jobs AS SELECT id, row_number() OVER (ORDER BY title) AS n FROM public.sponsored_jobs WHERE publisher_id = t.id('acme');
GRANT SELECT ON t.jobs TO authenticated;
CREATE FUNCTION t.job(n integer) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM t.jobs WHERE jobs.n = $1 $$;
GRANT EXECUTE ON FUNCTION t.job(integer) TO authenticated;

\echo '1. catalogue'
SELECT t.ok((SELECT price_amount FROM public.billing_plans WHERE id = 'starter') = 299, 'Starter is 299 cents');
SELECT t.ok((SELECT price_amount FROM public.billing_plans WHERE id = 'pro') = 899, 'Pro is 899 cents');
SELECT t.ok((SELECT billing_interval FROM public.billing_plans WHERE id = 'pro') = 'monthly', 'monthly billing');
SET LOCAL ROLE anon;
SELECT t.ok(jsonb_array_length(public.billing_catalog()->'plans') = 3, 'catalogue is public and lists three plans');
SELECT t.ok((public.billing_catalog()->'plans'->1->>'price_amount')::int = 299 AND public.billing_catalog()->'plans'->1->>'id' = 'starter', 'catalogue Starter price');
SELECT t.ok((public.billing_catalog()->'plans'->2->'features'->'sponsorship_documents'->>'limit')::int = 50, 'catalogue shows the Pro document limit');
SELECT t.ok(NOT (public.billing_catalog()->'plans'->2->>'available')::boolean, 'not purchasable before the product is connected');
SELECT t.ok(public.billing_catalog()::text NOT LIKE '%product%', 'no product ids or links in the public catalogue');
RESET ROLE;
SELECT t.fails($q$ SET LOCAL ROLE anon; SELECT * FROM public.billing_plans $q$, 'permission denied', 'plan table is not readable from the browser');
RESET ROLE;

\echo '2. free'
SELECT t.ok(public.plan_tier(t.id('free')) = 'free' AND NOT public.is_pro(t.id('free')) AND NOT public.is_paid(t.id('free')), 'no plan → free');
SELECT t.ok(NOT public.has_feature(t.id('free'), 'cv_full_report'), 'free has no full report');
SELECT t.ok(public.feature_limit(t.id('free'), 'saved_jobs') = 5, 'free saves 5 jobs');
SELECT t.ok(NOT public.has_feature(t.id('free'), 'no_such_feature'), 'unknown feature is refused');
SELECT t.as('free');
SELECT t.ok(public.my_entitlements()->>'plan' = 'free' AND public.my_entitlements()->'sub' = 'null'::jsonb, 'my_entitlements: free');
SELECT t.out();

\echo '3. a verified Starter purchase'
-- The person pressed Checkout: the server made the checkout row (the plan is connected first).
SELECT t.fails($q$ SELECT public.gumroad_checkout_begin(t.id('starter'), 'starter', 'pricing') $q$, 'can''t be bought', 'no checkout before the product is connected');
SELECT public.gumroad_plan_save('starter', '{"product_id":"prod_starter","product_url":"https://madevisa.gumroad.com/l/starter","product_name":"MadeVisa Starter","price_cents":299,"connected":true}');
SELECT public.gumroad_plan_save('pro', '{"product_id":"prod_pro","product_url":"https://madevisa.gumroad.com/l/pro","product_name":"MadeVisa Pro","price_cents":899,"connected":true}');
SELECT t.fails($q$ SELECT public.gumroad_checkout_begin(t.id('starter'), 'enterprise', NULL) $q$, 'Unknown plan', 'an unknown plan is refused');
SELECT t.fails($q$ SELECT public.gumroad_checkout_begin(t.id('starter'), NULL, NULL) $q$, 'Unknown plan', 'no plan is refused');
CREATE TEMP TABLE co AS SELECT public.gumroad_checkout_begin(t.id('starter'), 'starter', 'pricing') AS c;
GRANT SELECT ON co TO authenticated;
SELECT t.ok((SELECT (c->>'price_cents')::int FROM co) = 299, 'checkout price comes from the plan');
SELECT t.ok((SELECT c->>'product_url' FROM co) = 'https://madevisa.gumroad.com/l/starter', 'checkout goes to the Starter product');
SELECT t.ok((SELECT public.gumroad_checkout_begin(t.id('starter'), 'starter', 'pricing')->>'id' FROM co) = (SELECT c->>'id' FROM co), 'pressing twice reuses the checkout');
SELECT t.ok((SELECT count(*) FROM public.gumroad_checkouts WHERE user_id = t.id('starter')) = 1, 'one checkout row');
-- Before Gumroad confirms anything: still free (visiting a success page grants nothing).
SELECT t.ok(public.plan_tier(t.id('starter')) = 'free', 'no access before a verified payment');
-- Pending: Gumroad says alive but no payment has gone through yet → no paid period.
SELECT t.apply('sub_s', 'starter', 'alive', NULL, jsonb_build_object('checkout_id', (SELECT c->>'id' FROM co)));
SELECT t.ok(public.plan_tier(t.id('starter')) = 'free', 'a membership with no payment grants nothing');
-- Paid.
SELECT t.ok((t.apply('sub_s', 'starter', 'alive', interval '1 minute')->>'after') = 'starter', 'payment → Starter');
SELECT t.ok(public.plan_tier(t.id('starter')) = 'starter' AND public.is_paid(t.id('starter')) AND NOT public.is_pro(t.id('starter')), 'Starter is paid, not Pro');
SELECT t.ok((SELECT used_at IS NOT NULL FROM public.gumroad_checkouts WHERE id = (SELECT (c->>'id')::uuid FROM co)), 'checkout marked paid');
SELECT t.ok(t.notes('starter', 'plan_active') = 1, 'told once');
SELECT t.ok((SELECT plan FROM public.subscriptions WHERE user_id = t.id('starter')) = 'starter', 'subscriptions row says starter');
SELECT t.ok(public.has_feature(t.id('starter'), 'cv_full_report') AND public.has_feature(t.id('starter'), 'sponsorship_insights'), 'Starter features on');
SELECT t.ok(NOT public.has_feature(t.id('starter'), 'auto_apply'), 'Auto Apply stays Pro');
SELECT t.ok(public.feature_limit(t.id('starter'), 'sponsorship_documents') = 20 AND public.feature_limit(t.id('starter'), 'job_alerts') = 5, 'Starter limits');
SELECT t.ok(public.feature_limit(t.id('starter'), 'saved_jobs') IS NULL, 'Starter saves without a limit');

\echo '4. the same notification again (duplicates are idempotent)'
CREATE TEMP TABLE before_dup AS SELECT updated_at, current_period_end FROM public.subscriptions WHERE user_id = t.id('starter');
SELECT t.apply('sub_s', 'starter', 'alive', interval '1 minute');
SELECT t.apply('sub_s', 'starter', 'alive', interval '1 minute');
SELECT t.ok((SELECT count(*) FROM public.gumroad_subscriptions WHERE subscription_id = 'sub_s') = 1, 'still one membership');
SELECT t.ok(t.notes('starter', 'plan_active') = 1, 'nobody told twice');
SELECT t.ok((SELECT count(*) FROM public.notifications WHERE audience = 'admin' AND kind = 'plan_paid' AND title = 'New Starter member') = 1, 'admin told once');
SELECT t.ok((SELECT updated_at FROM public.subscriptions WHERE user_id = t.id('starter')) = (SELECT updated_at FROM before_dup), 'subscriptions row untouched by a repeat');

\echo '5. the server-side gates'
SELECT t.as('free');
SELECT t.ok((public.cv_check('job-1', 70)->>'unlocked')::boolean, 'free: 1st missing-skills unlock');
SELECT public.cv_check('job-2', 70); SELECT public.cv_check('job-3', 70);
SELECT t.ok(NOT (public.cv_check('job-4', 70)->>'unlocked')::boolean, 'free: 4th job of the day stays locked');
SELECT t.ok(NOT (public.cv_checks_today()->>'pro')::boolean, 'free: no full report');
SELECT t.fails($q$ SELECT public.visa_sponsors_in('DE') $q$, 'Starter and Pro', 'free: sponsorship insights refused');
SELECT public.create_job_alert('analyst', 'DE');
SELECT public.create_job_alert('engineer', 'DE');
SELECT t.ok((SELECT count(*) FROM public.job_alerts WHERE user_id = t.id('free') AND active) = 1, 'free: a second alert replaces the first');
SELECT t.fails($q$ INSERT INTO public.job_alerts (user_id, keywords) VALUES (t.id('free'), 'nurse') $q$, '', 'free: no direct alert inserts (trigger or row security)');
SELECT t.ok((public.save_job(t.job(n::int))->>'saved')::boolean, 'free: save job ' || n) FROM generate_series(1, 5) n;
SELECT t.ok((public.save_job(t.job(1))->>'existing')::boolean, 'saving the same job again is a no-op');
SELECT t.fails($q$ SELECT public.save_job(t.job(6)) $q$, 'most on the Free plan', 'free: a 6th saved job is refused');
SELECT t.fails($q$ INSERT INTO public.saved_jobs (user_id, job_id) VALUES (t.id('free'), t.job(6)) $q$, 'permission denied', 'free: no direct inserts around the limit');
SELECT public.unsave_job(t.job(1));
SELECT t.ok((public.save_job(t.job(6))->>'saved')::boolean, 'free: after removing one, another can be saved');
SELECT t.ok((public.my_entitlements()->'usage'->>'saved_jobs')::int = 5, 'usage counts saved jobs');
SELECT t.fails($q$ SELECT public.auto_apply_start('{"consent":true,"consent_text":"x"}') $q$, 'Pro', 'free: Auto Apply service refused');
SELECT t.out();
SELECT t.ok((public.brief_credits_for(t.id('free'))->>'quota')::int = 1, 'free: 1 document a month');

SELECT t.as('starter');
SELECT public.cv_check('job-' || g, 70) FROM generate_series(1, 5) g;
SELECT t.ok((public.cv_check('job-6', 70)->>'unlocked')::boolean, 'Starter: no daily limit');
SELECT t.ok((public.cv_checks_today()->>'pro')::boolean AND public.cv_checks_today()->>'plan' = 'starter', 'Starter: full report');
SELECT t.ok(jsonb_typeof(public.visa_sponsors_in('DE')) = 'array', 'Starter: sponsorship insights');
SELECT public.create_job_alert('role ' || g, NULL) FROM generate_series(1, 3) g;
INSERT INTO public.job_alerts (user_id, keywords) VALUES (t.id('starter'), 'direct 1'), (t.id('starter'), 'direct 2');
SELECT t.ok((SELECT count(*) FROM public.job_alerts WHERE user_id = t.id('starter') AND active) = 5, 'Starter: 5 alerts');
SELECT t.fails($q$ INSERT INTO public.job_alerts (user_id, keywords) VALUES (t.id('starter'), 'direct 3') $q$, 'most on your plan', 'Starter: a 6th alert inserted directly is refused');
SELECT t.ok((public.save_job(t.job(n::int))->>'saved')::boolean, 'Starter: save job ' || n) FROM generate_series(1, 8) n;
SELECT t.fails($q$ SELECT public.auto_apply_start('{"consent":true,"consent_text":"x"}') $q$, 'Pro', 'Starter: Auto Apply service refused');
SELECT t.ok(public.my_entitlements()->'sub'->>'plan' = 'starter' AND (public.my_entitlements()->'sub'->>'renews_at') IS NOT NULL, 'my_entitlements: Starter with a renewal date');
SELECT t.out();
SELECT t.ok((public.brief_credits_for(t.id('starter'))->>'quota')::int = 20 AND (public.brief_credits_for(t.id('starter'))->>'pro_left')::int = 20, 'Starter: 20 documents a month');

\echo '6. Starter → Pro (cancel Starter, buy Pro)'
-- The person cancels Starter on Gumroad: it runs to the end of the paid month.
SELECT t.apply('sub_s', 'starter', 'pending_cancellation', interval '1 minute', jsonb_build_object('cancel_at', now() + interval '29 days'));
SELECT t.ok(public.plan_tier(t.id('starter')) = 'starter', 'cancelled Starter still runs to the end of the month');
SELECT t.ok((SELECT cancel_at_period_end FROM public.subscriptions WHERE user_id = t.id('starter')), 'shown as cancelled');
SELECT t.ok((public.gumroad_user(t.id('starter'))->'alive') = '[]'::jsonb, 'a cancelled membership doesn''t block a new checkout');
CREATE TEMP TABLE co2 AS SELECT public.gumroad_checkout_begin(t.id('starter'), 'pro', 'billing_settings') AS c;
SELECT t.apply('sub_p2', 'pro', 'alive', interval '1 minute', jsonb_build_object('checkout_id', (SELECT c->>'id' FROM co2)));
SELECT t.ok(public.plan_tier(t.id('starter')) = 'pro', 'upgraded to Pro');
SELECT t.ok(t.notes('starter', 'plan_changed') = 1 AND t.notes('starter', 'plan_active') = 1, 'told about the change, not a second "active"');
SELECT t.ok((SELECT plan FROM public.subscriptions WHERE user_id = t.id('starter')) = 'pro', 'row shows the best plan');
SELECT t.as('starter');
SELECT t.ok(jsonb_array_length(public.my_entitlements()->'others') = 1 AND public.my_entitlements()->'others'->0->>'plan' = 'starter', 'the running-out Starter is listed separately');
SELECT t.out();
SELECT t.ok((public.brief_credits_for(t.id('starter'))->>'quota')::int = 50, 'Pro: 50 documents');

\echo '7. Pro refunded while Starter still runs'
SELECT t.apply('sub_p2', 'pro', 'cancelled', NULL, '{"ended_at":"now"}'::jsonb || jsonb_build_object('ended_at', now()));
SELECT t.ok(public.plan_tier(t.id('starter')) = 'starter', 'refund ends Pro at once; Starter continues');
SELECT t.ok(t.notes('starter', 'plan_changed') = 2, 'told about the drop to Starter');
SELECT t.ok((SELECT plan FROM public.subscriptions WHERE user_id = t.id('starter')) = 'starter', 'row back to starter');

\echo '8. Starter ends'
SELECT t.apply('sub_s', 'starter', 'cancelled', interval '31 days', jsonb_build_object('ended_at', now()));
SELECT t.ok(public.plan_tier(t.id('starter')) = 'free', 'back to free');
SELECT t.ok(t.notes('starter', 'plan_ended') = 1, 'told it ended');
SELECT t.ok((SELECT count(*) FROM public.saved_jobs WHERE user_id = t.id('starter')) = 8, 'saved jobs are kept after the plan ends');
-- (Everything here happens at one database instant; the refund of step 7 is moved a day back.)
UPDATE public.gumroad_subscriptions SET access_until = now() - interval '1 day' WHERE subscription_id = 'sub_p2';
SELECT t.as('starter');
SELECT t.ok(public.my_entitlements()->'last'->>'plan' = 'starter', 'my_entitlements remembers the last plan');
SELECT t.fails($q$ SELECT public.save_job(gen_random_uuid()) $q$, 'no longer listed', 'an unknown job cannot be saved');
SELECT t.out();

\echo '9. renewals, failed payments, expiry'
SELECT t.apply('sub_pro', 'pro', 'alive', interval '20 days', jsonb_build_object('checkout_id', (SELECT public.gumroad_checkout_begin(t.id('pro'), 'pro', 'checkout')->>'id')));
SELECT t.ok(public.is_pro(t.id('pro')), 'Pro member');
CREATE TEMP TABLE r1 AS SELECT access_until FROM public.gumroad_subscriptions WHERE subscription_id = 'sub_pro';
SELECT t.apply('sub_pro', 'pro', 'alive', interval '1 minute');
SELECT t.ok((SELECT access_until FROM public.gumroad_subscriptions WHERE subscription_id = 'sub_pro') > (SELECT access_until FROM r1) + interval '15 days', 'a verified renewal extends access');
SELECT t.apply('sub_pro', 'pro', 'pending_failure', interval '32 days');
SELECT t.ok(public.is_pro(t.id('pro')), 'failing renewal: still on during the 3-day grace');
SELECT t.ok(t.notes('pro', 'plan_payment_issue') = 1, 'told the payment failed');
SELECT t.apply('sub_pro', 'pro', 'pending_failure', interval '32 days');
SELECT t.ok(t.notes('pro', 'plan_payment_issue') = 1, 'told once');
SELECT t.as('pro');
SELECT t.ok((public.my_entitlements()->'sub'->>'payment_issue')::boolean, 'billing shows the payment problem');
SELECT t.out();
SELECT t.apply('sub_pro', 'pro', 'pending_failure', interval '34 days');
SELECT t.ok(NOT public.is_pro(t.id('pro')), 'grace over without a payment: access ends');
-- Paid period simply ran out (no notification at all): the resolver needs nothing to happen.
UPDATE public.gumroad_subscriptions SET access_until = now() + interval '1 hour', status = 'alive' WHERE subscription_id = 'sub_pro';
UPDATE public.subscriptions SET current_period_end = now() + interval '1 hour', status = 'active' WHERE user_id = t.id('pro');
SELECT t.ok(public.is_pro(t.id('pro')), 'on until the end of the paid period');
UPDATE public.gumroad_subscriptions SET access_until = now() - interval '1 second' WHERE subscription_id = 'sub_pro';
UPDATE public.subscriptions SET current_period_end = now() - interval '1 second' WHERE user_id = t.id('pro');
SELECT t.ok(public.plan_tier(t.id('pro')) = 'free', 'expired → free without any event');

\echo '10. a dispute (chargeback) ends access'
SELECT t.apply('sub_pro', 'pro', 'alive', NULL);
SELECT t.ok(NOT public.is_pro(t.id('pro')), 'a disputed payment (no paid payment left) gives no access');

\echo '11. unmatched buyers'
SELECT t.ok(NOT (t.apply('sub_x', 'pro', 'alive', interval '1 minute', '{"email":"stranger@example.com"}')->>'linked')::boolean, 'unknown buyer is not linked to anyone');
SELECT t.ok((SELECT count(*) FROM public.notifications WHERE audience = 'admin' AND title = 'Pro paid, but no account matched') = 1, 'admin told about it');
-- Bought on Gumroad directly with an email that only an UNVERIFIED account has: not linked.
SELECT t.ok(NOT (t.apply('sub_y', 'starter', 'alive', interval '1 minute', '{"email":"free@example.com"}')->>'linked')::boolean, 'unverified email does not claim a purchase');
SELECT t.ok(public.plan_tier(t.id('free')) = 'free', 'the unverified account got nothing');
-- Verified email: linked to that account.
SELECT t.ok((t.apply('sub_z', 'starter', 'alive', interval '1 minute', '{"email":"late@example.com"}')->>'linked')::boolean, 'verified email links the purchase');
SELECT t.ok(public.plan_tier(t.id('late')) = 'starter', 'and grants the plan');
-- A checkout id from another account cannot move a membership that is already linked.
SELECT t.apply('sub_z', 'starter', 'alive', interval '1 minute', jsonb_build_object('checkout_id', (SELECT c->>'id' FROM co)));
SELECT t.ok((SELECT user_id FROM public.gumroad_subscriptions WHERE subscription_id = 'sub_z') = t.id('late'), 'a linked membership stays with its account');

\echo '12. admin-granted plans'
INSERT INTO public.subscriptions (user_id, plan, status, current_period_end) VALUES (t.id('manual'), 'pro', 'active', now() + interval '60 days');
SELECT t.ok(public.is_pro(t.id('manual')), 'an admin-granted Pro counts');
SELECT t.apply('sub_m', 'starter', 'alive', interval '1 minute', jsonb_build_object('claim_user', t.id('manual')));
SELECT t.ok(public.plan_tier(t.id('manual')) = 'pro' AND (SELECT provider FROM public.subscriptions WHERE user_id = t.id('manual')) IS NULL, 'a higher admin-granted plan is kept');
UPDATE public.subscriptions SET plan = 'relocation' WHERE user_id = t.id('manual');
SELECT t.ok(public.plan_tier(t.id('manual')) = 'pro', 'retired plan names count as Pro');
INSERT INTO public.plan_requests (user_id, email, plan, billing) VALUES (t.id('admin'), 'admin@example.com', 'starter', 'monthly');
SELECT t.as('admin');
SELECT public.activate_plan((SELECT id FROM public.plan_requests WHERE user_id = t.id('admin') AND plan = 'starter'), 1);
SELECT t.out();
SELECT t.ok(public.plan_tier(t.id('admin')) = 'starter', 'admin activation of a Starter request');

\echo '13. legacy Pro members'
INSERT INTO public.gumroad_subscriptions (subscription_id, user_id, status, recurrence, last_paid_at, paid_until, access_until, price_cents)
VALUES ('sub_legacy', t.id('legacy'), 'alive', 'yearly', now() - interval '10 days', now() + interval '355 days', now() + interval '358 days', 14900);
SELECT t.ok(public.is_pro(t.id('legacy')), 'an old membership without a plan is Pro');
SELECT t.ok((public.gumroad_apply(jsonb_build_object('subscription_id', 'sub_legacy', 'status', 'alive', 'recurrence', 'yearly', 'last_paid_at', now() - interval '10 days'))->>'plan') = 'pro', 'applying it without a plan keeps Pro');

\echo '14. checkout prices must match Gumroad'
SELECT public.gumroad_plan_save('pro', '{"price_cents":1900}');
SELECT t.fails($q$ SELECT public.gumroad_checkout_begin(t.id('free'), 'pro', NULL) $q$, 'not the plan''s price', 'a Gumroad price different from the plan''s is refused');
SET LOCAL ROLE anon;
SELECT t.ok(NOT (public.billing_catalog()->'plans'->2->>'available')::boolean, 'and Pro shows as not purchasable');
RESET ROLE;
SELECT t.fails($q$ SET LOCAL ROLE authenticated; SELECT public.gumroad_checkout_begin(t.id('free'), 'starter', NULL) $q$, 'permission denied', 'the browser cannot start checkouts directly');
RESET ROLE;
SELECT t.as('free');
SELECT t.ok(public.my_checkout((SELECT (c->>'id')::uuid FROM co)) IS NULL, 'someone else''s checkout is not visible');
SELECT t.out();
SELECT t.as('starter');
SELECT t.ok((public.my_checkout((SELECT (c->>'id')::uuid FROM co))->>'paid')::boolean, 'my own checkout shows it was paid');
SELECT t.out();

\echo 'ALL PASSED'
ROLLBACK;
