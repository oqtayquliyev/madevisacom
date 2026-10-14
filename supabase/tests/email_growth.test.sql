-- Tests for 20261223090000_email_growth_system.sql. Scratch database only (psql), never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/email_growth.test.sql
-- Nothing is sent: emails are only queued in email_log (the outbox), which the test rolls back.
BEGIN;
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true); SET LOCAL ROLE authenticated; END $$;
CREATE FUNCTION t.anon() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); SET LOCAL ROLE anon; END $$;
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); RESET ROLE; END $$;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;
-- Every placeholder and token resolved, nothing doubled, no empty "Hi ,".
CREATE FUNCTION t.clean(r jsonb) RETURNS boolean LANGUAGE sql AS $$
  SELECT (r->>'subject') !~ '\{\{|\[\[|  |^[a-z ,]' AND (r->>'text') !~ '\{\{|\[\[|Hi ,' AND (r->>'html') !~ '\{\{|\[\[' AND coalesce(r->>'preheader', '') !~ '\{\{'
$$;

INSERT INTO public.app_secrets (name, value) VALUES ('resend_api_key', 're_test'), ('email_from', 'MadeVisa <hello@madevisa.com>')
ON CONFLICT (name) DO UPDATE SET value = excluded.value;
INSERT INTO t.ids VALUES ('admin', gen_random_uuid()), ('anna', gen_random_uuid()), ('nocv', gen_random_uuid()), ('cvonly', gen_random_uuid()),
  ('preview', gen_random_uuid()), ('starter', gen_random_uuid()), ('pro', gen_random_uuid()), ('saver', gen_random_uuid()), ('newbie', gen_random_uuid()),
  ('acme', gen_random_uuid()), ('j1', gen_random_uuid()), ('j2', gen_random_uuid()), ('j3', gen_random_uuid());
INSERT INTO auth.users (id, email, email_confirmed_at, created_at)
SELECT v, k || '@realmail.com', now(), now() - interval '20 days' FROM t.ids WHERE k NOT IN ('acme', 'j1', 'j2', 'j3', 'newbie');
INSERT INTO public.profiles (id, email, full_name)
SELECT v, k || '@realmail.com', CASE WHEN k = 'anna' THEN 'Anna Lee' END FROM t.ids WHERE k NOT IN ('acme', 'j1', 'j2', 'j3', 'newbie')
ON CONFLICT (id) DO UPDATE SET full_name = excluded.full_name;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
INSERT INTO public.subscriptions (user_id, plan, status) VALUES (t.id('pro'), 'pro', 'active'), (t.id('starter'), 'starter', 'active');
INSERT INTO public.user_cvs (user_id, text, profile)
SELECT t.id(k), 'Product designer', '{"titles": ["Product Designer"], "skills": {"figma": 1}}' FROM unnest(ARRAY['anna', 'cvonly', 'preview', 'starter', 'pro']) k;
INSERT INTO public.program_publishers (id, org_type, name, verification_status, website) VALUES (t.id('acme'), 'company', 'Acme', 'verified', 'https://acme.example');
INSERT INTO public.sponsored_jobs (id, publisher_id, title, category, status, released_at, visa_sponsorship) VALUES
  (t.id('j1'), t.id('acme'), 'Senior Product Designer', 'Full time', 'published', now() - interval '1 hour', true),
  (t.id('j2'), t.id('acme'), 'Product Designer', 'Full time', 'published', now() - interval '2 hours', false),
  (t.id('j3'), t.id('acme'), 'Accountant', 'Full time', 'published', now() - interval '3 hours', false);
UPDATE public.sponsored_jobs SET awaiting_release = false;
DELETE FROM public.outreach_role_cache;
INSERT INTO public.saved_jobs (user_id, job_id, created_at) VALUES (t.id('saver'), t.id('j1'), now() - interval '20 days');
INSERT INTO public.user_milestones (user_id, key) VALUES (t.id('preview'), 'cv_match_viewed');
INSERT INTO public.gumroad_checkouts (user_id, plan, billing, price_cents, list_cents, created_at) VALUES (t.id('starter'), 'pro', 'monthly', 899, 899, now() - interval '2 days');

