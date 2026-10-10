-- Tests for 20261218090000_email_finder_and_names.sql. Scratch database only (psql), never the live one:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/email_finder.test.sql
BEGIN;
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO authenticated, anon;
CREATE TABLE t.ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON t.ids TO authenticated, anon;
CREATE FUNCTION t.id(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT v FROM t.ids WHERE k = $1 $$;
CREATE FUNCTION t.as(k text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', t.id(k)::text, true); SET LOCAL ROLE authenticated; END $$;
CREATE FUNCTION t.out() RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', '', true); RESET ROLE; END $$;
CREATE FUNCTION t.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF; RAISE NOTICE 'ok: %', what; END $$;

INSERT INTO t.ids VALUES ('admin', gen_random_uuid()), ('free', gen_random_uuid()), ('acme', gen_random_uuid()), ('beta', gen_random_uuid());
INSERT INTO auth.users (id, email, email_confirmed_at) SELECT v, k || '@example.com', now() FROM t.ids WHERE k IN ('admin', 'free');
INSERT INTO public.profiles (id, email, full_name) VALUES (t.id('admin'), 'admin@example.com', 'oqtay quliyev'), (t.id('free'), 'free@example.com', 'free@example.com')
ON CONFLICT (id) DO UPDATE SET full_name = excluded.full_name;
UPDATE public.profiles SET role = 'admin' WHERE id = t.id('admin');
INSERT INTO public.program_publishers (id, org_type, name, verification_status, website, contact_email) VALUES
  (t.id('acme'), 'company', 'Acme', 'verified', 'https://www.acmecorp.de/', 'jobs@acmecorp.de'),
  (t.id('beta'), 'company', 'Beta', 'verified', 'https://betaworks.com', 'hello@madevisa.com');
INSERT INTO public.sponsored_jobs (publisher_id, title, category, status, released_at, description)
VALUES (t.id('acme'), 'Nurse', 'Full time', 'published', now(), 'Questions? Contact: Anna Müller, anna.mueller@acmecorp.de. No-reply: noreply@acmecorp.de');
UPDATE public.sponsored_jobs SET awaiting_release = false;

\echo '1. names'
SELECT t.ok(public.mv_first_name('HR Team') IS NULL AND public.mv_first_name('anna müller') = 'Anna' AND public.mv_first_name('Acme GmbH') IS NULL, 'first names');
SELECT t.ok(public.mv_fill_name('{{first_name}}, let MadeVisa apply', NULL) = 'Let MadeVisa apply', 'name opening a sentence');
SELECT t.ok(public.mv_fill_name('Thanks, {{first_name}}!', NULL) = 'Thanks!', 'name addressed mid-sentence');
SELECT t.ok(public.mv_fill_name('Thanks, {{first_name}}!', 'Anna') = 'Thanks, Anna!', 'known name kept');

\echo '2. rendering'
-- Unknown name: no greeting, subject without the name, no leftover commas.
CREATE TEMP TABLE r1 AS SELECT public.mv_render_template('nurture_1', 'info@acmecorp.de', 'Info Team') AS r;
SELECT t.ok((SELECT r->>'subject' FROM r1) = 'Let MadeVisa apply to jobs for you this month', 'subject without a name');
SELECT t.ok((SELECT r->>'html' FROM r1) NOT LIKE '%Hi there%' AND (SELECT r->>'html' FROM r1) NOT LIKE '%Hi Info%', 'no greeting when the name is unknown');
SELECT t.ok((SELECT r->>'first_name' FROM r1) IS NULL, 'first_name null');
-- Known name.
CREATE TEMP TABLE r2 AS SELECT public.mv_render_template('nurture_1', 'x@y.com', 'ANNA LEE') AS r;
SELECT t.ok((SELECT r->>'subject' FROM r2) = 'Anna, let MadeVisa apply to jobs for you this month', 'subject with the name');
SELECT t.ok((SELECT r->>'html' FROM r2) LIKE '%Hi Anna,%', 'greeting with the name');
SELECT t.ok((SELECT r->>'text' FROM r2) LIKE 'Hi Anna,%', 'text version greets too');
-- An account whose profile "name" is an email address.
SELECT t.ok(public.mv_render_template('promo_cv', 'free@example.com')->>'subject' !~* '^free', 'email-like profile name not used');

\echo '3. preview both ways'
SELECT t.as('admin');
SELECT t.ok(public.admin_template_preview('nurture_1')->>'subject' LIKE 'Oqtay, %', 'preview named (admin name, capitalised)');
SELECT t.ok(public.admin_template_preview('nurture_1', 'unknown')->>'subject' LIKE 'Let MadeVisa%', 'preview unknown');
SELECT t.out();

\echo '4. find emails: job ads + company profiles'
SELECT t.as('free');
DO $$ BEGIN PERFORM public.admin_finder_collect(); RAISE EXCEPTION 'should fail'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%admins%' THEN RAISE; END IF; END $$;
SELECT t.out();
SELECT t.as('admin');
SELECT t.ok((public.admin_finder_overview()->>'from_ads')::int = 1, 'one address in ads (no-reply left out)');
SELECT t.ok((public.admin_finder_overview()->>'from_profiles')::int = 1, 'one profile address (MadeVisa default left out)');
CREATE TEMP TABLE c1 AS SELECT public.admin_finder_collect() AS r;
SELECT t.ok((SELECT r FROM c1) = '{"from_ads": 1, "from_profiles": 1}'::jsonb, 'collected 1 + 1');
SELECT t.ok((SELECT r FROM c1) = '{"from_ads": 1, "from_profiles": 1}'::jsonb AND (public.admin_finder_collect()) = '{"from_ads": 0, "from_profiles": 0}'::jsonb, 'second click adds nothing');
SELECT t.out();
SELECT t.ok((SELECT name FROM public.email_contacts WHERE email = 'anna.mueller@acmecorp.de') = 'Anna Müller', 'name from the ad');
SELECT t.ok((SELECT source FROM public.email_contacts WHERE email = 'anna.mueller@acmecorp.de') = 'found: job ad', 'source');
SELECT t.ok((SELECT tags FROM public.email_contacts WHERE email = 'jobs@acmecorp.de') @> ARRAY['found-online', 'employer'], 'tags');
SELECT t.ok((SELECT consent FROM public.email_contacts WHERE email = 'jobs@acmecorp.de') LIKE 'Published publicly: company profile of Acme%', 'where it was found');

\echo '5. find emails: websites'
SELECT t.as('admin');
CREATE TEMP TABLE q1 AS SELECT public.admin_finder_queue(8) AS r;
SELECT t.ok(jsonb_array_length((SELECT r FROM q1)) = 2, 'two sites to read');
SELECT t.ok((SELECT r->0->>'domain' FROM q1) = 'acmecorp.de', 'company with live jobs first, www. dropped');
SELECT t.ok(jsonb_array_length(public.admin_finder_queue(8)) = 0, 'sites being read are not handed out twice');
-- An address that unsubscribed earlier must not come back.
SELECT public.admin_contacts_import('[{"email":"press@betaworks.com"}]');
SELECT t.out();
INSERT INTO t.ids SELECT 'press', id FROM public.email_contacts WHERE email = 'press@betaworks.com';
SELECT t.as('admin');
SELECT public.admin_contacts_update(ARRAY[t.id('press')], 'unsubscribe');
CREATE TEMP TABLE s1 AS SELECT public.admin_finder_save('[
  {"url":"https://www.acmecorp.de/","domain":"acmecorp.de","pages":4,"emails":[{"email":"karriere@acmecorp.de","page":"https://www.acmecorp.de/karriere"},{"email":"max.schmidt@acmecorp.de"},{"email":"logo@2x.png"},{"email":"jobs@acmecorp.de"}]},
  {"url":"https://betaworks.com","pages":1,"emails":[{"email":"press@betaworks.com"}]},
  {"url":"https://gammalabs.io","pages":0,"error":"timeout","emails":[]}
]'::jsonb) AS r;
SELECT t.ok((SELECT (r->>'added')::int FROM s1) = 2, 'two new (junk, existing and unsubscribed left out)');
SELECT t.out();
SELECT t.ok((SELECT status FROM public.email_contacts WHERE email = 'press@betaworks.com') = 'unsubscribed', 'unsubscribed stays unsubscribed');
SELECT t.ok((SELECT name FROM public.email_contacts WHERE email = 'max.schmidt@acmecorp.de') = 'Max Schmidt', 'name from first.last address');
SELECT t.ok((SELECT name FROM public.email_contacts WHERE email = 'karriere@acmecorp.de') IS NULL, 'no name for a role inbox');
SELECT t.ok((SELECT consent FROM public.email_contacts WHERE email = 'karriere@acmecorp.de') LIKE '%acmecorp.de/karriere%', 'page recorded');
SELECT t.ok((SELECT status FROM public.email_finder_sites WHERE domain = 'acmecorp.de') = 'done', 'site done');
SELECT t.ok((SELECT status FROM public.email_finder_sites WHERE domain = 'gammalabs.io') = 'failed', 'pasted site that failed is recorded');
SELECT t.as('admin');
SELECT t.ok((public.admin_finder_overview()->>'sites_left')::int = 0, 'nothing left to read');
SELECT t.ok((public.admin_finder_overview()->>'found_total')::int = 4, 'four found contacts');

\echo '6. campaigns only include found contacts when their tag is picked'
SELECT public.admin_contacts_import('[{"email":"fan@gmail.com","name":"Lena"}]', ARRAY['newsletter'], 'event', 'Signed up');
SELECT t.ok((public.admin_audience_count('{"source":"contacts"}')->>'total')::int = 2, 'no tag: only opted-in contacts (Lena + the admin from the preview), none of the 4 found');
SELECT t.ok((public.admin_audience_count('{"source":"contacts","tags":["employer"]}')->>'total')::int = 4, 'tag employer: the found contacts');
SELECT t.ok((public.admin_audience_count('{"source":"contacts","tags":["newsletter"]}')->>'total')::int = 1, 'other tag: not the found ones');
SELECT t.out();

\echo '7. email to a found address'
CREATE TEMP TABLE r3 AS SELECT public.mv_render_template('promo_employers', c.email, c.name, NULL, c.token) AS r FROM public.email_contacts c WHERE c.email = 'karriere@acmecorp.de';
SELECT t.ok((SELECT r->>'html' FROM r3) LIKE '%published as a company or hiring contact%', 'honest reason in the footer');
SELECT t.ok((SELECT r->>'html' FROM r3) NOT LIKE '%Your MadeVisa dashboard%', 'no job-seeker dashboard link');
SELECT t.ok((SELECT r->>'html' FROM r3) LIKE '%Unsubscribe%', 'unsubscribe link');
SELECT t.ok((SELECT r->>'html' FROM r3) NOT LIKE '%Hi %,%', 'no greeting for a role inbox');
CREATE TEMP TABLE r4 AS SELECT public.mv_render_template('promo_employers', c.email, c.name, NULL, c.token) AS r FROM public.email_contacts c WHERE c.email = 'anna.mueller@acmecorp.de';
SELECT t.ok((SELECT r->>'html' FROM r4) LIKE '%Hi Anna,%', 'greeting when the ad named her');

\echo 'ALL PASSED'
ROLLBACK;
