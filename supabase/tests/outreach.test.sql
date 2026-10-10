-- Tests for 20261216090000_outreach_campaigns.sql. Scratch database only (psql), never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/outreach.test.sql
BEGIN;
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true); SET LOCAL ROLE authenticated; END $$;
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); RESET ROLE; END $$;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;

INSERT INTO public.app_secrets (name, value) VALUES ('resend_api_key', 're_test'), ('email_from', 'MadeVisa <hello@mail.madevisa.com>'), ('email_from_outreach', 'Oqtay from MadeVisa <oqtay@news.madevisa.com>')
ON CONFLICT (name) DO UPDATE SET value = excluded.value;
INSERT INTO t.ids VALUES ('admin', gen_random_uuid()), ('free', gen_random_uuid()), ('nocv', gen_random_uuid()), ('pro', gen_random_uuid());
INSERT INTO auth.users (id, email, email_confirmed_at, created_at) SELECT v, k || '@example.com', now(), now() - interval '10 days' FROM t.ids;
INSERT INTO public.profiles (id, email, full_name) SELECT v, k || '@example.com', initcap(k) || ' Person' FROM t.ids ON CONFLICT (id) DO UPDATE SET full_name = excluded.full_name;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
INSERT INTO public.subscriptions (user_id, plan, status) VALUES (t.id('pro'), 'pro', 'active');
INSERT INTO public.user_cvs (user_id, text, profile) VALUES (t.id('free'), 'Data analyst', '{"titles": ["Data Analyst"], "skills": {"python": 1}}');
INSERT INTO t.ids VALUES ('acme', gen_random_uuid());
INSERT INTO public.program_publishers (id, org_type, name, verification_status, website) VALUES (t.id('acme'), 'company', 'Acme', 'verified', 'https://acme.example');
INSERT INTO public.sponsored_jobs (publisher_id, title, category, status, released_at, visa_sponsorship)
SELECT t.id('acme'), 'Data Analyst ' || g, 'Full time', 'published', now() - interval '1 hour', g % 2 = 0 FROM generate_series(1, 5) g;
UPDATE public.sponsored_jobs SET awaiting_release = false;

\echo '1. import'
SELECT t.as('free');
DO $$ BEGIN PERFORM public.admin_contacts_import('[{"email":"a@x.com"}]'); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%admins%' THEN RAISE; END IF; END $$;
SELECT t.out();
SELECT t.as('admin');
SELECT t.ok((public.admin_contacts_import('[{"email":"Ann@Gmail.com","name":"Ann Lee","country":"Germany"},{"email":"bob@yahoo.com"},{"email":"not-an-email"},{"email":"ann@gmail.com"},{"email":"free@example.com"}]', ARRAY['Webinar Oct'], 'event', 'Signed up at our webinar'))->>'added' = '3', 'three added, one invalid, one duplicate');
SELECT t.out();
SELECT t.ok((SELECT tags FROM public.email_contacts WHERE email = 'ann@gmail.com') = ARRAY['webinar oct'], 'tag lower-cased');
SELECT t.ok((SELECT user_id FROM public.email_contacts WHERE email = 'free@example.com') = t.id('free'), 'linked to the account');
CREATE TEMP TABLE bob AS SELECT id FROM public.email_contacts WHERE email = 'bob@yahoo.com';
GRANT SELECT ON bob TO authenticated;
SELECT t.as('admin');
SELECT public.admin_contacts_update(ARRAY[(SELECT id FROM bob)], 'unsubscribe');
SELECT t.ok((public.admin_contacts_import('[{"email":"bob@yahoo.com"}]'))->>'unsubscribed' = '1', 're-import keeps him unsubscribed');
SELECT t.out();
SELECT t.ok((SELECT status FROM public.email_contacts WHERE email = 'bob@yahoo.com') = 'unsubscribed', 'still unsubscribed');
SELECT t.as('admin');
SELECT t.ok((public.admin_contacts_list(NULL, 'subscribed')->>'total')::int = 2, 'list filter');

\echo '2. audience'
SELECT t.ok((public.admin_audience_count('{"source":"contacts"}')->>'total')::int = 2, 'contacts: ann + free');
SELECT t.ok((public.admin_audience_count('{"source":"accounts","accounts":"no_cv"}')->>'total')::int = 3, 'accounts with no CV: admin, nocv, pro');
SELECT t.ok((public.admin_audience_count('{"source":"accounts","accounts":"free"}')->>'total')::int = 3, 'free accounts: admin, free, nocv');
SELECT t.ok((public.admin_audience_count('{"source":"both"}')->>'total')::int = 5, 'both, de-duplicated');
SELECT t.ok((public.admin_audience_count('{"source":"contacts","tags":["webinar oct"]}')->>'total')::int = 2, 'by tag');
SELECT t.out();
SELECT t.as('nocv');
SELECT public.set_email_prefs('{"news":false}');
SELECT t.out();
SELECT t.as('admin');
SELECT t.ok((public.admin_audience_count('{"source":"both"}')->>'total')::int = 4, 'news off → left out');