\echo '1. templates: new copy in place, admin edits kept'
SELECT t.ok((SELECT count(*) FROM public.email_template_library) = 17, '17 MadeVisa templates (12 rewritten + 5 lifecycle)');
SELECT t.ok(NOT EXISTS (
  SELECT 1 FROM public.email_template_library l JOIN public.email_templates m USING (key)
  WHERE public.mv_template_hash(m.subject, m.preheader, m.eyebrow, m.headline, m.body, m.cta_label, m.cta_url)
     <> public.mv_template_hash(l.subject, l.preheader, l.eyebrow, l.headline, l.body, l.cta_label, l.cta_url)), 'every template matches the new copy');
SELECT t.ok((SELECT count(*) FROM public.email_template_backups) >= 12, 'old versions backed up');
SELECT t.ok((SELECT cta_url FROM public.email_templates WHERE key = 'nurture_1') = 'https://madevisa.com/pricing?s=aa1#pro', 'nurture_1 goes to Pro pricing');
SELECT t.ok((SELECT body FROM public.email_templates WHERE key = 'promo_cv') NOT ILIKE '%no account needed%', 'promo_cv no longer says no account is needed');
SELECT t.ok((SELECT body FROM public.email_templates WHERE key = 'promo_cv') ILIKE '%need a free account to upload%', 'promo_cv says an account is needed');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_templates WHERE body ~* 'every day for a month|no account needed|read first'), 'old Auto Apply / no-account / read-first claims gone');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_templates WHERE (body || subject) ~* 'auto apply' AND key NOT IN ('promo_cv', 'auto_seeker_2', 'life_starter_upgrade', 'promo_fresh_jobs')
                        AND (body || subject || coalesce(preheader, '')) !~ '\$8\.99'), 'every Auto Apply email names the Pro price');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_templates WHERE body ~ '- \[([a-z]+)\]' AND EXISTS (
  SELECT 1 FROM regexp_matches(body, '- \[([a-z]+)\]', 'g') m
  WHERE m[1] <> ALL (ARRAY['target','zap','globe','plane','mail','pause','file','bell','sparkles','chart','clock','check','trending','briefcase','dashboard','search','send','puzzle','user','rocket','badge','list','calendar','shield','new','star','heart','inbox','award','map']))), 'only supported icons');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.email_template_library WHERE length(subject) > 64), 'subjects within about 60 characters');

-- An admin edit is kept; a never-edited old version is replaced.
UPDATE public.email_templates SET subject = 'My own subject', updated_at = now() WHERE key = 'promo_cv';
UPDATE public.email_templates SET subject = 'Stop applying one by one. Let MadeVisa apply for you' WHERE key = 'promo_auto_apply';
SELECT t.ok((SELECT public.mv_template_hash(subject, preheader, eyebrow, headline, body, cta_label, cta_url) FROM public.email_templates WHERE key = 'promo_auto_apply') IS NOT NULL, 'setup');
DO $$ DECLARE r jsonb := public.mv_template_library_sync();
BEGIN
  PERFORM t.ok(r->'kept' ? 'promo_cv', 'edited template kept: ' || r::text);
  PERFORM t.ok(r->'kept' ? 'promo_auto_apply', 'a template that is neither the new copy nor a shipped version is kept too');
END $$;
SELECT t.ok((SELECT subject FROM public.email_templates WHERE key = 'promo_cv') = 'My own subject', 'admin text untouched');
SELECT t.as('admin');
SELECT t.ok((SELECT e->>'state' FROM jsonb_array_elements(public.admin_template_library()) e WHERE e->>'key' = 'promo_cv') = 'customized', 'Admin sees "customized"');
SELECT t.ok((public.admin_template_use_library('promo_cv'))->>'subject' <> 'My own subject', 'Use MadeVisa version');
SELECT t.ok((public.admin_template_restore('promo_cv'))->>'subject' = 'My own subject', 'restore brings the edit back');
SELECT public.admin_template_use_library('promo_cv');
SELECT public.admin_template_use_library('promo_auto_apply');
SELECT t.out();
SELECT t.anon();
DO $$ BEGIN PERFORM public.admin_template_library(); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%permission%' AND SQLERRM NOT LIKE '%admins%' THEN RAISE; END IF; END $$;
SELECT t.out();

