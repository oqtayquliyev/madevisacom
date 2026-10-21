-- Tests for 20261231090000_single_membership_guest_checkout.sql: one plan at $2.29, who a
-- Gumroad buyer's email belongs to, the guest purchase (account made by the function, then
-- claimed), the two membership emails and the renamed plan notices.
-- Scratch database with every migration applied — never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/single_membership.test.sql
-- Nothing is sent: emails only go into email_log (the outbox). Everything is rolled back.
BEGIN;
CREATE SCHEMA t;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;
INSERT INTO public.app_secrets (name, value) VALUES ('resend_api_key', 're_test'), ('email_from', 'MadeVisa <hello@madevisa.com>')
ON CONFLICT (name) DO UPDATE SET value = excluded.value;
DELETE FROM public.email_log;

CREATE TABLE t.ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid());
INSERT INTO t.ids (k) VALUES ('verified'), ('unverified'), ('google'), ('twin1'), ('twin2'), ('member');
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
GRANT USAGE ON SCHEMA t TO authenticated, anon, service_role;
GRANT SELECT ON t.ids TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated, anon, service_role;
INSERT INTO auth.users (id, email, email_confirmed_at, created_at)
SELECT v, CASE WHEN k LIKE 'twin%' THEN 'twin@example.com' ELSE k || '@example.com' END, now(), now() - interval '30 days' FROM t.ids;
INSERT INTO public.profiles (id, email) SELECT v, k || '@example.com' FROM t.ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET email_verified_at = now(), verified_email = 'verified@example.com' WHERE id = t.id('verified');
INSERT INTO auth.identities (user_id, provider, provider_id, identity_data) VALUES (t.id('google'), 'google', 'g-1', jsonb_build_object('email', 'Google@Example.com'));

\echo '1. one plan'
SELECT t.ok((SELECT price_amount FROM public.billing_plans WHERE id = 'starter') = 229, 'the membership is 229 cents');
SELECT t.ok((SELECT name FROM public.billing_plans WHERE id = 'starter') = 'Membership', 'named Membership');
SELECT t.ok(NOT (SELECT is_active FROM public.billing_plans WHERE id = 'pro'), 'Pro is no longer sold');
SET LOCAL ROLE anon;
SELECT t.ok((SELECT array_agg(p->>'id' ORDER BY (p->>'rank')::int) FROM jsonb_array_elements(public.billing_catalog()->'plans') p) = ARRAY['free', 'starter'], 'the public catalogue lists Free and the membership only');
RESET ROLE;
SELECT t.ok((SELECT usage_limit FROM public.plan_entitlements WHERE plan_id = 'starter' AND feature = 'sponsorship_documents') = 20, '20 sponsorship documents a month');
SELECT public.gumroad_plan_save('starter', '{"product_id":"prod_m","product_url":"https://madevisa.gumroad.com/l/starter","product_name":"MadeVisa Membership","price_cents":229,"connected":true}');
DO $$ BEGIN
  PERFORM public.gumroad_checkout_begin(t.id('member'), 'pro', 'old_link');
  RAISE EXCEPTION 'FAILED: a Pro checkout was started';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAILED%' THEN RAISE; END IF;
  RAISE NOTICE 'ok: no Pro checkout any more (%)', SQLERRM;
END $$;
SELECT t.ok((public.gumroad_checkout_begin(t.id('member'), 'starter', 'paywall')->>'price_cents')::int = 229, 'a membership checkout is priced at 229');

\echo '2. whose purchase is it?'
SELECT t.ok(public.gumroad_buyer_account('nobody@example.com', NULL)->>'state' = 'none', 'no account with that email: none');
SELECT t.ok(public.gumroad_buyer_account(' Verified@Example.com ', NULL)->>'state' = 'match' AND (public.gumroad_buyer_account('verified@example.com', NULL)->>'user_id')::uuid = t.id('verified'), 'a verified account: match');
SELECT t.ok(public.gumroad_buyer_account('google@example.com', NULL)->>'state' = 'match', 'a Google sign-in with that email: match');
SELECT t.ok(public.gumroad_buyer_account('unverified@example.com', NULL)->>'state' = 'unverified', 'an account never verified: not claimed automatically');
SELECT t.ok(public.gumroad_buyer_account('twin@example.com', NULL)->>'state' = 'many', 'two accounts with one email: not claimed');
SELECT t.ok(public.gumroad_buyer_account('not-an-email', NULL)->>'state' = 'no_email', 'no usable email');