\echo '3. templates'
SELECT t.ok(jsonb_array_length(public.admin_templates()) = 6, 'six templates');
SELECT t.ok(public.admin_template_preview('promo_cv')->>'html' LIKE '%Live jobs%', 'preview with stats');
SELECT t.ok(public.admin_template_preview('promo_cv')->>'html' NOT LIKE '%{{%', 'no placeholder left');
SELECT t.ok(public.admin_template_test('promo_auto_apply', 'me@test.com'), 'test send');
SELECT t.out();
SELECT t.ok((SELECT body->>'from' FROM net.requests_log ORDER BY id DESC LIMIT 1) = 'Oqtay from MadeVisa <oqtay@news.madevisa.com>', 'outreach sender used');
SELECT t.ok((SELECT body->>'subject' FROM net.requests_log ORDER BY id DESC LIMIT 1) LIKE '[Test] %', 'test subject');

\echo '4. campaign: start, send within the budget, unsubscribe, done'
UPDATE public.outreach_settings SET daily_cap = 100, reserve = 0, per_minute = 2;
SELECT t.as('admin');
SELECT t.ok((public.admin_campaign_start((public.admin_campaign_save(NULL, 'October push', 'promo_cv', '{"source":"both"}')->>'id')::uuid)->>'total')::int = 4, 'four recipients');
SELECT t.out();
SELECT t.ok(public.run_campaign_sends() = 2, 'two per minute');
SELECT t.ok((SELECT count(*) FROM public.email_contacts WHERE user_id IS NOT NULL) >= 3, 'accounts got contact rows');
-- Someone unsubscribes from the link before their turn.
SELECT public.email_unsubscribe((SELECT c.token FROM public.email_contacts c JOIN public.email_campaign_recipients q ON q.contact_id = c.id WHERE q.status = 'queued' ORDER BY q.id LIMIT 1), 'all');
SELECT t.ok(public.run_campaign_sends() = 1, 'one sent, one skipped (unsubscribed)');
SELECT t.ok((SELECT status FROM public.email_campaigns WHERE name = 'October push') = 'done', 'campaign done');
SELECT t.ok((SELECT body->'headers'->>'List-Unsubscribe' FROM net.requests_log WHERE body->>'subject' NOT LIKE '[Test]%' ORDER BY id DESC LIMIT 1) LIKE '<https://madevisa.com/alerts/unsubscribe?k=all&t=%', 'unsubscribe header');
SELECT t.ok((SELECT count(*) FROM public.email_log WHERE kind = 'campaign') = 3, 'logged');

\echo '5. daily cap'
UPDATE public.outreach_settings SET daily_cap = (SELECT count(*) FROM public.email_log WHERE status <> 'skipped')::int, per_minute = 50;
SELECT t.as('admin');
SELECT public.admin_campaign_start((public.admin_campaign_save(NULL, 'Second', 'promo_fresh_jobs', '{"source":"contacts"}')->>'id')::uuid);
SELECT t.out();
SELECT t.ok(public.run_campaign_sends() = 0, 'cap reached → nothing sent');
UPDATE public.outreach_settings SET daily_cap = 1000;

\echo '6. Auto Apply series: free accounts only, 12 days apart, 3 emails max'
DELETE FROM public.email_log WHERE kind = 'campaign';
CREATE TEMP TABLE expect AS SELECT count(*)::int AS n FROM auth.users u WHERE NOT public.is_pro(u.id) AND public.email_allowed(u.id, 'news')
  AND NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = lower(u.email) AND c.status <> 'subscribed');
SELECT t.ok(public.run_auto_apply_series() = (SELECT n FROM expect) AND (SELECT n FROM expect) >= 1, 'every free account still subscribed');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.nurture_state WHERE user_id IN (t.id('pro'), t.id('nocv'))), 'never Pro, never news-off');
SELECT t.ok(public.run_auto_apply_series() = 0, 'not again the same day');
UPDATE public.nurture_state SET last_sent_at = now() - interval '13 days';
SELECT t.ok(public.run_auto_apply_series() = (SELECT n FROM expect), 'second email after 12 days');
SELECT t.ok((SELECT body->>'subject' FROM net.requests_log ORDER BY id DESC LIMIT 1) LIKE '📈%', 'nurture_2 subject');
UPDATE public.nurture_state SET last_sent_at = now() - interval '13 days';
SELECT public.run_auto_apply_series();
UPDATE public.nurture_state SET last_sent_at = now() - interval '13 days';
SELECT t.ok(public.run_auto_apply_series() = 0, 'three emails, then stops');
SELECT t.ok(public.mv_render_template('nurture_1', 'free@example.com', NULL, t.id('free'))->>'html' LIKE '%5 live jobs%', 'CV line names the matches');

\echo '7. dashboard for an address (no sign-in)'
CREATE TEMP TABLE tok AS SELECT email, token FROM public.email_contacts;
GRANT SELECT ON tok TO anon;
SET LOCAL ROLE anon;
SELECT t.ok(public.email_dashboard((SELECT token FROM tok WHERE email = 'ann@gmail.com'))->>'account' = 'false', 'contact without account');
SELECT t.ok((public.email_dashboard((SELECT token FROM tok WHERE email = 'free@example.com'))->>'matches')::int = 5, 'account: matches counted');
SELECT t.ok(public.email_dashboard((SELECT token FROM tok WHERE email = 'free@example.com'))->>'email' = 'fr•••@example.com', 'email masked');
SELECT t.ok(public.email_dashboard(gen_random_uuid()) IS NULL, 'bad token');
RESET ROLE;

\echo 'ALL PASSED'
ROLLBACK;