\echo '2. rendering: names, roles, zero results, singular, links'
INSERT INTO public.email_contacts (email, name, role, role_key, audience, status) VALUES
  ('maria@gmail.com', 'Maria Gomez', 'Senior Product Designer', public.mv_role_key('Senior Product Designer'), 'seeker', 'subscribed'),
  ('x7@gmail.com', NULL, 'Astronaut', public.mv_role_key('Astronaut'), 'seeker', 'subscribed'),
  ('acct@gmail.com', 'info', 'Accountant', public.mv_role_key('Accountant'), 'seeker', 'subscribed'),
  ('jobs@nl.bosch.com', NULL, NULL, NULL, 'employer', 'subscribed'),
  ('hr@gmail.com', NULL, NULL, NULL, 'employer', 'subscribed');
CREATE TEMP TABLE r AS
SELECT c.email, k, public.mv_render_auto(k, c) AS j
FROM public.email_contacts c, unnest(ARRAY['auto_seeker_1', 'auto_seeker_2', 'auto_seeker_3', 'auto_employer_1', 'auto_employer_2']) k
WHERE (c.audience = 'seeker') = (k LIKE 'auto_seeker%');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM r WHERE NOT t.clean(j)), 'autopilot: every placeholder resolved for every contact');
SELECT t.ok((SELECT j->>'subject' FROM r WHERE email = 'maria@gmail.com' AND k = 'auto_seeker_1') = 'Maria, product designer jobs abroad, straight from employers', 'known name and role');
SELECT t.ok((SELECT j->>'subject' FROM r WHERE email = 'x7@gmail.com' AND k = 'auto_seeker_1') = 'Jobs abroad, straight from employers', 'unknown name, role without jobs → general');
SELECT t.ok((SELECT j->>'text' FROM r WHERE email = 'x7@gmail.com' AND k = 'auto_seeker_1') LIKE '%Live jobs right now: 3.%', 'general count when the role has no jobs');
SELECT t.ok((SELECT j->>'subject' FROM r WHERE email = 'acct@gmail.com' AND k = 'auto_seeker_2') = 'Which accountant jobs actually fit your CV?', '"info" is not a first name');
SELECT t.ok((SELECT j->>'subject' FROM r WHERE email = 'acct@gmail.com' AND k = 'auto_seeker_3') = 'Jobs where the ad mentions visa sponsorship', 'visa email: role with no sponsored job → all roles');
SELECT t.ok((SELECT (length(j->>'text') - length(replace(j->>'text', '• ', ''))) / 2 FROM r WHERE email = 'acct@gmail.com' AND k = 'auto_seeker_3') = 1, 'visa email shows only jobs that mention sponsorship');
SELECT t.ok((SELECT j->>'text' FROM r WHERE email = 'maria@gmail.com' AND k = 'auto_seeker_1') ~ 'See product designer jobs: https://madevisa\.com/jobs\?q=product%20designer&s=auto&mc=auto_seeker_1\.a&mt=[a-f0-9]{20}', 'role-filtered, encoded, tracked button link');
SELECT t.ok((SELECT j->>'text' FROM r WHERE email = 'jobs@nl.bosch.com' AND k = 'auto_employer_2') ~ 'https://madevisa\.com/pricing\?s=auto&mc=auto_employer_2\.a&mt=[a-f0-9]{20}#employers', 'parameters before the #anchor');
SELECT t.ok((SELECT j->>'subject' FROM r WHERE email = 'jobs@nl.bosch.com' AND k = 'auto_employer_1') = 'Bosch: a free listing for international hires', 'company from the domain');
SELECT t.ok((SELECT j->>'subject' FROM r WHERE email = 'hr@gmail.com' AND k = 'auto_employer_1') = 'Your team: a free listing for international hires', 'company unknown → Your team');
SELECT t.ok((SELECT (j->>'html') LIKE '%' || replace(j->>'unsub', '&', '&amp;') || '%' AND (j->>'text') LIKE '%' || (j->>'unsub') || '%' FROM r WHERE email = 'maria@gmail.com' AND k = 'auto_seeker_1'), 'unsubscribe link in HTML and text');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM r WHERE (j->>'html') !~ 'Sumgayit'), 'address in every footer');
-- No sponsored job at all: the visa email still reads well, without cards.
UPDATE public.sponsored_jobs SET visa_sponsorship = false, visa_status = NULL;
DELETE FROM public.outreach_role_cache;
SELECT t.ok((SELECT t.clean(j) AND (j->>'text') NOT LIKE '%• %' AND (j->>'text') LIKE '%sponsorship: 0.%' FROM (SELECT public.mv_render_auto('auto_seeker_3', c) j FROM public.email_contacts c WHERE email = 'x7@gmail.com') x), 'zero sponsored jobs: no cards, no leftovers');
UPDATE public.sponsored_jobs SET visa_sponsorship = true WHERE id = t.id('j1');
DELETE FROM public.outreach_role_cache;