\echo '3. a purchase made without an account'
-- What the gumroad function does: no account → create one (Supabase Auth), then apply with claim_user.
INSERT INTO t.ids (k) VALUES ('guest');
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES (t.id('guest'), 'guest@example.com', now(), '{"source":"gumroad"}');
SELECT t.ok(EXISTS (SELECT 1 FROM public.profiles WHERE id = t.id('guest')), 'the new account gets a profile');
CREATE TEMP TABLE applied AS SELECT public.gumroad_apply(jsonb_build_object(
  'subscription_id', 'sub_guest', 'plan', 'starter', 'product_id', 'prod_m', 'status', 'alive', 'recurrence', 'monthly',
  'email', 'guest@example.com', 'last_paid_at', now(), 'last_sale_id', 'sale_g', 'price_cents', 229, 'claim_user', t.id('guest'))) AS r;
SELECT t.ok((SELECT (r->>'linked')::boolean AND (r->>'user_id')::uuid = t.id('guest') AND r->>'before' = 'free' AND r->>'after' = 'starter' FROM applied), 'the membership goes on the new account');
SELECT t.ok(public.plan_tier(t.id('guest')) = 'starter' AND public.is_paid(t.id('guest')), 'and it is on');
SELECT t.ok(public.gumroad_buyer_account('guest@example.com', 'sub_guest')->>'state' = 'linked', 'the next notification finds it linked');
SELECT t.ok((SELECT title FROM public.notifications WHERE user_id = t.id('guest') AND kind = 'plan_active') = 'Your MadeVisa Membership is active', 'the notice names the membership');
SELECT t.ok((SELECT body FROM public.notifications WHERE user_id = t.id('guest') AND kind = 'plan_active') LIKE 'You now have access to every job%', 'and says every job is unlocked');
SELECT t.ok((SELECT count(*) FROM public.notifications WHERE audience = 'admin' AND kind = 'plan_paid' AND title LIKE 'New Membership member%') = 1, 'admins hear about the new member');

\echo '4. membership emails'
SELECT t.ok(public.member_emails(t.id('guest'), 'account', 'sub_guest'), 'the account email is queued');
SELECT t.ok(public.member_emails(t.id('guest'), 'welcome', 'sub_guest'), 'the welcome email is queued');
SELECT t.ok(NOT public.member_emails(t.id('guest'), 'welcome', 'sub_guest'), 'never twice for the same membership');
SELECT t.ok(NOT public.member_emails(t.id('guest'), 'nonsense', 'sub_guest'), 'unknown kinds are refused');
SELECT t.ok((SELECT count(*) FROM public.email_log WHERE user_id = t.id('guest') AND kind = 'membership') = 2, 'two emails in the outbox, kind membership');
SELECT t.ok((SELECT subject FROM public.email_log WHERE idem = 'member:account:' || t.id('guest') || ':sub_guest') = 'Your MadeVisa account is ready', 'account email subject');
SELECT t.ok((SELECT payload->>'html' FROM public.email_log WHERE idem = 'member:account:' || t.id('guest') || ':sub_guest') LIKE '%madevisa.com/login%', 'it says how to sign in');
SELECT t.ok((SELECT subject FROM public.email_log WHERE idem = 'member:welcome:' || t.id('guest') || ':sub_guest') ILIKE '%you now have access to every job on MadeVisa', 'welcome email subject');
SELECT t.ok((SELECT payload->>'html' FROM public.email_log WHERE idem = 'member:welcome:' || t.id('guest') || ':sub_guest') LIKE '%Remote and online job listings%', 'the welcome lists what is unlocked');
SELECT t.ok((SELECT count(*) FROM public.email_templates WHERE key IN ('member_account', 'member_welcome') AND audience = 'accounts') = 2, 'both templates are editable in Admin → Emails');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.member_emails(t.id('guest'), 'welcome', 'x');
  RAISE EXCEPTION 'FAILED: the browser could send membership emails';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: the browser cannot send membership emails';
END $$;
DO $$ BEGIN
  PERFORM public.gumroad_buyer_account('verified@example.com', NULL);
  RAISE EXCEPTION 'FAILED: the browser could look up accounts by email';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: the browser cannot look up accounts by email';
END $$;
RESET ROLE;

\echo '5. the sign-up reminder sells the membership'
INSERT INTO t.ids (k) VALUES ('fresh');
INSERT INTO auth.users (id, email, email_confirmed_at, created_at) VALUES (t.id('fresh'), 'fresh@realmail.com', now() - interval '7 hours', now() - interval '7 hours');
SELECT public.run_starter_reminders();
SELECT t.ok((SELECT payload->>'html' FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'fresh@realmail.com') LIKE '%$2.29 a month%', 'the reminder shows $2.29');
SELECT t.ok((SELECT payload->>'html' FROM public.email_log WHERE kind = 'starter_reminder' AND to_email = 'fresh@realmail.com') NOT LIKE '%2.99%', 'and never the old price');

ROLLBACK;