CREATE TEMP TABLE m AS
SELECT u.who, k, public.mv_render_template(k, u.who || '@realmail.com', NULL, t.id(u.who), gen_random_uuid(), NULL) AS j
FROM (VALUES ('anna'), ('nocv'), ('saver'), ('starter')) u(who),
     unnest(ARRAY['nurture_1', 'nurture_2', 'nurture_3', 'promo_auto_apply', 'promo_cv', 'promo_employers', 'promo_fresh_jobs',
                  'life_no_cv', 'life_cv_ready', 'life_starter_upgrade', 'life_pro_upgrade', 'life_saved_jobs']) k;
SELECT t.ok(NOT EXISTS (SELECT 1 FROM m WHERE NOT t.clean(j)), 'accounts: every placeholder resolved for every template and person');
SELECT t.ok((SELECT j->>'subject' FROM m WHERE who = 'anna' AND k = 'nurture_1') = 'Anna, meet the Pro feature that does the paperwork', 'name in the subject');
SELECT t.ok((SELECT j->>'subject' FROM m WHERE who = 'nocv' AND k = 'nurture_1') = 'Meet the Pro feature that does the paperwork', 'no name: subject rewritten, capitalised');
SELECT t.ok((SELECT j->>'text' FROM m WHERE who = 'nocv' AND k = 'nurture_1') LIKE '%First, upload your CV to your free account%', 'cv_line: no CV');
SELECT t.ok((SELECT j->>'text' FROM m WHERE who = 'anna' AND k = 'nurture_1') ~ 'Your CV matches the titles of \d+ live jobs?', 'cv_line: CV with matches');
SELECT t.ok(public.mv_count_noun(1, 'live job', 'live jobs') = '1 live job' AND public.mv_count_noun(2, 'live job', 'live jobs') = '2 live jobs' AND public.mv_count_noun(1200, 'job', 'jobs') = '1,200 jobs', 'singular and plural');
SELECT t.ok((SELECT j->>'text' FROM m WHERE who = 'saver' AND k = 'life_saved_jobs') LIKE '%Senior Product Designer — Acme%', 'saved jobs listed');
SELECT t.ok((SELECT j->>'text' FROM m WHERE who = 'nocv' AND k = 'life_saved_jobs') NOT LIKE '%You saved these%', 'no saved jobs: no empty list intro');
SELECT t.ok((SELECT j->>'text' FROM m WHERE who = 'anna' AND k = 'nurture_3') LIKE '%$8.99%' AND (SELECT j->>'html' FROM m WHERE who = 'anna' AND k = 'nurture_3') LIKE '%$8.99%', 'price in HTML and text alike');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM m WHERE substring(j->>'text' from ': (https://madevisa\.com/\S+)\n') IS NULL OR (j->>'html') NOT LIKE '%' || replace(substring(j->>'text' from ': (https://madevisa\.com/\S+)\n'), '&', '&amp;') || '%'), 'the same tracked button link in HTML and text');
SELECT t.ok((SELECT j->>'text' FROM m WHERE who = 'anna' AND k = 'nurture_1') ~ 'https://madevisa\.com/pricing\?s=aa1&mc=nurture_1\.a&mt=[a-f0-9]{20}#pro', 'nurture keeps its s= and #pro');
SELECT t.ok((SELECT j->>'text' FROM (SELECT public.mv_render_template('promo_employers', 'jobs@nl.bosch.com', NULL, NULL, gen_random_uuid(), NULL) j) x) NOT LIKE '%Your dashboard%', 'employer contacts get no job-seeker dashboard line');

\echo '3. A/B variants'
SELECT t.ok((SELECT count(*) FROM public.email_template_variants WHERE NOT active) = 7, 'seven variants written, all off');
SELECT t.ok((SELECT j->>'variant' FROM m WHERE who = 'anna' AND k = 'nurture_1') = 'a', 'everyone gets A while B is off');
SELECT t.as('admin');
SELECT public.admin_template_variant_save('{"key": "auto_seeker_1", "active": true, "share": 50}');
SELECT t.out();
SELECT t.ok((SELECT started_at IS NOT NULL FROM public.email_template_variants WHERE key = 'auto_seeker_1'), 'start time kept');
SELECT t.ok((SELECT count(DISTINCT public.mv_ab_bucket('a' || g || '@x.com', 'auto_seeker_1') < 50) FROM generate_series(1, 200) g) = 2, 'both variants in use');
SELECT t.ok((SELECT bool_and(public.mv_ab_bucket('same@x.com', 'auto_seeker_1') = public.mv_ab_bucket('SAME@x.com ', 'auto_seeker_1')) FROM generate_series(1, 5)), 'the same person always lands in the same variant');
DO $$
DECLARE
  c public.email_contacts;
  e text;
  b boolean;
  j jsonb;
BEGIN
  SELECT * INTO c FROM public.email_contacts WHERE email = 'maria@gmail.com';
  FOR i IN 1..60 LOOP
    e := 'p' || i || '@gmail.com';
    b := public.mv_ab_bucket(e, 'auto_seeker_1') < 50;
    c.email := e;
    j := public.mv_render_auto('auto_seeker_1', c);
    IF (j->>'variant' = 'b') <> b THEN RAISE EXCEPTION 'FAILED: variant for %', e; END IF;
    IF b AND (j->>'subject') NOT LIKE '%say whether they sponsor visas' THEN RAISE EXCEPTION 'FAILED: B subject %', j->>'subject'; END IF;
    IF b AND (j->>'text') NOT LIKE '%mc=auto_seeker_1.b%' THEN RAISE EXCEPTION 'FAILED: B link'; END IF;
  END LOOP;
  RAISE NOTICE 'ok: variant B gets its subject and link label';
END $$;

\echo '4. tracking and attribution (queued only, never sent)'
CREATE TEMP TABLE sent AS
SELECT public.mv_send_outreach('maria@gmail.com', public.mv_render_auto('auto_seeker_2', c), 'auto_seeker', NULL, 'test-1') AS id
FROM public.email_contacts c WHERE email = 'maria@gmail.com';
GRANT SELECT ON sent TO anon, authenticated;
SELECT t.ok((SELECT template_key = 'auto_seeker_2' AND variant = 'a' AND track ~ '^[a-f0-9]{20}$' AND status = 'queued' FROM public.email_log WHERE id = (SELECT id FROM sent)), 'logged with template, variant and token, queued only');
CREATE TEMP TABLE tk AS SELECT track FROM public.email_log WHERE id = (SELECT id FROM sent);
GRANT SELECT ON tk TO anon, authenticated;
SELECT t.anon();
SELECT t.ok(public.email_click((SELECT track FROM tk), '/cv-match?mt=secret#x'), 'click recorded');
SELECT t.ok(public.email_click((SELECT track FROM tk), '/cv-match'), 'second click');
SELECT t.ok(NOT public.email_click('ffffffffffffffffffff', '/'), 'unknown token refused');
SELECT t.ok(NOT public.email_click('<script>', '/'), 'malformed token refused');
SELECT t.ok(public.email_touch_event((SELECT track FROM tk), 'listing_submitted') AND public.email_touch_event((SELECT track FROM tk), 'listing_submitted'), 'event twice');
SELECT t.ok(NOT public.email_touch_event((SELECT track FROM tk), 'anything'), 'unknown event refused');
SELECT t.out();
SELECT t.ok((SELECT clicks = 2 AND landing_path = '/cv-match' AND first_click_at IS NOT NULL AND (events ? 'listing_submitted') FROM public.email_touches WHERE track = (SELECT track FROM tk)), 'one touch row: 2 clicks, path without query, event once');
SELECT t.ok((SELECT clicked_at IS NOT NULL FROM public.email_log WHERE id = (SELECT id FROM sent)), 'unique click on the email');
-- The person signs up, uploads a CV and buys Pro.
INSERT INTO auth.users (id, email, email_confirmed_at, created_at) VALUES (t.id('newbie'), 'maria@gmail.com', now(), now());
INSERT INTO public.profiles (id, email, full_name) VALUES (t.id('newbie'), 'maria@gmail.com', 'Maria Gomez') ON CONFLICT (id) DO NOTHING;
SELECT t.as('newbie');
SELECT t.ok(public.email_attr_claim((SELECT track FROM tk)), 'claimed after sign-up');
SELECT t.out();
INSERT INTO public.user_cvs (user_id, text, profile) VALUES (t.id('newbie'), 'Designer', '{}');
INSERT INTO public.gumroad_checkouts (user_id, plan, billing, price_cents, list_cents, used_at, sale_id) VALUES (t.id('newbie'), 'pro', 'monthly', 899, 899, now(), 's1');
INSERT INTO public.gumroad_checkouts (user_id, plan, billing, price_cents, list_cents) VALUES (t.id('newbie'), 'starter', 'monthly', 299, 299);
-- A purchase with no email click is not credited to email.
INSERT INTO public.gumroad_checkouts (user_id, plan, billing, price_cents, list_cents, used_at, sale_id) VALUES (t.id('anna'), 'starter', 'monthly', 299, 299, now(), 's2');
SELECT t.as('admin');
CREATE TEMP TABLE rep AS SELECT public.admin_email_report(30) AS j;
SELECT t.out();
SELECT t.ok((SELECT (e->>'sent')::int = 1 AND (e->>'clicked')::int = 1 AND (e->>'registered')::int = 1 AND (e->>'cv_uploaded')::int = 1
                AND (e->>'checkout_started')::int = 1 AND (e->>'pro_purchases')::int = 1 AND (e->>'starter_purchases')::int = 0
                AND (e->>'revenue_cents')::int = 899 AND (e->>'listings')::int = 1 AND (e->>'low_sample')::boolean
             FROM rep, jsonb_array_elements(j->'rows') e WHERE e->>'template' = 'auto_seeker_2' AND e->>'segment' = 'cold'),
         'report: sent → click → sign-up → CV → Pro, each once, revenue from the confirmed checkout only');
SELECT t.ok((SELECT coalesce(sum((e->>'revenue_cents')::int), 0) FROM rep, jsonb_array_elements(j->'rows') e) = 899, 'the unrelated Starter purchase is not credited');
-- A test send never takes a real token.
CREATE TEMP TABLE tst AS SELECT public.mv_send_outreach('me@realmail.com', public.mv_render_template('promo_cv', 'me@realmail.com'), 'test') AS id;
SELECT t.ok((SELECT track IS NULL AND template_key = 'promo_cv' FROM public.email_log WHERE id = (SELECT id FROM tst)), 'test sends carry no token');

\echo '5. provider events'
UPDATE public.email_log SET status = 'sent', provider_id = 'prov-1' WHERE id = (SELECT id FROM sent);
SELECT t.ok(public.email_provider_event('{"id": "evt-1", "type": "email.delivered", "data": {"email_id": "prov-1"}}') = 'applied', 'delivered');
SELECT t.ok(public.email_provider_event('{"id": "evt-1", "type": "email.delivered", "data": {"email_id": "prov-1"}}') = 'duplicate', 'the same event twice is applied once');
SELECT t.ok(public.email_provider_event('{"id": "evt-2", "type": "email.bounced", "data": {"email_id": "prov-1", "bounce": {"type": "Transient", "message": "Mailbox full"}}}') = 'applied', 'soft bounce');
SELECT t.ok((SELECT status FROM public.email_contacts WHERE email = 'maria@gmail.com') = 'subscribed', 'soft bounce does not suppress');
SELECT t.ok(public.email_provider_event('{"id": "evt-3", "type": "email.bounced", "data": {"email_id": "prov-1", "bounce": {"type": "Permanent", "message": "No such user"}}}') = 'applied', 'hard bounce');
SELECT t.ok((SELECT status FROM public.email_contacts WHERE email = 'maria@gmail.com') = 'bounced', 'hard bounce suppresses the address');
SELECT t.ok((SELECT status = 'failed' AND status_code = 422 AND delivered_at IS NOT NULL AND bounced_at IS NOT NULL FROM public.email_log WHERE id = (SELECT id FROM sent)), 'counted for the autopilot bounce brake');
DO $$
DECLARE i integer;
BEGIN
  UPDATE public.outreach_autopilot SET enabled = true, paused_reason = NULL WHERE id;
  FOR i IN 1..3 LOOP
    INSERT INTO public.email_log (to_email, kind, subject, status, provider_id) VALUES ('c' || i || '@gmail.com', 'auto_seeker', 'x', 'sent', 'pc-' || i);
    INSERT INTO public.email_contacts (email, audience, status) VALUES ('c' || i || '@gmail.com', 'seeker', 'subscribed');
    PERFORM public.email_provider_event(jsonb_build_object('id', 'cmp-' || i, 'type', 'email.complained', 'data', jsonb_build_object('email_id', 'pc-' || i)));
  END LOOP;
END $$;
SELECT t.ok((SELECT count(*) FROM public.email_contacts WHERE email LIKE 'c_@gmail.com' AND status = 'complained') = 3, 'complaints suppress the addresses');
SELECT t.ok((SELECT NOT enabled AND paused_reason LIKE '%spam complaints%' FROM public.outreach_autopilot WHERE id), 'three complaints in a day pause the autopilot');
INSERT INTO public.email_log (user_id, to_email, kind, subject, status, provider_id) VALUES (t.id('cvonly'), 'cvonly@realmail.com', 'campaign', 'x', 'sent', 'pu-1');
SELECT public.email_provider_event('{"id": "cmp-u", "type": "email.complained", "data": {"email_id": "pu-1"}}');
SELECT t.ok(NOT public.email_allowed(t.id('cvonly'), 'news'), 'a complaint from an account turns News and tips off');
SELECT t.ok(public.email_provider_event('{"id": "evt-x", "type": "email.opened", "data": {"email_id": "prov-1"}}') = 'ignored', 'opens are ignored');

\echo '6. segments'
CREATE TEMP TABLE seg AS
SELECT a, array_agg(e.email ORDER BY e.email) AS who
FROM unnest(ARRAY['free_no_cv', 'cv_not_viewed', 'preview_free', 'starter_pro_intent', 'saved_no_apply']) a,
     LATERAL public.outreach_audience(jsonb_build_object('source', 'accounts', 'accounts', a)) e
GROUP BY a;
SELECT t.ok((SELECT who FROM seg WHERE a = 'free_no_cv') @> ARRAY['nocv@realmail.com', 'saver@realmail.com'] AND NOT (SELECT who FROM seg WHERE a = 'free_no_cv') && ARRAY['anna@realmail.com', 'pro@realmail.com', 'starter@realmail.com'], 'free, no CV');
SELECT t.ok((SELECT who FROM seg WHERE a = 'cv_not_viewed') @> ARRAY['anna@realmail.com'] AND NOT (SELECT who FROM seg WHERE a = 'cv_not_viewed') && ARRAY['preview@realmail.com', 'nocv@realmail.com'], 'CV, matches not viewed');
SELECT t.ok((SELECT who FROM seg WHERE a = 'preview_free') = ARRAY['preview@realmail.com'], 'free preview viewed');
SELECT t.ok((SELECT who FROM seg WHERE a = 'starter_pro_intent') = ARRAY['starter@realmail.com'], 'Starter with an unpaid Pro checkout');
SELECT t.ok((SELECT who FROM seg WHERE a = 'saved_no_apply') = ARRAY['saver@realmail.com'], 'saved jobs, no application');
-- The 3-day cooldown and News and tips.
INSERT INTO public.email_log (user_id, to_email, kind, subject, status) VALUES (t.id('nocv'), 'nocv@realmail.com', 'series', 'x', 'sent');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.outreach_audience('{"source":"accounts","accounts":"free_no_cv"}') WHERE email = 'nocv@realmail.com'), 'emailed by the series 1 day ago → left out for 3 days');
SELECT t.as('saver');
SELECT public.set_email_prefs('{"news":false}');
SELECT t.out();
SELECT t.ok(NOT EXISTS (SELECT 1 FROM public.outreach_audience('{"source":"accounts","accounts":"saved_no_apply"}')), 'News and tips off → left out');

\echo '7. contact audience and import'
SELECT t.ok(public.mv_contact_audience('{}', 'import', NULL, 'info@gmail.com') = 'seeker', 'info@gmail.com is a person');
SELECT t.ok(public.mv_contact_audience('{}', 'import', NULL, 'jobs@acme.com') = 'employer', 'jobs@ on a company domain');
SELECT t.ok(public.mv_contact_audience('{}', 'import', NULL, 'info@acme.com') = 'employer', 'info@ on a company domain, no job title');
SELECT t.ok(public.mv_contact_audience('{}', 'import', 'Product Designer', 'info@acme.com') = 'seeker', 'info@ with a person''s job title');
SELECT t.ok(public.mv_contact_audience('{seeker}', 'import', NULL, 'jobs@acme.com') = 'seeker', 'explicit tag wins over the address');
SELECT t.ok(public.mv_contact_audience('{}', 'import', 'Talent Acquisition Lead', 'maria@gmail.com') = 'employer', 'recruiter title');
SELECT t.as('admin');
SELECT t.ok((public.admin_contacts_import('[{"email":"anna@realmail.com"},{"email":"someone@example.com"}]'))->>'added' = '1', 'a registered account''s address imports; example.com does not');
SELECT t.out();

\echo '8. milestones'
SELECT t.as('anna');
SELECT public.note_milestone('cv_match_viewed');
SELECT public.note_milestone('not_a_milestone');
SELECT t.out();
SELECT t.ok((SELECT count(*) FROM public.user_milestones WHERE user_id = t.id('anna')) = 1, 'known milestones only');
SELECT t.anon();
DO $$ BEGIN PERFORM public.note_milestone('cv_match_viewed'); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT t.out();
SELECT t.ok((SELECT count(*) FROM public.user_milestones) = 2, 'signed-out visitors note nothing');

\echo '9. autopilot: a small daily cap is shared by job seekers and employers'
UPDATE public.email_log SET created_at = now() - interval '5 days';
DELETE FROM public.email_contacts;
INSERT INTO public.email_contacts (email, audience, status, role, role_key)
SELECT 'seek' || g || '@gmail.com', 'seeker', 'subscribed', 'Accountant', 'accountant' FROM generate_series(1, 40) g
UNION ALL SELECT 'jobs@company' || g || '.com', 'employer', 'subscribed', NULL, NULL FROM generate_series(1, 40) g;
UPDATE public.outreach_settings SET enabled = true, daily_cap = 12, reserve = 0;
UPDATE public.outreach_autopilot SET enabled = true, max_mode = true, hour_from = 0, hour_to = 24, paused_reason = NULL;
UPDATE public.email_senders SET active = (from_email LIKE '%@madevisa.com'), for_campaigns = true;
CREATE TEMP TABLE run1 AS SELECT public.run_outreach_autopilot(true) AS j;
SELECT t.ok((SELECT (j->'sent'->>'seeker')::int > 0 AND (j->'sent'->>'employer')::int > 0 FROM run1), 'both audiences get emails under a small cap: ' || (SELECT j::text FROM run1));
SELECT t.ok((SELECT count(*) FROM public.email_log WHERE kind LIKE 'auto_%' AND created_at > now() - interval '1 minute') <= 12, 'never above the daily cap');
SELECT t.ok((SELECT (j->>'cap_reached')::boolean FROM run1), 'cap noted for the admin alert');

\echo 'all email growth tests passed'
ROLLBACK;
