/* ============================================================================
   Email growth system: rewritten copy, lifecycle segments, A/B variants,
   attribution and provider events.

   1. TEMPLATE LIBRARY (email_template_library)
      MadeVisa's own version of every template, with what it is for (meta:
      audience, conversion event, exclusions, A/B idea). email_templates stays
      the source of truth for sending and keeps its schema, so the editor keeps
      working. On this migration:
        • a template still exactly as shipped (fingerprint matches a known
          shipped version) is replaced by the new copy, after a backup;
        • a template an admin edited is NOT touched. Admin → Templates shows
          "New MadeVisa version available" with Preview / Use it / Keep mine;
        • missing templates (the new lifecycle ones) are added.
      Every replaced row is saved in email_template_backups first, so it can be
      restored (admin_template_restore).

   2. A/B VARIANTS (email_template_variants)
      An optional variant B per template (subject, preheader, eyebrow,
      headline, body, button). Off until an admin switches it on. Who gets B is
      decided by a hash of the address and the template key, so the same person
      always sees the same variant.

   3. ATTRIBUTION (no personal data in links)
      Each campaign, series and autopilot email gets a random token (mt=) and
      its template and variant (mc=key.variant) on its button and job links.
      The website reports the first click (email_click), links it to the
      account when the person signs in (email_attr_claim), and notes anonymous
      events such as an employer listing (email_touch_event). Purchases come
      from Gumroad checkouts that a Gumroad notification confirmed
      (gumroad_checkouts.used_at), never from a redirect. admin_email_report
      shows the funnel per template and variant, cold and lifecycle apart.

   4. PROVIDER EVENTS (Resend webhook → email_provider_event)
      Delivered, bounced, complained and clicked, matched by Resend's email id
      (now kept in email_log.provider_id). A hard bounce suppresses the
      address and counts toward the autopilot's bounce brake; a complaint
      suppresses marketing to it and pauses the autopilot when several arrive.

   5. SEGMENTS (campaign audience → accounts)
      free_no_cv · cv_not_viewed · preview_free · starter_pro_intent ·
      saved_no_apply, with a 3-day cooldown across all marketing email.
      Milestones the segments need (CV match viewed, pricing viewed, Pro prompt
      clicked) are noted by the website through note_milestone().

   6. CONTACT AUDIENCE: a generic inbox (info@, hello@ …) only counts as an
      employer on a company domain, never on Gmail, Yahoo and the like. Only new
      imports and contacts without an audience are classified; existing
      contacts keep theirs.

   Nothing here sends email, changes sender limits or touches contacts'
   statuses.
   ========================================================================== */

-- ===========================================================================
-- 0. Helpers
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mv_template_hash(p_subject text, p_preheader text, p_eyebrow text, p_headline text, p_body text, p_cta_label text, p_cta_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(concat_ws(E'\x1f', p_subject, coalesce(p_preheader, ''), coalesce(p_eyebrow, ''), p_headline, p_body, p_cta_label, p_cta_url));
$$;

/* "214 jobs" / "1 job". */
CREATE OR REPLACE FUNCTION public.mv_count_noun(p_n integer, p_one text, p_many text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT to_char(coalesce(p_n, 0), 'FM999,999') || ' ' || CASE WHEN coalesce(p_n, 0) = 1 THEN p_one ELSE p_many END $$;

-- ===========================================================================
-- 1. Template library, backups
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.email_template_library (
  key text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  audience text NOT NULL,
  subject text NOT NULL,
  preheader text,
  eyebrow text,
  headline text NOT NULL,
  body text NOT NULL,
  cta_label text NOT NULL,
  cta_url text NOT NULL,
  show_stats boolean NOT NULL DEFAULT false,
  -- Fingerprints of earlier MadeVisa versions: a template matching one was never edited.
  replaces text[] NOT NULL DEFAULT '{}',
  -- {audience, conversion, exclusions, ab_test, goal}
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_template_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_template_library FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.email_template_backups (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  row jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_template_backups_key_idx ON public.email_template_backups (key, created_at DESC);
ALTER TABLE public.email_template_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_template_backups FROM anon, authenticated;

-- Lifecycle templates for accounts are sent as campaigns (audience 'accounts').
INSERT INTO public.email_template_library (key, version, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats, replaces, meta) VALUES

-- ---------------------------------------------------------------- employers (cold)
('auto_employer_1', 2, 'Autopilot · employers 1 — free listing', 'autopilot',
 $s${{company}}: a free listing for international hires$s$,
 $s$Post a role for free, or we add roles from your careers page. Candidates check their CV fit first.$s$,
 'For hiring teams',
 $s$Some of your best candidates live in another country$s$,
 $b$Hiring across borders has two hard parts: reaching people who would actually move, and spotting the ones who fit. MadeVisa works on both. **{{jobs_live}} live jobs** are on it today, read by people looking to work in another country.

- [briefcase] Post a role for free, or we list it from your careers page
- [target] Candidates compare their CV with your job before they apply
- [plane] You say whether you sponsor visas, so expectations are clear from the start

Not the right inbox? Forward this to whoever handles hiring, or unsubscribe below.$b$,
 'Post a job for free', 'https://madevisa.com/submit-job', false,
 ARRAY['8cdb5e7a97922bae9316ccef342178e4'],
 jsonb_build_object(
   'goal', 'Free employer listings',
   'audience', 'Imported employer contacts (audience = employer), autopilot step 1',
   'conversion', 'Employer listing submitted (email_touch_event listing_submitted)',
   'exclusions', 'Registered users; unsubscribed, bounced or complained contacts; anyone emailed in the last 3 days; junk or role-less free-mail inboxes stay seekers',
   'ab_test', 'Free listing convenience (A) vs international candidate relevance (B), on the subject, preheader and headline')),

('auto_employer_2', 2, 'Autopilot · employers 2 — sponsored listing', 'autopilot',
 $s${{company}}: when one role needs more eyes$s$,
 $s$A Sponsored listing: $149 for 30 days at the top of MadeVisa. Nothing is charged before approval.$s$,
 'For hiring teams',
 $s$When one role needs more than a free listing$s$,
 $b$Free listings work for most roles. For the one that has been open too long there is a **Sponsored listing**: **$149** keeps it at the top of the MadeVisa jobs page and homepage for **30 days**, clearly labelled Sponsored.

- [clock] Reviewed within a day, and nothing is charged before approval
- [send] Optional: add it to our LinkedIn, Instagram and Facebook job posts for $49 more
- [shield] Paying never changes company scores or how other jobs rank

This is the last email we'll send to this address. If hiring abroad becomes a priority later, the page below has the details.$b$,
 'See sponsored listing options', 'https://madevisa.com/pricing#employers', false,
 ARRAY['2c49a321c69c8f5c78e6005d02ba5a6a'],
 jsonb_build_object(
   'goal', 'Sponsored listing purchase',
   'audience', 'Employer contacts who got step 1 at least 7 days ago',
   'conversion', 'Sponsored listing request (manual billing: listing_submitted / plan request)',
   'exclusions', 'As step 1; the final automated employer email',
   'ab_test', '30-day sponsored visibility (A) vs optional social exposure (B)')),

-- ---------------------------------------------------------------- job seekers (cold)
('auto_seeker_1', 2, 'Autopilot · seekers 1 — jobs for your role', 'autopilot',
 $s${{first_name}}, {{role}} jobs abroad, straight from employers$s$,
 $s${{role_jobs}} live right now, from company career pages in 30+ countries.$s$,
 'Jobs abroad',
 $s${{role_title}} jobs in 30+ countries, in one place$s$,
 $b$Jobs abroad are scattered across hundreds of career pages, and few ads say whether they sponsor visas. MadeVisa collects them in one place and marks sponsorship when the ad states it.

Live {{role}} jobs right now: **{{role_jobs}}**. The newest:

[[jobs]]

- [search] Filter by country, remote and visa sponsorship
- [bell] Set a free job alert and new {{role}} roles come to you$b$,
 'See {{role}} jobs', 'https://madevisa.com/jobs', false,
 ARRAY['a5deda7357807a632ca1c1a73aa6d6f5'],
 jsonb_build_object(
   'goal', 'Qualified job discovery sessions',
   'audience', 'Imported job seeker contacts (audience = seeker), autopilot step 1; role from their job title',
   'conversion', 'Click to the role-filtered jobs page, then registration',
   'exclusions', 'Registered users; unsubscribed, bounced or complained contacts; anyone emailed in the last 3 days',
   'ab_test', 'Role inventory hook (A) vs visa transparency hook (B)')),

('auto_seeker_2', 2, 'Autopilot · seekers 2 — CV match', 'autopilot',
 $s${{first_name}}, which {{role}} jobs actually fit your CV?$s$,
 $s$Upload it to a free account and see your match score, skill by skill.$s$,
 'CV match',
 $s$Job ads abroad all sound alike. Your CV can tell them apart.$s$,
 $b$Every {{role}} ad abroad asks for something slightly different: a tool, a certificate, five years instead of three. Checking that by hand, ad by ad, is where job hunts stall.

CV match makes the comparison for you:

- [target] Free: create an account, upload your CV and see 3 matches with your score (the top one stays partly hidden)
- [chart] Starter ($2.99 a month): every match ranked, and the full report on each job
- [file] A sponsorship document for a job that needs a visa: 1 a month free

A free account takes about a minute. No card needed.$b$,
 'Check my CV', 'https://madevisa.com/cv-match', false,
 ARRAY['5f7fdbe0228d2e26397c7da3c443184f'],
 jsonb_build_object(
   'goal', 'Registration and CV upload',
   'audience', 'Seeker contacts who got step 1 at least 7 days ago',
   'conversion', 'Registration, then CV uploaded',
   'exclusions', 'As step 1',
   'ab_test', 'CV match curiosity (A) vs practical job fit (B)')),

('auto_seeker_3', 2, 'Autopilot · seekers 3 — visa sponsorship', 'autopilot',
 $s${{role_title}} jobs where the ad mentions visa sponsorship$s$,
 $s${{role_visa}} live right now. A last note from us, then we stop.$s$,
 'Visa sponsorship',
 $s$Most job ads never mention visas. These do.$s$,
 $b$If you need sponsorship, most job ads waste your time: they don't say either way. MadeVisa flags the ones where the employer states it in writing.

Live {{role}} jobs that mention visa sponsorship: **{{role_visa}}**.

[[jobs]]

A listing that mentions sponsorship is a good sign, not a guarantee. The employer still decides, and each country's visa rules still apply.

This is our last email. To hear about new ones, set a free job alert and only the roles you choose will reach you.$b$,
 'See visa sponsored jobs', 'https://madevisa.com/jobs?visa=1', false,
 ARRAY['14ed592fa5fa706434bf62fd81d2d697'],
 jsonb_build_object(
   'goal', 'Capture candidates who need sponsorship',
   'audience', 'Seeker contacts who got step 2 at least 7 days ago; falls back to all roles when theirs has no sponsored job',
   'conversion', 'Click to visa-sponsored jobs, then registration',
   'exclusions', 'As step 1; the final automated seeker email',
   'ab_test', 'None planned')),

-- ---------------------------------------------------------------- Auto Apply series (accounts)
('nurture_1', 2, 'Pro series · 1 — Meet Auto Apply', 'series',
 $s${{first_name}}, meet the Pro feature that does the paperwork$s$,
 $s$Auto Apply tailors your CV to each job you pick, then sends it or hands it to you ready to send.$s$,
 'MadeVisa Pro',
 $s$Auto Apply: you choose the jobs, it does the paperwork$s$,
 $b${{cv_line}}

Finding the right jobs is half the work. The other half is tailoring a CV and a cover letter for each one. **Auto Apply** takes on that half. It is part of **MadeVisa Pro ($8.99 a month)**:

- 1. Choose your roles, countries and the lowest match score you'd accept
- 2. Answer the usual application questions once
- 3. For each job, MadeVisa prepares a CV tailored to it, plus a cover letter when one helps
- 4. Where the employer takes applications through MadeVisa, it is sent for you. Everywhere else, you get it ready to send

You see every application, and employers reply straight to you.$b$,
 'Explore Pro and Auto Apply', 'https://madevisa.com/pricing?s=aa1#pro', false,
 ARRAY['5c0455608acde9597838a95226b8858d'],
 jsonb_build_object(
   'goal', 'Introduce Auto Apply, qualify for Pro',
   'audience', 'Confirmed accounts older than 2 days, not on Pro, never started Auto Apply',
   'conversion', 'Pro checkout started, Pro purchase',
   'exclusions', 'Pro members; anyone who started Auto Apply; News and tips or all emails off; unsubscribed or bounced; a campaign in the last 3 days',
   'ab_test', 'Workflow simplicity (A) vs control and transparency (B)')),

('nurture_2', 2, 'Pro series · 2 — skip the repetition', 'series',
 $s${{first_name}}, tailoring a CV for every job gets old fast$s$,
 $s$Pro's Auto Apply does the tailoring and keeps a record of everything that goes out.$s$,
 'MadeVisa Pro',
 $s$Rewriting the same CV again? Let Pro do it.$s$,
 $b${{cv_line}}

Most of applying abroad is repetition: reordering the same CV for a new ad, rewording the same cover letter, retyping the same answers. It is slow, and it is why good jobs get skipped.

With Auto Apply in Pro, the repetition is handled for you:

- [file] A CV tailored to each job, built only from what your CV says
- [mail] A cover letter when the job calls for one
- [send] Sent for you where the employer accepts applications through MadeVisa, ready to send yourself everywhere else
- [list] One list of what was sent, where and when

Pro is $8.99 a month and includes everything in Starter.$b$,
 'See what Pro includes', 'https://madevisa.com/pricing?s=aa2#pro', false,
 ARRAY['ea0a93025492af5f5bab6a57681d9874'],
 jsonb_build_object(
   'goal', 'Overcome the effort objection, Pro upgrade',
   'audience', 'As nurture_1, after the set gap',
   'conversion', 'Pro checkout started, Pro purchase',
   'exclusions', 'As nurture_1',
   'ab_test', 'None planned')),

('nurture_3', 2, 'Pro series · 3 — everything in Pro', 'series',
 $s$Pro in one email: what $8.99 a month gets you$s$,
 $s$Auto Apply, full CV match reports and 50 sponsorship documents a month. The last email in this series.$s$,
 'Last email in this series',
 $s$Everything Pro adds, in one place$s$,
 $b${{cv_line}}

Here is what **MadeVisa Pro** includes for **$8.99 a month**:

- [zap] **Auto Apply**: tailored CVs and cover letters, sent where MadeVisa can submit and ready to send everywhere else
- [chart] The full CV match report on every job: missing skills, experience wanted, nice-to-haves
- [target] All your matches ranked, not just three
- [file] 50 sponsorship documents a month (Starter has 20, Free has 1)
- [bell] Up to 10 job alerts, and 10 jobs in each Jobs for you email

If you only need the full reports, Starter at $2.99 a month covers them. Either way, the free plan stays free.

This is the last email in this series.$b$,
 'Get Pro', 'https://madevisa.com/pricing?s=aa3#pro', false,
 ARRAY['4ce8e28eb1d5325a22b0da166fd37ebf'],
 jsonb_build_object(
   'goal', 'Final respectful Pro conversion',
   'audience', 'As nurture_1, after the set gap',
   'conversion', 'Pro purchase (Starter purchase as secondary)',
   'exclusions', 'As nurture_1',
   'ab_test', 'Full Pro value (A) vs Auto Apply first (B)')),

-- ---------------------------------------------------------------- campaigns
('promo_auto_apply', 2, 'Campaign · Auto Apply (Pro)', 'anyone',
 $s$Auto Apply: your CV, tailored to each job you pick$s$,
 $s$A MadeVisa Pro feature, $8.99 a month. Sent for you where supported, ready to send everywhere else.$s$,
 'Auto Apply · Pro',
 $s$Spend your time choosing jobs, not formatting CVs$s$,
 $b$Tailoring a CV and a cover letter for each job is the slowest part of applying abroad. **Auto Apply**, part of **MadeVisa Pro**, does that part:

- [target] You set the roles, countries and minimum match score
- [file] It prepares a CV tailored to each job, plus a cover letter when one helps
- [send] It submits where the employer takes applications through MadeVisa, and gives you a ready-to-send application everywhere else
- [pause] You can pause or stop it any time

Pro is **$8.99 a month**, includes everything in Starter, and is the plan Auto Apply needs. **{{jobs_live}} live jobs** are on MadeVisa today to match against.$b$,
 'Explore Auto Apply', 'https://madevisa.com/pricing?s=cmp#pro', true,
 ARRAY['d5b7d67593ff317d8af7dc975f14e7fe'],
 jsonb_build_object(
   'goal', 'Pro subscriptions',
   'audience', 'Accounts → Have a CV (or Starter with Pro intent); not Pro',
   'conversion', 'Pro checkout started, Pro purchase',
   'exclusions', 'Pro members (pick "Have a CV" or "Starter, Pro intent"), News and tips off, campaign skip window, 3-day cooldown',
   'ab_test', 'None planned')),

('promo_cv', 2, 'Campaign · CV match', 'anyone',
 $s${{first_name}}, new jobs landed today. Which ones fit you?$s$,
 $s${{jobs_today}} added in the last 24 hours. A free account shows how your CV compares.$s$,
 'CV match',
 $s$Fresh jobs are only useful if they fit$s$,
 $b$New on MadeVisa in the last 24 hours: **{{jobs_today}}**. Live in total: **{{jobs_live}}**, and **{{jobs_visa}}** of those state visa sponsorship in the ad.

The question is which of them fit you. Create a free account, upload your CV, and CV match compares it with live jobs:

- [target] Free: 3 matches with your score (the top one stays partly hidden)
- [chart] Starter, $2.99 a month: every match ranked, plus the full report on each job: missing skills, experience wanted, nice-to-haves
- [file] Sponsorship documents on every plan: 1 a month free, 20 on Starter, 50 on Pro

Uploading takes about a minute. You need a free account to upload a CV.$b$,
 'Create my CV match', 'https://madevisa.com/cv-match?s=cmp', true,
 ARRAY['c6bfe775a5768968c840767eca77ba15'],
 jsonb_build_object(
   'goal', 'Registration and CV upload',
   'audience', 'Contacts (seekers) or Accounts → No CV yet',
   'conversion', 'Registration, CV uploaded',
   'exclusions', 'Accounts that already have a CV, News and tips off, campaign skip window, 3-day cooldown',
   'ab_test', 'Personal job inventory (A) vs CV matching benefit (B)')),

('promo_employers', 2, 'Campaign · for employers', 'anyone',
 $s$Hiring internationally? List the role on MadeVisa for free$s$,
 $s$Or we add roles from your careers page. Candidates check their CV fit before they apply.$s$,
 'For hiring teams',
 $s$A free place for roles open to international candidates$s$,
 $b$MadeVisa is a job board for people looking to work in another country: **{{jobs_live}} live jobs** today, collected from company career pages in 30+ countries.

- [briefcase] Post a role for free, or send us your careers page and we list your open roles
- [target] Candidates compare their CV with your job before applying, so they can judge the fit first
- [plane] Say whether you sponsor visas, and candidates know where they stand from the first line

Wrong inbox? Forward this to whoever handles hiring, or unsubscribe below.$b$,
 'Post a job for free', 'https://madevisa.com/submit-job', false,
 ARRAY['c9485862de6cc2f7ed0c324f67bcbd41'],
 jsonb_build_object(
   'goal', 'Free employer listings',
   'audience', 'Contacts tagged employer / found online',
   'conversion', 'Employer listing submitted',
   'exclusions', 'Seekers and accounts, unsubscribed or bounced, campaign skip window, 3-day cooldown',
   'ab_test', 'None planned')),

('promo_fresh_jobs', 2, 'Campaign · new jobs today', 'anyone',
 $s$Since yesterday: new jobs, and which ones fit you$s$,
 $s${{jobs_today}} added in the last 24 hours. See them early, then see which match your CV.$s$,
 'New today',
 $s$Spot new roles early, and decide on them calmly$s$,
 $b$Added in the last 24 hours: **{{jobs_today}}**. Live in total: **{{jobs_live}}**, and **{{jobs_visa}}** of those state visa sponsorship.

Seeing a role early gives you time to read it properly, check the visa side and tailor your CV, instead of rushing it. CV match sorts the new ones for you:

- [target] Upload your CV to a free account and see which jobs match it
- [chart] Starter ($2.99 a month) shows the full report and ranks every match
- [zap] Pro ($8.99 a month) adds Auto Apply, which prepares tailored applications for the jobs you choose$b$,
 'Find my matching jobs', 'https://madevisa.com/cv-match?s=cmp', false,
 ARRAY['2d7f76d43342e7d52cfb5841ae98629a'],
 jsonb_build_object(
   'goal', 'Turn new jobs into CV match activity',
   'audience', 'Accounts → Have a CV, or seeker contacts',
   'conversion', 'CV match viewed, CV uploaded',
   'exclusions', 'News and tips off, campaign skip window, 3-day cooldown',
   'ab_test', 'None planned')),

-- ---------------------------------------------------------------- lifecycle (accounts, sent as campaigns)
('life_no_cv', 1, 'Lifecycle · registered, no CV', 'accounts',
 $s${{first_name}}, the jobs are here. Now add your CV.$s$,
 $s$Searching shows you what's out there. Your CV shows which of it fits.$s$,
 'Next step',
 $s$Finding jobs is step one. Knowing which fit is step two.$s$,
 $b$Your MadeVisa account has no CV on it yet, so every job looks equally likely. Upload one and CV match compares it with **{{jobs_live}} live jobs**:

- [target] Your match score on the jobs you look at, and 3 matches shown on the free plan
- [puzzle] On Starter, the full report: missing skills, experience wanted, nice-to-haves
- [file] A sponsorship document for a job that needs a visa (1 a month free)

It takes about a minute. PDF and Word files both work.$b$,
 'Upload my CV', 'https://madevisa.com/cv-match?s=lc_cv', false,
 '{}',
 jsonb_build_object(
   'goal', 'CV upload',
   'audience', 'Campaign → Accounts → Free, no CV yet',
   'conversion', 'CV uploaded',
   'exclusions', 'Anyone with a CV, paid plans, News and tips off, 3-day cooldown',
   'ab_test', 'None planned')),

('life_cv_ready', 1, 'Lifecycle · CV uploaded, matches not viewed', 'accounts',
 $s$Your CV is on MadeVisa. Have you seen your matches?$s$,
 $s$The next step is the match list, one click away.$s$,
 'CV match',
 $s$Your CV is uploaded. Your matches are one click away.$s$,
 $b${{cv_line}}

Open CV match to see:

- [target] Your matches, scored against your CV
- [search] Why each score is what it is, so you can decide which jobs are worth your time
- [bell] A job alert, if you'd rather have new matches come to you

On the free plan you see 3 matches. Starter shows all of them, with the full report.$b$,
 'See my matches', 'https://madevisa.com/cv-match?s=lc_view', false,
 '{}',
 jsonb_build_object(
   'goal', 'Open CV match',
   'audience', 'Campaign → Accounts → CV uploaded, matches not viewed',
   'conversion', 'CV match viewed',
   'exclusions', 'Anyone who opened CV match or checked a job match, News and tips off, 3-day cooldown',
   'ab_test', 'None planned')),

('life_starter_upgrade', 1, 'Lifecycle · free preview seen → Starter', 'accounts',
 $s${{first_name}}, you've seen 3 matches. Starter shows the rest.$s$,
 $s$Every match ranked and the full report on each job, for $2.99 a month.$s$,
 'Starter',
 $s$The free preview is a starting point$s$,
 $b$The free plan shows 3 of your matches, with the top one partly hidden. That is enough to see whether CV match is useful. **Starter** is for actually choosing between jobs:

- [list] All your matches, ranked, with the top one visible
- [chart] The full report on every job: missing skills, experience wanted, nice-to-haves
- [file] 20 sponsorship documents a month instead of 1
- [bell] Up to 5 job alerts and unlimited saved jobs

Starter is **$2.99 a month**. Pro ($8.99) adds Auto Apply, if you'd also like applications prepared for you.$b$,
 'Compare Starter and Pro', 'https://madevisa.com/pricing?s=lc_starter', false,
 '{}',
 jsonb_build_object(
   'goal', 'Starter purchase',
   'audience', 'Campaign → Accounts → Free, viewed CV match',
   'conversion', 'Starter checkout started, Starter purchase',
   'exclusions', 'Starter and Pro members, News and tips off, 3-day cooldown',
   'ab_test', 'None planned')),

('life_pro_upgrade', 1, 'Lifecycle · Starter with Pro intent → Pro', 'accounts',
 $s${{first_name}}, what Pro adds on top of Starter$s$,
 $s$Auto Apply, 50 sponsorship documents and 10 job alerts, for $6 a month more.$s$,
 'MadeVisa Pro',
 $s$You already have the reports. Pro prepares the applications.$s$,
 $b$As a Starter member you already have full CV match reports and ranked matches. Pro keeps all of that and adds:

- [zap] **Auto Apply**: a CV tailored to each job you choose and a cover letter when one helps, sent where MadeVisa can submit and ready to send everywhere else
- [file] 50 sponsorship documents a month instead of 20
- [bell] Up to 10 job alerts instead of 5, and 10 jobs in each Jobs for you email

Pro is **$8.99 a month**. Your CV, alerts and saved jobs stay as they are.$b$,
 'See what Pro adds', 'https://madevisa.com/pricing?s=lc_pro#pro', false,
 '{}',
 jsonb_build_object(
   'goal', 'Pro purchase',
   'audience', 'Campaign → Accounts → Starter with Pro intent (unpaid Pro checkout in 30 days, 15+ documents used this month, or a Pro prompt clicked)',
   'conversion', 'Pro checkout started, Pro purchase',
   'exclusions', 'Pro members, free users, News and tips off, 3-day cooldown',
   'ab_test', 'None planned')),

('life_saved_jobs', 1, 'Lifecycle · saved jobs, no application', 'accounts',
 $s${{first_name}}, the jobs you saved are still on your list$s$,
 $s$A quick look back at what you saved on MadeVisa.$s$,
 'Saved jobs',
 $s$The jobs you saved, in one place$s$,
 $b$You saved these on MadeVisa:

[[saved_jobs]]

Saving a job is the easy part. Before applying, check how your CV matches it and whether the role needs a visa, so you know where to put your effort.

- [target] Check your match score on each saved job
- [file] Create a sponsorship document for one that needs a visa$b$,
 'Open my saved jobs', 'https://madevisa.com/profile?s=lc_saved', false,
 '{}',
 jsonb_build_object(
   'goal', 'Return to the shortlist',
   'audience', 'Campaign → Accounts → Saved jobs, no application in 14 days',
   'conversion', 'Return visit (click), CV match check, application',
   'exclusions', 'Anyone with an application or new save in the last 14 days, News and tips off, 3-day cooldown',
   'ab_test', 'None planned'))

ON CONFLICT (key) DO UPDATE SET
  version = excluded.version, name = excluded.name, audience = excluded.audience, subject = excluded.subject, preheader = excluded.preheader,
  eyebrow = excluded.eyebrow, headline = excluded.headline, body = excluded.body, cta_label = excluded.cta_label, cta_url = excluded.cta_url,
  show_stats = excluded.show_stats, replaces = excluded.replaces, meta = excluded.meta, updated_at = now();

/* Bring email_templates up to the library where it is safe: missing → add; never edited (fingerprint of a
   shipped version) → back up, then replace; edited by an admin → keep. Returns {added, replaced, kept, current}. */
CREATE OR REPLACE FUNCTION public.mv_template_library_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.email_template_library;
  t public.email_templates;
  h text;
  added text[] := '{}';
  replaced text[] := '{}';
  kept text[] := '{}';
  current text[] := '{}';
BEGIN
  FOR l IN SELECT * FROM public.email_template_library ORDER BY key LOOP
    SELECT * INTO t FROM public.email_templates WHERE key = l.key;
    IF NOT FOUND THEN
      INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats)
      VALUES (l.key, l.name, l.audience, l.subject, l.preheader, l.eyebrow, l.headline, l.body, l.cta_label, l.cta_url, l.show_stats);
      added := added || l.key;
      CONTINUE;
    END IF;
    h := public.mv_template_hash(t.subject, t.preheader, t.eyebrow, t.headline, t.body, t.cta_label, t.cta_url);
    IF h = public.mv_template_hash(l.subject, l.preheader, l.eyebrow, l.headline, l.body, l.cta_label, l.cta_url) THEN
      current := current || l.key;
    ELSIF h = ANY (l.replaces) THEN
      INSERT INTO public.email_template_backups (key, row, reason) VALUES (t.key, to_jsonb(t), 'Replaced by MadeVisa version ' || l.version);
      UPDATE public.email_templates SET name = l.name, subject = l.subject, preheader = l.preheader, eyebrow = l.eyebrow, headline = l.headline,
             body = l.body, cta_label = l.cta_label, cta_url = l.cta_url, show_stats = l.show_stats, updated_at = now()
      WHERE key = l.key;
      replaced := replaced || l.key;
    ELSE
      -- Edited by an admin: left as it is; Admin → Templates offers the new version.
      kept := kept || l.key;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('added', to_jsonb(added), 'replaced', to_jsonb(replaced), 'kept', to_jsonb(kept), 'current', to_jsonb(current));
END;
$$;
REVOKE ALL ON FUNCTION public.mv_template_library_sync() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE r jsonb := public.mv_template_library_sync();
BEGIN
  RAISE NOTICE 'Templates: %', r;
END $do$;

/* Admin: restore the last backup of a template (undo a replacement). */
CREATE OR REPLACE FUNCTION public.admin_template_restore(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.email_template_backups;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM public.email_template_backups WHERE key = p_key ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No earlier version of %.', p_key; END IF;
  INSERT INTO public.email_template_backups (key, row, reason)
  SELECT key, to_jsonb(t), 'Before restoring backup ' || b.id FROM public.email_templates t WHERE key = p_key;
  UPDATE public.email_templates SET
    subject = b.row->>'subject', preheader = b.row->>'preheader', eyebrow = b.row->>'eyebrow', headline = b.row->>'headline', body = b.row->>'body',
    cta_label = b.row->>'cta_label', cta_url = b.row->>'cta_url', show_stats = coalesce((b.row->>'show_stats')::boolean, show_stats), updated_at = now()
  WHERE key = p_key;
  DELETE FROM public.email_template_backups WHERE id = b.id;
  RETURN to_jsonb((SELECT t FROM public.email_templates t WHERE key = p_key));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_restore(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_restore(text) TO authenticated;

/* Admin → Templates: MadeVisa's version, its purpose, and whether the live template differs. */
CREATE OR REPLACE FUNCTION public.admin_template_library()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'key', l.key, 'version', l.version, 'meta', l.meta,
      'library', jsonb_build_object('subject', l.subject, 'preheader', l.preheader, 'eyebrow', l.eyebrow, 'headline', l.headline, 'body', l.body,
                                    'cta_label', l.cta_label, 'cta_url', l.cta_url, 'show_stats', l.show_stats),
      'state', CASE
        WHEN t.key IS NULL THEN 'missing'
        WHEN public.mv_template_hash(t.subject, t.preheader, t.eyebrow, t.headline, t.body, t.cta_label, t.cta_url)
           = public.mv_template_hash(l.subject, l.preheader, l.eyebrow, l.headline, l.body, l.cta_label, l.cta_url) THEN 'current'
        ELSE 'customized' END,
      'has_backup', EXISTS (SELECT 1 FROM public.email_template_backups b WHERE b.key = l.key)) ORDER BY l.key)
    FROM public.email_template_library l LEFT JOIN public.email_templates t ON t.key = l.key), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_library() TO authenticated;

/* Admin: replace a template with MadeVisa's version (the current one is backed up first). */
CREATE OR REPLACE FUNCTION public.admin_template_use_library(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE l public.email_template_library;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.email_template_library WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No MadeVisa version of %.', p_key; END IF;
  INSERT INTO public.email_template_backups (key, row, reason)
  SELECT key, to_jsonb(t), 'Replaced by MadeVisa version ' || l.version || ' (admin)' FROM public.email_templates t WHERE key = p_key;
  INSERT INTO public.email_templates (key, name, audience, subject, preheader, eyebrow, headline, body, cta_label, cta_url, show_stats)
  VALUES (l.key, l.name, l.audience, l.subject, l.preheader, l.eyebrow, l.headline, l.body, l.cta_label, l.cta_url, l.show_stats)
  ON CONFLICT (key) DO UPDATE SET name = excluded.name, subject = excluded.subject, preheader = excluded.preheader, eyebrow = excluded.eyebrow,
    headline = excluded.headline, body = excluded.body, cta_label = excluded.cta_label, cta_url = excluded.cta_url, show_stats = excluded.show_stats, updated_at = now();
  RETURN to_jsonb((SELECT t FROM public.email_templates t WHERE key = p_key));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_use_library(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_use_library(text) TO authenticated;

-- ===========================================================================
-- 2. A/B variants
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.email_template_variants (
  key text PRIMARY KEY REFERENCES public.email_templates(key) ON DELETE CASCADE,
  -- Only what B changes; NULL = same as A.
  subject text,
  preheader text,
  eyebrow text,
  headline text,
  body text,
  cta_label text,
  active boolean NOT NULL DEFAULT false,
  -- Percent of recipients who get B.
  share integer NOT NULL DEFAULT 50 CHECK (share BETWEEN 1 AND 99),
  hypothesis text,
  primary_metric text,
  guardrails text,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_template_variants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_template_variants FROM anon, authenticated;

/* 0–99 from the address and template key: the same person always lands in the same bucket. */
CREATE OR REPLACE FUNCTION public.mv_ab_bucket(p_email text, p_key text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT (('x' || substr(md5(lower(btrim(coalesce(p_email, ''))) || ':' || coalesce(p_key, '')), 1, 8))::bit(32)::bigint % 100)::integer $$;

/* The template as this address gets it: variant B's fields when B is on and the address is in B. */
CREATE OR REPLACE FUNCTION public.mv_template_for(p_key text, p_email text, OUT tpl public.email_templates, OUT variant text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE vr public.email_template_variants;
BEGIN
  SELECT * INTO tpl FROM public.email_templates WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No template %', p_key; END IF;
  variant := 'a';
  SELECT * INTO vr FROM public.email_template_variants WHERE key = p_key AND active;
  IF FOUND AND public.mv_ab_bucket(p_email, p_key) < vr.share THEN
    variant := 'b';
    tpl.subject := coalesce(nullif(vr.subject, ''), tpl.subject);
    tpl.preheader := coalesce(nullif(vr.preheader, ''), tpl.preheader);
    tpl.eyebrow := coalesce(nullif(vr.eyebrow, ''), tpl.eyebrow);
    tpl.headline := coalesce(nullif(vr.headline, ''), tpl.headline);
    tpl.body := coalesce(nullif(vr.body, ''), tpl.body);
    tpl.cta_label := coalesce(nullif(vr.cta_label, ''), tpl.cta_label);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_template_for(text, text) FROM PUBLIC, anon, authenticated;

-- Variant B for the planned experiments: written, switched off. One variable each (the hook, or for nurture_3 the order).
INSERT INTO public.email_template_variants (key, subject, preheader, headline, body, hypothesis, primary_metric, guardrails)
SELECT * FROM (VALUES
 ('auto_seeker_1',
  $s${{role_title}} jobs that say whether they sponsor visas$s$,
  $s$MadeVisa marks visa sponsorship when the ad states it, so you can skip the guessing.$s$,
  $s$The visa question, answered before you apply$s$,
  NULL,
  'A visa-transparency hook earns more qualified clicks than a role-inventory hook.',
  'Unique clicks per delivered email, then registrations',
  'Unsubscribe and complaint rates no higher than A'),
 ('auto_seeker_2',
  $s${{first_name}}, a faster way to rule {{role}} jobs in or out$s$,
  $s$See which requirements you meet and which you don't, before you spend an evening applying.$s$,
  $s$Know which jobs fit before you apply$s$,
  NULL,
  'Practical job fit beats curiosity for registrations and CV uploads.',
  'Registrations, then CV uploads per delivered email',
  'Unsubscribe and complaint rates no higher than A'),
 ('nurture_1',
  $s${{first_name}}, Auto Apply: you approve the jobs, it does the forms$s$,
  $s$You set the rules and see every application. Pro, $8.99 a month.$s$,
  $s$Your rules, your CV, every application visible$s$,
  NULL,
  'Stressing control and transparency lifts Pro checkouts over workflow simplicity.',
  'Pro checkouts started, Pro purchases',
  'Unsubscribes from the series no higher than A'),
 ('nurture_3',
  $s$Auto Apply, and the rest of Pro, for $8.99 a month$s$,
  NULL,
  $s$Start with Auto Apply. The rest of Pro comes with it.$s$,
  $b${{cv_line}}

**Auto Apply** is the reason most people choose Pro: it prepares a CV tailored to each job you choose, adds a cover letter when one helps, sends it where MadeVisa can submit and hands it to you ready to send everywhere else.

Pro also includes:

- [chart] The full CV match report on every job, and all your matches ranked
- [file] 50 sponsorship documents a month (Starter has 20, Free has 1)
- [bell] Up to 10 job alerts, and 10 jobs in each Jobs for you email

Pro is **$8.99 a month**. If you only need the reports, Starter at $2.99 covers them.

This is the last email in this series.$b$,
  'Leading with Auto Apply converts better than the full list of Pro benefits.',
  'Pro purchases',
  'Starter purchases and unsubscribes watched'),
 ('promo_cv',
  $s${{first_name}}, see how your CV compares with live jobs$s$,
  $s$A free account, one upload, and your match score on real jobs.$s$,
  $s$Stop guessing which jobs fit your CV$s$,
  NULL,
  'Leading with the CV matching benefit beats leading with new-job numbers.',
  'Registrations and CV uploads per delivered email',
  'Unsubscribe and complaint rates no higher than A'),
 ('auto_employer_1',
  $s${{company}}: candidates who want to relocate for work$s$,
  $s$MadeVisa is read by people looking for jobs abroad. Listing a role is free.$s$,
  $s$Reach people who are actively looking to move$s$,
  NULL,
  'International-candidate relevance beats free-listing convenience.',
  'Employer listings submitted per delivered email',
  'Unsubscribe and complaint rates no higher than A'),
 ('auto_employer_2',
  $s${{company}}: your role in our job posts on social media$s$,
  $s$Add a Sponsored listing ($149, 30 days) to our LinkedIn, Instagram and Facebook job posts for $49.$s$,
  $s$Put one hard-to-fill role in front of more people$s$,
  NULL,
  'Leading with social exposure earns more sponsored requests than leading with 30-day placement.',
  'Sponsored listing requests per delivered email',
  'Unsubscribe and complaint rates no higher than A')
) v(key, subject, preheader, headline, body, hypothesis, primary_metric, guardrails)
WHERE EXISTS (SELECT 1 FROM public.email_templates t WHERE t.key = v.key)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_template_variants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.key) FROM public.email_template_variants v), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_variants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_variants() TO authenticated;

/* Save or switch a variant: p = {key, subject?, preheader?, eyebrow?, headline?, body?, cta_label?, active?, share?, hypothesis?, primary_metric?, guardrails?}. */
CREATE OR REPLACE FUNCTION public.admin_template_variant_save(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.email_template_variants;
  k text := lower(btrim(coalesce(p->>'key', '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_templates WHERE key = k) THEN RAISE EXCEPTION 'No template %.', k; END IF;
  INSERT INTO public.email_template_variants (key) VALUES (k) ON CONFLICT (key) DO NOTHING;
  UPDATE public.email_template_variants SET
    subject = CASE WHEN p ? 'subject' THEN nullif(btrim(p->>'subject'), '') ELSE subject END,
    preheader = CASE WHEN p ? 'preheader' THEN nullif(btrim(p->>'preheader'), '') ELSE preheader END,
    eyebrow = CASE WHEN p ? 'eyebrow' THEN nullif(btrim(p->>'eyebrow'), '') ELSE eyebrow END,
    headline = CASE WHEN p ? 'headline' THEN nullif(btrim(p->>'headline'), '') ELSE headline END,
    body = CASE WHEN p ? 'body' THEN nullif(btrim(p->>'body'), '') ELSE body END,
    cta_label = CASE WHEN p ? 'cta_label' THEN nullif(btrim(p->>'cta_label'), '') ELSE cta_label END,
    share = coalesce((p->>'share')::integer, share),
    hypothesis = CASE WHEN p ? 'hypothesis' THEN nullif(btrim(p->>'hypothesis'), '') ELSE hypothesis END,
    primary_metric = CASE WHEN p ? 'primary_metric' THEN nullif(btrim(p->>'primary_metric'), '') ELSE primary_metric END,
    guardrails = CASE WHEN p ? 'guardrails' THEN nullif(btrim(p->>'guardrails'), '') ELSE guardrails END,
    -- The start of a test is kept, so its results are read from that day.
    started_at = CASE WHEN (p->>'active')::boolean IS TRUE AND NOT active THEN now() ELSE started_at END,
    active = coalesce((p->>'active')::boolean, active),
    updated_at = now()
  WHERE key = k
  RETURNING * INTO v;
  RETURN to_jsonb(v);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_template_variant_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_template_variant_save(jsonb) TO authenticated;

-- ===========================================================================
-- 3. Tracking columns, links
-- ===========================================================================
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS template_key text;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS variant text;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS track text;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS complained_at timestamptz;
ALTER TABLE public.email_log ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS email_log_track_idx ON public.email_log (track) WHERE track IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_log_provider_idx ON public.email_log (provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_log_template_idx ON public.email_log (template_key, created_at) WHERE template_key IS NOT NULL;

/* A random token for one email (80 bits). */
CREATE OR REPLACE FUNCTION public.mv_track_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$ SELECT left(replace(gen_random_uuid()::text, '-', ''), 20) $$;

/* A MadeVisa link with the email's template, variant and token: …?s=auto&mc=auto_seeker_1.a&mt=… (before any #anchor). */
CREATE OR REPLACE FUNCTION public.mv_track_url(p_url text, p_key text, p_variant text, p_track text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_url IS NULL OR p_url !~* '^https://(www\.)?madevisa\.com(/|$)' OR p_key IS NULL THEN p_url
    ELSE split_part(p_url, '#', 1)
         || CASE WHEN split_part(p_url, '#', 1) LIKE '%?%' THEN '&' ELSE '?' END
         || 'mc=' || regexp_replace(lower(p_key), '[^a-z0-9_]', '', 'g') || '.' || coalesce(nullif(p_variant, ''), 'a')
         || CASE WHEN p_track ~ '^[a-f0-9]{8,40}$' THEN '&mt=' || p_track ELSE '' END
         || CASE WHEN strpos(p_url, '#') > 0 THEN '#' || substr(p_url, strpos(p_url, '#') + 1) ELSE '' END
  END;
$$;

/* Logged with the email: which template, which variant, which token. */
CREATE OR REPLACE FUNCTION public.mv_send_outreach(p_to text, p_rendered jsonb, p_kind text, p_user uuid DEFAULT NULL, p_idempotency text DEFAULT NULL, p_sender public.email_senders DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text;
  sender text;
  reply text := 'hello@madevisa.com';
  body jsonb;
  lid bigint;
  txt text := p_rendered->>'text';
  tk text := CASE WHEN p_rendered->>'track' ~ '^[a-f0-9]{8,40}$' THEN p_rendered->>'track' END;
BEGIN
  SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'resend_api_key')) INTO key;
  IF coalesce(key, '') = '' THEN RETURN NULL; END IF;
  IF p_sender.id IS NOT NULL THEN
    sender := p_sender.from_name || ' <' || p_sender.from_email || '>';
    reply := coalesce(nullif(p_sender.reply_to, ''), reply);
  ELSE
    SELECT coalesce(nullif((SELECT value FROM public.app_secrets WHERE name = 'email_from_outreach'), ''), (SELECT value FROM public.app_secrets WHERE name = 'email_from'), 'MadeVisa <onboarding@resend.dev>') INTO sender;
  END IF;
  IF txt IS NOT NULL AND txt NOT ILIKE '%Sumgayit%' THEN txt := txt || E'\n\n—\n' || public.mv_contact_line(); END IF;
  body := jsonb_build_object('from', sender, 'to', jsonb_build_array(p_to), 'subject', p_rendered->>'subject',
                             'html', p_rendered->>'html', 'text', txt, 'reply_to', reply,
                             'tags', jsonb_build_array(jsonb_build_object('name', 'kind', 'value', p_kind))
                                     || CASE WHEN p_rendered->>'template' ~ '^[a-z0-9_]{1,60}$'
                                             THEN jsonb_build_array(jsonb_build_object('name', 'template', 'value', p_rendered->>'template')) ELSE '[]'::jsonb END);
  IF p_rendered->>'unsub' IS NOT NULL THEN
    body := body || jsonb_build_object('headers', jsonb_build_object('List-Unsubscribe', '<' || (p_rendered->>'unsub') || '>', 'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'));
  END IF;
  -- A test send must not take the token of a real one.
  IF tk IS NOT NULL AND (p_kind = 'test' OR EXISTS (SELECT 1 FROM public.email_log WHERE track = tk)) THEN tk := NULL; END IF;
  INSERT INTO public.email_log (user_id, to_email, kind, subject, sender_id, payload, key_name, idem, template_key, variant, track)
  VALUES (p_user, p_to, p_kind, left(p_rendered->>'subject', 300), p_sender.id, body, 'outreach', left(p_idempotency, 240),
          nullif(p_rendered->>'template', ''), nullif(p_rendered->>'variant', ''), tk)
  RETURNING id INTO lid;
  RETURN lid;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_send_outreach(text, jsonb, text, uuid, text, public.email_senders) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 4. Rendering: variants, tracked links, fallbacks
-- ===========================================================================
/* Up to 3 of a person's saved jobs that are still open, as email job cards ('' when none). */
CREATE OR REPLACE FUNCTION public.mv_saved_job_cards(p_user uuid, p_key text, p_variant text, p_track text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'html', coalesce(string_agg(public.mv_email_job(public.mv_track_url('https://madevisa.com/jobs/sponsored-' || x.id || '?s=lc_saved', p_key, p_variant, p_track),
                                  x.title, x.company, x.logo, nullif(concat_ws(', ', x.city, x.country), ''),
                                  CASE WHEN x.visa THEN public.mv_email_chip('Visa sponsorship', 'blue') ELSE '' END), '' ORDER BY x.saved_at DESC), ''),
    'text', coalesce(string_agg('• ' || x.title || ' — ' || x.company || E'\n  https://madevisa.com/jobs/sponsored-' || x.id, E'\n' ORDER BY x.saved_at DESC), ''),
    'count', count(*))
  FROM (
    SELECT s.id, s.title, p.name AS company, p.logo_url AS logo, s.city, co.name AS country, (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa, sv.created_at AS saved_at
    FROM public.saved_jobs sv
    JOIN public.sponsored_jobs s ON s.id = sv.job_id
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE p_user IS NOT NULL AND sv.user_id = p_user AND s.status = 'published' AND (s.expires_at IS NULL OR s.expires_at > now())
    ORDER BY sv.created_at DESC
    LIMIT 3) x;
$$;
REVOKE ALL ON FUNCTION public.mv_saved_job_cards(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

/* One email from a template, for one address. Returns {subject, html, text, preheader, unsub, template, variant, track}. */
CREATE OR REPLACE FUNCTION public.mv_render_template(p_key text, p_email text, p_name text DEFAULT NULL, p_user uuid DEFAULT NULL, p_token uuid DEFAULT NULL, p_country text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.email_templates;
  picked record;
  variant text;
  tk text := public.mv_track_token();
  n public.outreach_numbers := public.outreach_counts();
  uid uuid := coalesce(p_user, (SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1));
  src text := (SELECT source FROM public.email_contacts WHERE lower(email) = lower(p_email) LIMIT 1);
  aud text := (SELECT audience FROM public.email_contacts WHERE lower(email) = lower(p_email) LIMIT 1);
  first text;
  matches integer := 0;
  has_cv boolean := false;
  cv_line text;
  dash text;
  unsub text;
  v jsonb;
  stats text := '';
  subject text;
  body text;
  headline text;
  pre text;
  cta text;
  cta_url text;
  saved jsonb := jsonb_build_object('html', '', 'text', '', 'count', 0);
BEGIN
  SELECT * INTO picked FROM public.mv_template_for(p_key, p_email);
  t := picked.tpl;
  variant := picked.variant;
  first := coalesce(public.mv_first_name(p_name), public.mv_first_name((SELECT full_name FROM public.profiles WHERE id = uid)));
  IF uid IS NOT NULL THEN
    has_cv := EXISTS (SELECT 1 FROM public.user_cvs WHERE user_id = uid);
    matches := public.mv_match_count(uid);
  END IF;
  cv_line := CASE
    WHEN has_cv AND matches > 0 THEN 'Your CV matches the titles of **' || public.mv_count_noun(matches, 'live job', 'live jobs') || '** on MadeVisa right now.'
    WHEN has_cv THEN 'Your CV is on MadeVisa, and new jobs arrive every day. CV match shows how each one compares with it.'
    ELSE 'First, upload your CV to your free account. It takes about a minute, and CV match then shows how it compares with live jobs.' END;
  dash := 'https://madevisa.com/my?t=' || coalesce(p_token::text, '');
  v := jsonb_build_object(
    'jobs_live', to_char(n.jobs_live, 'FM999,999'),
    'jobs_today', to_char(n.jobs_today, 'FM999,999'),
    'jobs_visa', to_char(n.jobs_visa, 'FM999,999'),
    'matches', to_char(matches, 'FM999,999'),
    'cv_line', cv_line,
    'country', coalesce(p_country, ''),
    'dashboard_url', dash);
  subject := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.subject, first), v)));
  subject := btrim(regexp_replace(subject, '[ \t]{2,}', ' ', 'g'));
  subject := upper(left(subject, 1)) || substr(subject, 2);
  body := regexp_replace(mv_fill(public.mv_fill_name(t.body, first), v), '[ \t]{2,}', ' ', 'g');
  headline := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.headline, first), v)));
  headline := upper(left(headline, 1)) || substr(headline, 2);
  pre := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(coalesce(t.preheader, ''), first), v)));
  cta := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.cta_label, first), v)));
  cta_url := public.mv_track_url(t.cta_url, t.key, variant, tk);
  unsub := CASE WHEN p_token IS NOT NULL THEN 'https://madevisa.com/alerts/unsubscribe?k=all&t=' || p_token::text || '&mt=' || tk END;

  -- [[saved_jobs]] → the person's saved jobs that are still open (nothing when there are none).
  IF strpos(body, '[[saved_jobs]]') > 0 THEN
    saved := public.mv_saved_job_cards(uid, t.key, variant, tk);
    -- None still open: drop the line that introduced them ("You saved these on MadeVisa:").
    IF (saved->>'count')::integer = 0 THEN body := regexp_replace(body, '[^\n]*:[ \t]*\n+[ \t]*\[\[saved_jobs\]\]', '[[saved_jobs]]'); END IF;
  END IF;

  IF t.show_stats THEN
    stats := '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>'
      || (SELECT string_agg('<td width="33%" valign="top" style="padding:0 4px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 12px">'
           || public.mv_email_icon(ic, 22)
           || '<div style="margin-top:10px;font-size:22px;line-height:1.1;font-weight:800;color:#0f172a">' || num || '</div>'
           || '<div style="margin-top:4px;font-size:12px;line-height:1.35;color:#64748b">' || lbl || '</div></div></td>', '' ORDER BY o)
          FROM (VALUES (1, 'globe', to_char(n.jobs_live, 'FM999,999'), 'Live jobs'),
                       (2, 'new', to_char(n.jobs_today, 'FM999,999'), 'New today'),
                       (3, 'plane', to_char(n.jobs_visa, 'FM999,999'), 'Visa sponsorship')) s(o, ic, num, lbl))
      || '</tr></table>';
  END IF;

  RETURN jsonb_build_object(
    'subject', left(subject, 200),
    'preheader', pre,
    'first_name', first,
    'template', t.key,
    'variant', variant,
    'track', tk,
    'html', public.mv_email_html(
      pre, t.eyebrow, headline,
      CASE WHEN first IS NOT NULL THEN 'Hi ' || mv_esc(first) || ',' END,
      stats || regexp_replace(public.mv_body_html(body), '<p[^>]*>\[\[saved_jobs\]\]</p>', replace(saved->>'html', '\', '\\'), 'g')
        || CASE WHEN p_token IS NOT NULL AND coalesce(src, '') NOT LIKE 'found%' AND coalesce(aud, '') <> 'employer' THEN
             '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>'
             || '<td valign="middle" style="padding-right:8px">' || public.mv_email_icon('dashboard', 20) || '</td>'
             || '<td valign="middle" style="font-size:13.5px;line-height:1.5;color:#64748b"><a href="' || mv_esc(dash) || '" style="color:#1d4ed8;font-weight:700;text-decoration:none">Your MadeVisa dashboard</a> &middot; your jobs, matches and applications in one place</td>'
             || '</tr></table>'
           ELSE '' END,
      cta, cta_url,
      CASE WHEN uid IS NOT NULL THEN 'You get this because you have a MadeVisa account.'
           WHEN src LIKE 'found%' THEN 'You get this because this business address is published as a company or hiring contact. One click below and we won''t email it again.'
           ELSE 'You get this because your address is on the MadeVisa mailing list.' END,
      unsub, NULL),
    'text', public.mv_no_emoji(
            CASE WHEN first IS NOT NULL THEN 'Hi ' || first || E',\n\n' ELSE '' END
            || headline || E'\n\n'
            || btrim(regexp_replace(replace(regexp_replace(regexp_replace(body, '\*\*', '', 'g'), '(^|\n)- \[[a-z]+\]\s*', '\1- ', 'g'), '[[saved_jobs]]', saved->>'text'), '\n{3,}', E'\n\n', 'g'))
            || E'\n\n' || cta || ': ' || cta_url
            || CASE WHEN p_token IS NOT NULL AND coalesce(src, '') NOT LIKE 'found%' AND coalesce(aud, '') <> 'employer' THEN E'\n\nYour dashboard: ' || dash ELSE '' END
            || CASE WHEN p_token IS NOT NULL THEN E'\nUnsubscribe: ' || unsub ELSE '' END),
    'unsub', unsub
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mv_render_template(text, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

/* Add a query parameter before any #anchor: …/pricing#employers + s=auto → …/pricing?s=auto#employers. */
CREATE OR REPLACE FUNCTION public.mv_url_param(p_url text, p_param text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_url IS NULL OR coalesce(p_param, '') = '' THEN p_url
    ELSE split_part(p_url, '#', 1) || CASE WHEN split_part(p_url, '#', 1) LIKE '%?%' THEN '&' ELSE '?' END || p_param
         || CASE WHEN strpos(p_url, '#') > 0 THEN '#' || substr(p_url, strpos(p_url, '#') + 1) ELSE '' END END;
$$;

/* Live jobs for a role, cached for 6 hours. Now also the newest jobs that mention sponsorship (top_visa),
   and "visa first" ordering that treats an unknown visa status as no (it sorted first before). */
ALTER TABLE public.outreach_role_cache ADD COLUMN IF NOT EXISTS top_visa jsonb NOT NULL DEFAULT '[]'::jsonb;
DELETE FROM public.outreach_role_cache;

CREATE OR REPLACE FUNCTION public.mv_role_jobs(p_role_key text)
RETURNS public.outreach_role_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  r public.outreach_role_cache;
  k text := nullif(btrim(lower(coalesce(p_role_key, ''))), '');
  q text;
  tries text[];
  n integer := 0;
  v integer := 0;
  t jsonb := '[]'::jsonb;
  tv jsonb := '[]'::jsonb;
  generic constant text[] := ARRAY['manager', 'specialist', 'officer', 'assistant', 'associate', 'consultant', 'executive', 'coordinator', 'director', 'lead', 'worker', 'staff', 'partner', 'advisor', 'representative', 'agent', 'member', 'owner', 'founder'];
BEGIN
  IF k IS NULL THEN k := ''; END IF;
  SELECT * INTO r FROM public.outreach_role_cache WHERE role_key = k;
  IF FOUND AND r.at > now() - interval '6 hours' THEN RETURN r; END IF;
  tries := ARRAY[k];
  IF k LIKE '% %' AND NOT (regexp_replace(k, '^.* ', '') = ANY (generic)) THEN tries := tries || regexp_replace(k, '^.* ', ''); END IF;
  FOREACH q IN ARRAY tries LOOP
    SELECT count(*), count(*) FILTER (WHERE coalesce(s.visa_status = 'offered', false) OR coalesce(s.visa_sponsorship, false)) INTO n, v
    FROM public.sponsored_jobs s
    WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (q = '' OR s.title ILIKE '%' || q || '%');
    EXIT WHEN n > 0;
  END LOOP;
  WITH live AS (
    SELECT s.*, p.name AS company, p.logo_url AS logo, co.name AS country_name,
           (coalesce(s.visa_status = 'offered', false) OR coalesce(s.visa_sponsorship, false)) AS has_visa
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (q = '' OR s.title ILIKE '%' || q || '%')
  ), cards AS (
    SELECT jsonb_build_object('id', l.id, 'title', l.title, 'company', l.company, 'logo', l.logo, 'city', l.city, 'country', l.country_name,
             'visa', l.has_visa,
             'salary', CASE WHEN l.salary_status = 'disclosed' AND l.compensation_text ~ '[1-9]' THEN l.compensation_text END) AS j,
           l.has_visa, coalesce(l.released_at, l.created_at) AS at
    FROM live l
  )
  SELECT coalesce((SELECT jsonb_agg(j ORDER BY has_visa DESC, at DESC) FROM (SELECT * FROM cards ORDER BY has_visa DESC, at DESC LIMIT 3) a), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(j ORDER BY at DESC) FROM (SELECT * FROM cards WHERE has_visa ORDER BY at DESC LIMIT 3) b), '[]'::jsonb)
  INTO t, tv;
  INSERT INTO public.outreach_role_cache AS c (role_key, jobs, visa, query, top, top_visa, at)
  VALUES (k, n, v, nullif(q, ''), t, tv, now())
  ON CONFLICT (role_key) DO UPDATE SET jobs = excluded.jobs, visa = excluded.visa, query = excluded.query, top = excluded.top, top_visa = excluded.top_visa, at = now()
  RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_role_jobs(text) FROM PUBLIC, anon, authenticated;

/* One autopilot email for one contact. Fallbacks:
   • no role, or no live job for it → general wording ("Live jobs right now: 18,400");
   • the visa email for a role with no sponsored job → all roles;
   • [[jobs]] in the visa email shows only jobs that mention sponsorship; no jobs → the line disappears. */
CREATE OR REPLACE FUNCTION public.mv_render_auto(p_key text, c public.email_contacts)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.email_templates;
  picked record;
  variant text;
  tk text := public.mv_track_token();
  n public.outreach_numbers := public.outreach_counts();
  rj public.outreach_role_cache;
  first text := public.mv_first_name(c.name);
  role_key text := coalesce(c.role_key, public.mv_role_key(c.role));
  role text;
  role_q text;
  company text := nullif(btrim(coalesce(c.company, '')), '');
  dom text := split_part(lower(c.email), '@', 2);
  labels text[] := string_to_array(split_part(lower(c.email), '@', 2), '.');
  visa_mail boolean := p_key LIKE 'auto_seeker_3%';
  v jsonb;
  subject text;
  headline text;
  pre text;
  body text;
  cta text;
  cta_url text;
  cards text := '';
  cards_text text := '';
  top jsonb;
  unsub text := 'https://madevisa.com/alerts/unsubscribe?k=all&t=' || c.token::text;
  why text;
BEGIN
  SELECT * INTO picked FROM public.mv_template_for(p_key, c.email);
  t := picked.tpl;
  variant := picked.variant;
  rj := public.mv_role_jobs(role_key);
  -- The role is used only when it has live jobs (and, for the visa email, sponsored ones).
  IF role_key IS NULL OR rj.jobs = 0 OR (visa_mail AND rj.visa = 0) THEN
    role := '';
    role_q := NULL;
    rj := public.mv_role_jobs('');
  ELSE
    role := public.mv_role_label(role_key);
    role_q := coalesce(rj.query, role_key);
  END IF;
  IF company IS NULL AND dom <> '' AND dom !~ '^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|mail|aol|proton|protonmail|gmx|yandex|ymail|msn|zoho)\.' THEN
    -- jobs@nl.bosch.com → Bosch, hr@acme.co.uk → Acme
    company := initcap(replace(CASE WHEN cardinality(labels) >= 3 AND labels[cardinality(labels) - 1] IN ('co', 'com', 'org', 'net', 'ac', 'gov', 'edu')
                                    THEN labels[cardinality(labels) - 2] ELSE labels[greatest(1, cardinality(labels) - 1)] END, '-', ' '));
  END IF;
  cta_url := public.mv_url_param(t.cta_url, CASE WHEN t.cta_url ~ '/jobs' AND role_q IS NOT NULL THEN 'q=' || public.mv_urlencode(role_q) END);
  cta_url := public.mv_url_param(cta_url, CASE WHEN cta_url !~ '[?&]s=' THEN 's=auto' END);
  cta_url := public.mv_track_url(cta_url, t.key, variant, tk);
  v := jsonb_build_object(
    'role', role,
    'role_title', upper(left(role, 1)) || substr(role, 2),
    'role_a', CASE WHEN role = '' THEN '' WHEN role ~* '^[aeiou]' THEN 'an ' || role ELSE 'a ' || role END,
    'role_jobs', to_char(coalesce(rj.jobs, 0), 'FM999,999'),
    'role_visa', to_char(coalesce(rj.visa, 0), 'FM999,999'),
    'role_url', cta_url,
    'company', coalesce(company, 'Your team'),
    'jobs_live', to_char(n.jobs_live, 'FM999,999'),
    'jobs_today', to_char(n.jobs_today, 'FM999,999'),
    'jobs_visa', to_char(n.jobs_visa, 'FM999,999'),
    'country', coalesce(c.country, ''));
  subject := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.subject, first), v)));
  subject := btrim(regexp_replace(subject, '[ \t]{2,}', ' ', 'g'));
  subject := upper(left(subject, 1)) || substr(subject, 2);
  headline := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.headline, first), v)));
  headline := btrim(regexp_replace(headline, '[ \t]{2,}', ' ', 'g'));
  headline := upper(left(headline, 1)) || substr(headline, 2);
  pre := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(coalesce(t.preheader, ''), first), v)));
  pre := btrim(regexp_replace(pre, '[ \t]{2,}', ' ', 'g'));
  pre := upper(left(pre, 1)) || substr(pre, 2);
  cta := btrim(public.mv_no_emoji(mv_fill(public.mv_fill_name(t.cta_label, first), v)));
  cta := btrim(regexp_replace(cta, '[ \t]{2,}', ' ', 'g'));
  body := regexp_replace(mv_fill(public.mv_fill_name(t.body, first), v), '[ \t]{2,}', ' ', 'g');
  -- A sentence that now starts with a space or lower-case after a removed role ("Live  jobs") is tidied by the collapse above.

  -- [[jobs]] → the newest jobs for this role (the visa email: only those that mention sponsorship).
  IF strpos(body, '[[jobs]]') > 0 THEN
    top := CASE WHEN visa_mail THEN coalesce(rj.top_visa, '[]'::jsonb) ELSE coalesce(rj.top, '[]'::jsonb) END;
    SELECT coalesce(string_agg(public.mv_email_job(public.mv_track_url('https://madevisa.com/jobs/sponsored-' || (j->>'id') || '?s=auto', t.key, variant, tk), j->>'title', j->>'company', j->>'logo',
             nullif(concat_ws(', ', j->>'city', j->>'country'), ''),
             CASE WHEN (j->>'visa')::boolean THEN public.mv_email_chip('Visa sponsorship', 'blue') ELSE '' END
             || CASE WHEN j->>'salary' IS NOT NULL THEN public.mv_email_chip(j->>'salary', 'gray') ELSE '' END), ''), ''),
           coalesce(string_agg('• ' || (j->>'title') || ' — ' || (j->>'company') || E'\n  https://madevisa.com/jobs/sponsored-' || (j->>'id'), E'\n'), '')
      INTO cards, cards_text
    FROM jsonb_array_elements(top) j;
    -- No job to show: drop "The newest:" that introduced the cards.
    IF cards = '' THEN body := regexp_replace(body, '\s*The newest:\s*', E'\n\n', 'g'); END IF;
  END IF;

  why := CASE c.audience
    WHEN 'employer' THEN 'You get this because ' || c.email || ' is published as a business contact' || CASE WHEN company IS NOT NULL THEN ' for ' || company ELSE '' END || ', and MadeVisa helps companies hire internationally. We send at most two emails; unsubscribe and we never write again.'
    ELSE 'You get this because your professional profile' || CASE WHEN role_key IS NOT NULL THEN CASE WHEN role_key ~* '^[aeiou]' THEN ' as an ' ELSE ' as a ' END || public.mv_role_label(role_key) ELSE '' END || ' is public, and MadeVisa helps people find jobs abroad. We send at most three emails; unsubscribe and we never write again.' END;
  unsub := unsub || '&mt=' || tk;

  RETURN jsonb_build_object(
    'subject', left(subject, 200),
    'preheader', pre,
    'template', t.key,
    'variant', variant,
    'track', tk,
    'html', public.mv_email_html(
      pre, t.eyebrow, headline,
      CASE WHEN first IS NOT NULL THEN 'Hi ' || mv_esc(first) || ',' END,
      regexp_replace(public.mv_body_html(body), '<p[^>]*>\[\[jobs\]\]</p>', replace(cards, '\', '\\'), 'g'),
      cta, cta_url, why, unsub, NULL),
    'text', public.mv_no_emoji(
      CASE WHEN first IS NOT NULL THEN 'Hi ' || first || E',\n\n' ELSE '' END
      || headline || E'\n\n'
      || btrim(regexp_replace(replace(regexp_replace(regexp_replace(body, '\*\*', '', 'g'), '(^|\n)- \[[a-z]+\]\s*', '\1- ', 'g'), '[[jobs]]', cards_text), '\n{3,}', E'\n\n', 'g'))
      || E'\n\n' || cta || ': ' || cta_url
      || E'\n\n' || why || E'\nUnsubscribe: ' || unsub),
    'unsub', unsub
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mv_render_auto(text, public.email_contacts) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 5. Provider ids, clicks, attribution, milestones, provider events
-- ===========================================================================
/* Text → jsonb, or NULL when it isn't JSON. */
CREATE OR REPLACE FUNCTION public.mv_try_jsonb(p text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

/* As before, and keeps Resend's email id (provider_id). */
CREATE OR REPLACE FUNCTION public.email_log_settle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  r record;
  main text := (SELECT value FROM public.app_secrets WHERE name = 'email_from');
  main_addr text;
  cur_addr text;
  shown text;
  msg text;
BEGIN
  main_addr := lower(coalesce(substring(main FROM '<([^>]+)>'), btrim(main), ''));
  BEGIN
    FOR r IN EXECUTE $q$
      SELECT l.id, l.attempts, l.payload, l.idem, resp.status_code AS code, resp.error_msg, resp.content
      FROM public.email_log l
      JOIN net._http_response resp ON resp.id = l.request_id
      WHERE l.status = 'queued' AND l.request_id IS NOT NULL AND l.created_at > now() - interval '2 days'
      ORDER BY l.id
      LIMIT 2000
    $q$
    LOOP
      msg := left(coalesce(r.error_msg, r.content, 'No answer'), 300);
      IF r.code BETWEEN 200 AND 299 THEN
        -- Resend's id for this email: delivery, bounce, complaint and click events refer to it.
        UPDATE public.email_log SET status = 'sent', status_code = r.code, error = NULL, payload = NULL,
               provider_id = coalesce(provider_id, left(public.mv_try_jsonb(r.content)->>'id', 100))
        WHERE id = r.id;
      ELSIF (r.code = 429 OR r.code IS NULL OR r.code >= 500) AND r.payload IS NOT NULL AND r.attempts < 6 THEN
        -- Too many at once (or no answer): back into the outbox, a little later each time.
        UPDATE public.email_log SET request_id = NULL, status_code = r.code, error = 'Retrying: ' || msg,
               next_at = now() + make_interval(secs => 10 * r.attempts)
        WHERE id = r.id;
      ELSIF r.code = 403 AND r.payload IS NOT NULL AND msg ILIKE '%not authorized to send emails from%' AND main_addr LIKE '%@%' THEN
        cur_addr := lower(coalesce(substring(r.payload->>'from' FROM '<([^>]+)>'), r.payload->>'from'));
        IF split_part(cur_addr, '@', 2) <> split_part(main_addr, '@', 2) THEN
          -- The key can't send from this sender's domain: the same email from the main address.
          shown := nullif(btrim(regexp_replace(coalesce(r.payload->>'from', ''), '\s*<[^>]*>\s*$', '')), '');
          UPDATE public.email_log SET request_id = NULL, status_code = r.code, error = 'Sent from ' || main_addr || ' instead: ' || msg, next_at = NULL,
                 idem = CASE WHEN idem IS NULL THEN NULL ELSE left(idem, 230) || '-main' END,
                 payload = payload || jsonb_build_object('from', coalesce(shown, 'MadeVisa') || ' <' || main_addr || '>')
          WHERE id = r.id;
        ELSE
          UPDATE public.email_log SET status = 'failed', status_code = r.code, error = msg, payload = NULL WHERE id = r.id;
        END IF;
      ELSE
        UPDATE public.email_log SET status = 'failed', status_code = r.code, error = msg, payload = NULL WHERE id = r.id;
      END IF;
      n := n + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'email_log_settle: %', SQLERRM;
  END;
  -- pg_net forgets answers after a while: older handed-over ones without an answer are counted as sent (Resend took them).
  UPDATE public.email_log SET status = 'sent', payload = NULL WHERE status = 'queued' AND request_id IS NOT NULL AND created_at < now() - interval '12 hours';
  -- Never handed over in two days: give up.
  UPDATE public.email_log SET status = 'failed', error = coalesce(error, 'Not sent'), payload = NULL WHERE status = 'queued' AND request_id IS NULL AND created_at < now() - interval '2 days';
  DELETE FROM public.email_log WHERE created_at < now() - interval '180 days';
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.email_log_settle() FROM PUBLIC, anon, authenticated;

/* One row per email that someone clicked (or acted on): first touch, account, anonymous events. */
CREATE TABLE IF NOT EXISTS public.email_touches (
  track text PRIMARY KEY,
  log_id bigint,
  template_key text,
  variant text,
  kind text,
  first_click_at timestamptz,
  last_click_at timestamptz,
  clicks integer NOT NULL DEFAULT 0,
  landing_path text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  -- {"listing_submitted": "…", "unsubscribed": "…", "plan_request": "…"}: first time each happened.
  events jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_touches_user_idx ON public.email_touches (user_id, first_click_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_touches_template_idx ON public.email_touches (template_key, variant);
ALTER TABLE public.email_touches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_touches FROM anon, authenticated;

/* The touch row for a token from a real email (NULL when the token is unknown or older than 90 days). */
CREATE OR REPLACE FUNCTION public.mv_touch_for(p_track text)
RETURNS public.email_touches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l public.email_log;
  r public.email_touches;
BEGIN
  IF coalesce(p_track, '') !~ '^[a-f0-9]{8,40}$' THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.email_touches WHERE track = p_track;
  IF FOUND THEN RETURN r; END IF;
  SELECT * INTO l FROM public.email_log WHERE track = p_track AND created_at > now() - interval '90 days';
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.email_touches (track, log_id, template_key, variant, kind, user_id)
  VALUES (p_track, l.id, l.template_key, l.variant, l.kind, l.user_id)
  ON CONFLICT (track) DO NOTHING;
  SELECT * INTO r FROM public.email_touches WHERE track = p_track;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.mv_touch_for(text) FROM PUBLIC, anon, authenticated;

/* The website, when someone arrives from an email link (?mt=…). Path only, never the query. */
CREATE OR REPLACE FUNCTION public.email_click(p_track text, p_path text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.email_touches;
BEGIN
  r := public.mv_touch_for(p_track);
  IF r.track IS NULL THEN RETURN false; END IF;
  UPDATE public.email_touches SET
    first_click_at = coalesce(first_click_at, now()),
    last_click_at = now(),
    clicks = least(clicks + 1, 1000),
    landing_path = coalesce(landing_path, nullif(left(split_part(split_part(coalesce(p_path, ''), '?', 1), '#', 1), 200), '')),
    -- A signed-in person who clicks is that person.
    user_id = coalesce(user_id, auth.uid()),
    claimed_at = CASE WHEN user_id IS NULL AND auth.uid() IS NOT NULL THEN now() ELSE claimed_at END
  WHERE track = r.track;
  UPDATE public.email_log SET clicked_at = now() WHERE track = r.track AND clicked_at IS NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.email_click(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_click(text, text) TO anon, authenticated;

/* After sign-in or sign-up: this account came from that email (first account wins). */
CREATE OR REPLACE FUNCTION public.email_attr_claim(p_track text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.email_touches;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  r := public.mv_touch_for(p_track);
  IF r.track IS NULL THEN RETURN false; END IF;
  UPDATE public.email_touches SET user_id = auth.uid(), claimed_at = now(), first_click_at = coalesce(first_click_at, now()), last_click_at = coalesce(last_click_at, now())
  WHERE track = r.track AND user_id IS NULL;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.email_attr_claim(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_attr_claim(text) TO authenticated;

/* Something that happened after an email, without an account: an employer's listing, a plan request, an unsubscribe. Once per email. */
CREATE OR REPLACE FUNCTION public.email_touch_event(p_track text, p_event text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.email_touches;
BEGIN
  IF p_event NOT IN ('listing_submitted', 'plan_request', 'unsubscribed') THEN RETURN false; END IF;
  r := public.mv_touch_for(p_track);
  IF r.track IS NULL THEN RETURN false; END IF;
  UPDATE public.email_touches SET events = events || jsonb_build_object(p_event, now())
  WHERE track = r.track AND NOT events ? p_event;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.email_touch_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_touch_event(text, text) TO anon, authenticated;

-- Milestones the lifecycle segments need (no content, only that it happened and when).
CREATE TABLE IF NOT EXISTS public.user_milestones (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key IN ('cv_match_viewed', 'pricing_viewed', 'pro_prompt_clicked', 'auto_apply_viewed')),
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  times integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, key)
);
ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_milestones FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.note_milestone(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_key NOT IN ('cv_match_viewed', 'pricing_viewed', 'pro_prompt_clicked', 'auto_apply_viewed') THEN RETURN; END IF;
  INSERT INTO public.user_milestones (user_id, key) VALUES (auth.uid(), p_key)
  ON CONFLICT (user_id, key) DO UPDATE SET last_at = now(), times = least(public.user_milestones.times + 1, 100000)
  -- At most once a minute counts.
  WHERE public.user_milestones.last_at < now() - interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.note_milestone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_milestone(text) TO authenticated;

-- Resend webhook events: each one applied once.
CREATE TABLE IF NOT EXISTS public.email_provider_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  provider_id text,
  log_id bigint,
  note text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_provider_events_at_idx ON public.email_provider_events (received_at DESC);
ALTER TABLE public.email_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_provider_events FROM anon, authenticated;

/* One Resend event: p = {id (webhook message id), type, created_at, data: {email_id, to: [...], bounce: {type, subType, message}}}.
   delivered → delivered_at · bounced (hard) → address suppressed, counts toward the autopilot's bounce brake ·
   complained → address suppressed, News and tips off for an account, autopilot paused at 3 a day · clicked → clicked_at. */
CREATE OR REPLACE FUNCTION public.email_provider_event(p jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev_id text := left(coalesce(nullif(p->>'id', ''), md5(p::text)), 120);
  typ text := coalesce(p->>'type', '');
  pid text := left(p->'data'->>'email_id', 100);
  l public.email_log;
  addr text;
  soft boolean := lower(coalesce(p->'data'->'bounce'->>'type', '')) IN ('transient', 'temporary', 'soft', 'undetermined');
  complaints integer;
BEGIN
  INSERT INTO public.email_provider_events (id, type, provider_id) VALUES (ev_id, left(typ, 60), pid) ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  IF pid IS NOT NULL THEN SELECT * INTO l FROM public.email_log WHERE provider_id = pid ORDER BY id DESC LIMIT 1; END IF;
  addr := lower(btrim(coalesce(l.to_email, p->'data'->'to'->>0, '')));
  UPDATE public.email_provider_events SET log_id = l.id WHERE id = ev_id;

  IF typ = 'email.delivered' THEN
    UPDATE public.email_log SET delivered_at = coalesce(delivered_at, now()) WHERE id = l.id;
  ELSIF typ = 'email.clicked' THEN
    UPDATE public.email_log SET clicked_at = coalesce(clicked_at, now()) WHERE id = l.id;
  ELSIF typ = 'email.bounced' THEN
    UPDATE public.email_log SET bounced_at = coalesce(bounced_at, now()) WHERE id = l.id;
    IF NOT soft THEN
      -- Counted like a refused address (422), so the autopilot's bounce brake sees it.
      UPDATE public.email_log SET status = 'failed', status_code = 422, error = left('Bounced: ' || coalesce(p->'data'->'bounce'->>'message', 'hard bounce'), 300)
      WHERE id = l.id;
      UPDATE public.email_contacts SET status = 'bounced', updated_at = now() WHERE lower(email) = addr AND status = 'subscribed';
    END IF;
  ELSIF typ = 'email.complained' THEN
    UPDATE public.email_log SET complained_at = coalesce(complained_at, now()) WHERE id = l.id;
    UPDATE public.email_contacts SET status = 'complained', updated_at = now() WHERE lower(email) = addr AND status IN ('subscribed', 'unsubscribed');
    INSERT INTO public.email_prefs (user_id, news)
    SELECT u.id, false FROM auth.users u WHERE lower(u.email) = addr
    ON CONFLICT (user_id) DO UPDATE SET news = false, updated_at = now();
    SELECT count(*) INTO complaints FROM public.email_log
    WHERE complained_at > now() - interval '24 hours' AND kind LIKE 'auto_%';
    IF complaints >= 3 AND EXISTS (SELECT 1 FROM public.outreach_autopilot WHERE id AND enabled) THEN
      UPDATE public.outreach_autopilot SET enabled = false, paused_reason = 'Paused: ' || complaints || ' spam complaints in 24 hours. Check the list and the copy, then switch it on again.', updated_at = now() WHERE id;
      PERFORM public.outreach_alert('complaints', 'Outreach autopilot paused: spam complaints',
        complaints || ' people marked an autopilot email as spam in the last 24 hours. Their addresses are suppressed. Review the contact source and the templates before switching it on again.');
    END IF;
  ELSE
    UPDATE public.email_provider_events SET note = 'ignored' WHERE id = ev_id;
    RETURN 'ignored';
  END IF;
  RETURN CASE WHEN l.id IS NULL THEN 'applied (no matching email)' ELSE 'applied' END;
END;
$$;
REVOKE ALL ON FUNCTION public.email_provider_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_provider_event(jsonb) TO service_role;

-- ===========================================================================
-- 6. Segments
-- ===========================================================================
/* Who an audience is. p:
   {source: 'contacts' | 'accounts' | 'both',
    tags: [..]            contacts with ANY of these tags (contacts only),
    country: 'Germany'    contacts' country, or accounts living in / citizens of it,
    accounts: 'all' | 'no_cv' | 'cv' | 'free' | 'pro'
              | 'free_no_cv'          free, confirmed, no CV yet
              | 'cv_not_viewed'       CV uploaded, never opened CV match nor checked a job match
              | 'preview_free'        free, opened CV match (saw the 3-match preview)
              | 'starter_pro_intent'  Starter, and an unpaid Pro checkout in 30 days, 15+ documents
                                      this month, or a Pro prompt clicked
              | 'saved_no_apply'      saved jobs, no application and no new save in 14 days,
    skip_days: 14         skip anyone a campaign emailed in the last N days,
    limit: 5000}
   Unsubscribed / bounced contacts, accounts with "News and tips" or all emails off,
   and unconfirmed accounts are always left out — and so is anyone a campaign, the
   series or the autopilot emailed in the last 3 days. */
CREATE OR REPLACE FUNCTION public.outreach_audience(p jsonb)
RETURNS TABLE (email text, name text, user_id uuid, contact_id uuid, country text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
#variable_conflict use_column
DECLARE
  src text := coalesce(nullif(p->>'source', ''), 'contacts');
  acc text := coalesce(nullif(p->>'accounts', ''), 'all');
  v_tags text[] := coalesce((SELECT array_agg(lower(x)) FROM jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)) x WHERE btrim(x) <> ''), '{}');
  v_country text := nullif(btrim(coalesce(p->>'country', '')), '');
  v_skip integer := coalesce(nullif(p->>'skip_days', '')::integer, 0);
  v_limit integer := least(greatest(coalesce(nullif(p->>'limit', '')::integer, 100000), 1), 200000);
BEGIN
  RETURN QUERY
  WITH contacts AS (
    SELECT lower(c.email) AS email, c.name, c.user_id, c.id AS contact_id, c.country
    FROM public.email_contacts c
    WHERE src IN ('contacts', 'both') AND c.status = 'subscribed'
      AND (cardinality(v_tags) = 0 OR c.tags && v_tags)
      -- Addresses found online are business contacts: only when a campaign asks for their tag.
      AND (c.source NOT LIKE 'found%' OR cardinality(v_tags) > 0)
      AND (v_country IS NULL OR lower(c.country) = lower(v_country))
  ),
  accounts AS (
    SELECT lower(u.email) AS email, pr.full_name AS name, u.id AS user_id, c.id AS contact_id, coalesce(c.country, co.name) AS country
    FROM auth.users u
    LEFT JOIN public.profiles pr ON pr.id = u.id
    LEFT JOIN public.countries co ON co.id = pr.country_id
    LEFT JOIN public.email_contacts c ON lower(c.email) = lower(u.email)
    WHERE src IN ('accounts', 'both')
      AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND coalesce(c.status, 'subscribed') = 'subscribed'
      AND public.email_allowed(u.id, 'news')
      AND (v_country IS NULL OR lower(co.name) = lower(v_country)
           OR lower((SELECT name FROM public.countries WHERE id = pr.nationality_country_id)) = lower(v_country))
      AND CASE acc
            WHEN 'no_cv' THEN NOT EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
            WHEN 'cv' THEN EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
            WHEN 'free' THEN NOT public.is_pro(u.id)
            WHEN 'pro' THEN public.is_pro(u.id)
            WHEN 'free_no_cv' THEN NOT public.is_paid(u.id) AND NOT EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
            WHEN 'cv_not_viewed' THEN EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
              AND NOT EXISTS (SELECT 1 FROM public.user_milestones m WHERE m.user_id = u.id AND m.key = 'cv_match_viewed')
              AND NOT EXISTS (SELECT 1 FROM public.cv_checks k WHERE k.user_id = u.id)
            WHEN 'preview_free' THEN NOT public.is_paid(u.id)
              AND EXISTS (SELECT 1 FROM public.user_cvs x WHERE x.user_id = u.id)
              AND EXISTS (SELECT 1 FROM public.user_milestones m WHERE m.user_id = u.id AND m.key = 'cv_match_viewed')
            WHEN 'starter_pro_intent' THEN public.plan_tier(u.id) = 'starter' AND (
                 EXISTS (SELECT 1 FROM public.gumroad_checkouts g WHERE g.user_id = u.id AND g.plan = 'pro' AND g.used_at IS NULL AND g.created_at > now() - interval '30 days')
              OR EXISTS (SELECT 1 FROM public.user_milestones m WHERE m.user_id = u.id AND m.key IN ('pro_prompt_clicked', 'auto_apply_viewed') AND m.last_at > now() - interval '30 days')
              OR (SELECT count(*) FROM public.hiring_briefs b WHERE b.user_id = u.id AND b.created_at >= date_trunc('month', now())) >= 15)
            WHEN 'saved_no_apply' THEN EXISTS (SELECT 1 FROM public.saved_jobs s WHERE s.user_id = u.id)
              AND NOT EXISTS (SELECT 1 FROM public.saved_jobs s WHERE s.user_id = u.id AND s.created_at > now() - interval '14 days')
              AND NOT EXISTS (SELECT 1 FROM public.job_applications a WHERE a.user_id = u.id AND a.created_at > now() - interval '14 days')
              AND NOT EXISTS (SELECT 1 FROM public.auto_apply_items a WHERE a.user_id = u.id AND a.created_at > now() - interval '14 days')
            ELSE true END
  ),
  everyone AS (
    SELECT DISTINCT ON (x.email) x.* FROM (SELECT * FROM accounts UNION ALL SELECT * FROM contacts) x ORDER BY x.email, x.user_id NULLS LAST
  )
  SELECT e.email, e.name, e.user_id, e.contact_id, e.country
  FROM everyone e
  WHERE public.mv_email_ok(e.email)
    -- A user who turned off emails is left out even when imported as a contact.
    AND (e.user_id IS NULL OR public.email_allowed(e.user_id, 'news'))
    -- The global cooldown: no second marketing email within 3 days.
    AND NOT EXISTS (SELECT 1 FROM public.email_log l WHERE lower(l.to_email) = e.email AND l.created_at > now() - interval '3 days'
                    AND l.status <> 'skipped' AND (l.kind IN ('campaign', 'series') OR l.kind LIKE 'auto\_%'))
    AND (v_skip <= 0 OR NOT EXISTS (
          SELECT 1 FROM public.email_campaign_recipients r
          WHERE lower(r.email) = e.email AND r.status = 'sent' AND r.sent_at > now() - make_interval(days => v_skip)))
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_audience(jsonb) FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS email_log_to_recent_idx ON public.email_log (lower(to_email), created_at DESC);

-- ===========================================================================
-- 7. Contact audience: stronger evidence first; a generic inbox on a free mailbox is not a company
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mv_free_mailbox(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(lower(coalesce(p_email, '')), '@', 2) ~ '^(gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|web|yandex|mail|inbox|list|bk|rambler|zoho|qq|163|126|naver|daum|libero|orange|wanadoo|free|laposte|t-online|seznam|wp|o2|interia|rediffmail)\.'
$$;

/* Who a contact is. In order: explicit tags, a recruiter's job title, a hiring inbox (jobs@, hr@ …) on a company
   domain, a generic inbox (info@ …) on a company domain with no person's job title, found on a company website,
   otherwise a job seeker. A free mailbox (gmail …) is never classified as an employer by its address alone. */
CREATE OR REPLACE FUNCTION public.mv_contact_audience(p_tags text[], p_source text, p_role text, p_email text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_tags, '{}') && ARRAY['employer', 'employers', 'company', 'companies', 'hiring', 'hr', 'recruiter', 'recruiters', 'talent'] THEN 'employer'
    WHEN coalesce(p_tags, '{}') && ARRAY['seeker', 'seekers', 'job-seeker', 'job-seekers', 'candidate', 'candidates'] THEN 'seeker'
    WHEN coalesce(p_role, '') ~* '\m(recruit|talent acquisition|hiring manager|hr business partner|people partner|head of people|chro)' THEN 'employer'
    WHEN NOT public.mv_free_mailbox(p_email)
         AND lower(coalesce(p_email, '')) ~ '^(jobs?|hr|careers?|recruit(ing|ment|er)?|talent|hiring|people|vacanc(y|ies)|apply|cv|bewerbung|karriere)[._-]?[a-z0-9]*@' THEN 'employer'
    WHEN NOT public.mv_free_mailbox(p_email) AND coalesce(btrim(p_role), '') = ''
         AND lower(coalesce(p_email, '')) ~ '^(info|contact|office|hello|team|admin|sales|support|work)[._-]?[a-z0-9]*@' THEN 'employer'
    WHEN coalesce(p_source, '') LIKE 'found%' THEN 'employer'
    ELSE 'seeker' END;
$$;

/* Import (as before; a registered account's address is never dropped as junk): [{email, name?, country?, role?, company?}]. p_audience = seeker | employer | auto. */
CREATE OR REPLACE FUNCTION public.admin_contacts_import(p_rows jsonb, p_tags text[] DEFAULT '{}', p_source text DEFAULT 'import', p_consent text DEFAULT NULL, p_audience text DEFAULT 'auto')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_tags text[] := coalesce((SELECT array_agg(DISTINCT lower(left(btrim(t), 40))) FROM unnest(coalesce(p_tags, '{}')) t WHERE btrim(t) <> ''), '{}');
  v_src text := left(coalesce(nullif(btrim(p_source), ''), 'import'), 60);
  v_aud text := CASE WHEN p_audience IN ('seeker', 'employer') THEN p_audience END;
  total integer;
  bad integer;
  added integer;
  existing integer;
  blocked integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Expected a list.'; END IF;
  IF jsonb_array_length(p_rows) > 50000 THEN RAISE EXCEPTION 'At most 50,000 at a time.'; END IF;

  DROP TABLE IF EXISTS _imp;
  CREATE TEMP TABLE _imp ON COMMIT DROP AS
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         lower(btrim(r->>'email')) AS email,
         nullif(left(btrim(coalesce(r->>'name', '')), 120), '') AS name,
         nullif(left(btrim(coalesce(r->>'country', '')), 80), '') AS country,
         nullif(left(btrim(coalesce(r->>'role', '')), 120), '') AS role,
         nullif(left(btrim(coalesce(r->>'company', '')), 120), '') AS company
  FROM jsonb_array_elements(p_rows) r
  WHERE r ? 'email';
  SELECT count(*) INTO total FROM _imp;
  -- Junk-looking addresses are left out, except a registered account's own (verified) address.
  DELETE FROM _imp WHERE NOT public.mv_email_ok(email)
    OR (public.mv_email_junk(email) AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = _imp.email));
  GET DIAGNOSTICS bad = ROW_COUNT;

  SELECT count(*) FILTER (WHERE c.status = 'subscribed'), count(*) FILTER (WHERE c.status <> 'subscribed')
    INTO existing, blocked
    FROM _imp i JOIN public.email_contacts c ON lower(c.email) = i.email;

  -- Existing ones: add the tags, fill what is missing. Status never changes here.
  UPDATE public.email_contacts c
  SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(c.tags || v_tags) t),
      name = coalesce(c.name, i.name), country = coalesce(c.country, i.country),
      role = coalesce(c.role, i.role), role_key = coalesce(c.role_key, public.mv_role_key(i.role)),
      company = coalesce(c.company, i.company),
      audience = coalesce(v_aud, c.audience, public.mv_contact_audience(c.tags || v_tags, c.source, coalesce(c.role, i.role), c.email)),
      updated_at = now()
  FROM _imp i WHERE lower(c.email) = i.email;

  INSERT INTO public.email_contacts (email, name, country, tags, source, consent, user_id, role, role_key, company, audience)
  SELECT i.email, i.name, i.country, v_tags, v_src, nullif(left(btrim(coalesce(p_consent, '')), 300), ''),
         (SELECT id FROM auth.users u WHERE lower(u.email) = i.email LIMIT 1),
         i.role, public.mv_role_key(i.role), i.company,
         coalesce(v_aud, public.mv_contact_audience(v_tags, v_src, i.role, i.email))
  FROM _imp i
  WHERE NOT EXISTS (SELECT 1 FROM public.email_contacts c WHERE lower(c.email) = i.email)
  ON CONFLICT ((lower(email))) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;

  RETURN jsonb_build_object('rows', total, 'invalid', bad, 'added', added, 'already', existing, 'unsubscribed', blocked);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_contacts_import(jsonb, text[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_contacts_import(jsonb, text[], text, text, text) TO authenticated;

-- ===========================================================================
-- 8. Results: the funnel per template and variant, cold and lifecycle apart
-- ===========================================================================
/* Emails sent in the last p_days. Conversions within 30 days of a click are credited to the
   person's most recent clicked email before them (last click), each conversion once.
   Purchases are Gumroad checkouts that Gumroad confirmed (used_at), not redirects.
   This is attributed, not incremental: it says which email came last, not what the email caused. */
CREATE OR REPLACE FUNCTION public.admin_email_report(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  d integer := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public.email_log_settle();

  WITH logs AS (
    SELECT l.id, l.template_key AS k, coalesce(l.variant, 'a') AS v,
           CASE WHEN l.user_id IS NULL THEN 'cold' ELSE 'lifecycle' END AS seg,
           l.status, l.status_code, l.delivered_at, l.bounced_at, l.complained_at, l.clicked_at
    FROM public.email_log l
    WHERE l.template_key IS NOT NULL AND l.kind <> 'test' AND l.created_at >= since
  ),
  sends AS (
    SELECT k, v, seg,
           count(*) FILTER (WHERE status <> 'skipped') AS sent,
           count(*) FILTER (WHERE status = 'sent') AS accepted,
           count(delivered_at) AS delivered,
           count(*) FILTER (WHERE bounced_at IS NOT NULL OR status_code = 422) AS bounced,
           count(complained_at) AS complained,
           count(clicked_at) AS clicked
    FROM logs GROUP BY k, v, seg
  ),
  touches AS (
    SELECT t.*, lg.k, lg.v, lg.seg FROM public.email_touches t JOIN logs lg ON lg.id = t.log_id
  ),
  touch_sums AS (
    SELECT k, v, seg,
           count(*) FILTER (WHERE first_click_at IS NOT NULL) AS landed,
           count(*) FILTER (WHERE events ? 'unsubscribed') AS unsubscribed,
           count(*) FILTER (WHERE events ? 'listing_submitted') AS listings,
           count(*) FILTER (WHERE events ? 'plan_request') AS plan_requests
    FROM touches GROUP BY k, v, seg
  ),
  conv AS (
    SELECT 'registered'::text AS ev, u.id AS uid, u.created_at AS at, NULL::integer AS cents, NULL::text AS plan, NULL::uuid AS ref
    FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL AND u.created_at >= since
    UNION ALL
    SELECT 'cv_uploaded', c.user_id, c.created_at, NULL, NULL, NULL FROM public.user_cvs c WHERE c.created_at >= since
    UNION ALL
    SELECT 'cv_viewed', m.user_id, m.first_at, NULL, NULL, NULL FROM public.user_milestones m WHERE m.key = 'cv_match_viewed' AND m.first_at >= since
    UNION ALL
    SELECT 'checkout', g.user_id, g.created_at, NULL, g.plan, g.id FROM public.gumroad_checkouts g WHERE g.created_at >= since
    UNION ALL
    SELECT 'purchase', g.user_id, g.used_at, g.price_cents, g.plan, g.id FROM public.gumroad_checkouts g WHERE g.used_at IS NOT NULL AND g.used_at >= since
  ),
  credited AS (
    SELECT c.*, t.k, t.v, t.seg
    FROM conv c
    JOIN LATERAL (
      SELECT tt.k, tt.v, tt.seg FROM touches tt
      WHERE tt.user_id = c.uid AND tt.first_click_at IS NOT NULL AND tt.first_click_at <= c.at AND tt.first_click_at > c.at - interval '30 days'
      ORDER BY tt.first_click_at DESC LIMIT 1) t ON true
  ),
  conv_sums AS (
    SELECT k, v, seg,
           count(DISTINCT uid) FILTER (WHERE ev = 'registered') AS registered,
           count(DISTINCT uid) FILTER (WHERE ev = 'cv_uploaded') AS cv_uploaded,
           count(DISTINCT uid) FILTER (WHERE ev = 'cv_viewed') AS cv_viewed,
           count(DISTINCT uid) FILTER (WHERE ev = 'checkout') AS checkout_started,
           count(DISTINCT ref) FILTER (WHERE ev = 'purchase' AND plan = 'starter') AS starter_purchases,
           count(DISTINCT ref) FILTER (WHERE ev = 'purchase' AND plan = 'pro') AS pro_purchases,
           coalesce(sum(cents) FILTER (WHERE ev = 'purchase'), 0) AS revenue_cents,
           count(DISTINCT ref) FILTER (WHERE ev = 'purchase' AND EXISTS (
             SELECT 1 FROM public.gumroad_subscriptions s WHERE s.user_id = credited.uid AND coalesce(s.plan, 'pro') = credited.plan AND s.access_until > now())) AS still_active
    FROM credited GROUP BY k, v, seg
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'template', s.k, 'variant', s.v, 'segment', s.seg,
      'sent', s.sent, 'accepted', s.accepted, 'delivered', s.delivered, 'bounced', s.bounced, 'complained', s.complained,
      'clicked', s.clicked, 'landed', coalesce(ts.landed, 0), 'unsubscribed', coalesce(ts.unsubscribed, 0),
      'listings', coalesce(ts.listings, 0), 'plan_requests', coalesce(ts.plan_requests, 0),
      'registered', coalesce(cs.registered, 0), 'cv_uploaded', coalesce(cs.cv_uploaded, 0), 'cv_viewed', coalesce(cs.cv_viewed, 0),
      'checkout_started', coalesce(cs.checkout_started, 0), 'starter_purchases', coalesce(cs.starter_purchases, 0),
      'pro_purchases', coalesce(cs.pro_purchases, 0), 'revenue_cents', coalesce(cs.revenue_cents, 0), 'still_active', coalesce(cs.still_active, 0),
      'revenue_per_delivered_cents', CASE WHEN greatest(s.delivered, s.accepted) > 0 THEN round(coalesce(cs.revenue_cents, 0)::numeric / greatest(s.delivered, s.accepted), 2) END,
      -- Below this, rates move by chance more than by copy.
      'low_sample', s.sent < 200 OR s.clicked < 20
    ) ORDER BY s.seg, s.k, s.v), '[]'::jsonb)
  INTO rows
  FROM sends s
  LEFT JOIN touch_sums ts USING (k, v, seg)
  LEFT JOIN conv_sums cs USING (k, v, seg);

  RETURN jsonb_build_object(
    'days', d,
    'rows', rows,
    'provider_events', (SELECT count(*) FROM public.email_provider_events WHERE received_at >= since),
    'note', 'Last-click attribution within 30 days of a click; each conversion counted once. Attributed, not incremental. Delivered, bounces after acceptance and complaints need the Resend webhook.');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_email_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_report(integer) TO authenticated;

-- ===========================================================================
-- 9. Autopilot: a daily cap smaller than the addresses' limits is shared fairly
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.run_outreach_autopilot(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '280s'
AS $$
DECLARE
  a public.outreach_autopilot;
  st public.outreach_settings;
  hr integer := extract(hour FROM now() AT TIME ZONE 'utc')::integer;
  runs_left integer;
  hours_left integer;
  aud text;
  target integer;
  sent_today integer;
  chunk integer;
  budget integer;
  ct public.email_contacts;
  snd public.email_senders;
  rendered jsonb;
  key text;
  n_sent jsonb := jsonb_build_object('seeker', 0, 'employer', 0);
  n integer;
  full_stop boolean := false;
  cap_stop boolean := false;
  idle integer := 0;
  due integer;
  fresh integer;
  cap jsonb;
  cap_left integer;
  bounced integer;
  share integer;
  sent_by jsonb := '{}'::jsonb;
  planned integer;
  scale numeric := 1;
  d0 timestamptz := date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
BEGIN
  SELECT * INTO a FROM public.outreach_autopilot WHERE id;
  SELECT * INTO st FROM public.outreach_settings WHERE id;
  IF NOT a.enabled OR NOT st.enabled THEN RETURN jsonb_build_object('skipped', 'off'); END IF;
  IF NOT p_force AND (hr < a.hour_from OR hr >= a.hour_to) THEN RETURN jsonb_build_object('skipped', 'outside hours'); END IF;
  IF coalesce((SELECT value FROM public.app_secrets WHERE name = 'resend_api_key'), '') = '' THEN RETURN jsonb_build_object('skipped', 'no Resend key'); END IF;

  -- Bounces from the autopilot: never again. Many at once: stop and tell the admin.
  UPDATE public.email_contacts c SET status = 'bounced', updated_at = now()
  FROM public.email_log l
  WHERE l.kind LIKE 'auto_%' AND l.status = 'failed' AND l.status_code = 422 AND l.created_at > now() - interval '2 days'
    AND lower(l.to_email) = lower(c.email) AND c.status = 'subscribed';
  SELECT count(*) INTO bounced FROM public.email_log WHERE kind LIKE 'auto_%' AND status = 'failed' AND status_code = 422 AND created_at >= d0;
  IF bounced >= 25 AND bounced::numeric / greatest(1, (SELECT count(*) FROM public.email_log WHERE kind LIKE 'auto_%' AND created_at >= d0)) > 0.08 THEN
    UPDATE public.outreach_autopilot SET enabled = false, paused_reason = 'Paused: ' || bounced || ' bounced today (over 8%). Clean the list, then switch it on again.', updated_at = now() WHERE id;
    PERFORM public.outreach_alert('bounces', 'Outreach autopilot paused: too many bounces', bounced || ' autopilot emails bounced today. Remove bad addresses (Contacts → status Bounced) and switch the autopilot on again.');
    RETURN jsonb_build_object('skipped', 'bounces');
  END IF;

  cap := public.outreach_capacity();

  IF a.max_mode THEN
    -- Every address sends its part for this hour: what it has left ÷ hours left (the last hour sends the rest).
    hours_left := greatest(1, a.hour_to - hr);
    -- When the overall daily cap is smaller than what the addresses would send, every address gets the same
    -- fraction of its part (before: the first addresses took it all, e.g. only employers got emails).
    SELECT coalesce(sum(least(400, CASE WHEN p_force THEN greatest(0, e.daily_limit - public.sender_sent_today(e.id))
                                        ELSE ceil(greatest(0, e.daily_limit - public.sender_sent_today(e.id))::numeric / hours_left) END)), 0)::integer
      INTO planned FROM public.email_senders e WHERE e.active AND e.for_campaigns;
    budget := public.outreach_budget();
    IF planned > 0 AND budget < planned THEN scale := greatest(budget, 0)::numeric / planned; cap_stop := true; END IF;
    FOR snd IN
      SELECT e.* FROM public.email_senders e
      WHERE e.active AND e.for_campaigns
      ORDER BY e.for_audience = 'any', random()
    LOOP
      budget := public.outreach_budget();
      IF budget <= 0 THEN cap_stop := true; EXIT; END IF;
      share := greatest(0, snd.daily_limit - public.sender_sent_today(snd.id));
      IF NOT p_force THEN share := ceil(share::numeric / hours_left)::integer; END IF;
      share := least(ceil(least(share, 400) * scale)::integer, budget);
      CONTINUE WHEN share <= 0;
      n := 0;
      FOR ct IN
        -- "any" addresses alternate: seeker, employer, seeker, employer … (one side runs out → the other fills in).
        SELECT d.* FROM (
          SELECT * FROM public.outreach_due('seeker', share) WHERE snd.for_audience IN ('any', 'seeker')
          UNION ALL
          SELECT * FROM public.outreach_due('employer', share) WHERE snd.for_audience IN ('any', 'employer')) d
        ORDER BY row_number() OVER (PARTITION BY d.audience ORDER BY d.auto_step DESC, d.created_at), d.audience DESC
        LIMIT share
      LOOP
        key := 'auto_' || ct.audience || '_' || (ct.auto_step + 1);
        BEGIN
          rendered := public.mv_render_auto(key, ct);
          PERFORM public.mv_send_outreach(ct.email, rendered, 'auto_' || ct.audience, NULL, 'mv-auto-' || ct.id || '-' || (ct.auto_step + 1), snd);
          UPDATE public.email_contacts SET auto_step = auto_step + 1, auto_last_at = now(), sent_count = sent_count + 1, last_sent_at = now(), updated_at = now() WHERE id = ct.id;
          n := n + 1;
          n_sent := jsonb_set(n_sent, ARRAY[ct.audience], to_jsonb((n_sent->>ct.audience)::integer + 1));
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'run_outreach_autopilot %: %', ct.email, SQLERRM;
        END;
      END LOOP;
      sent_by := sent_by || jsonb_build_object(split_part(snd.from_email, '@', 1), n);
      IF n < share THEN idle := idle + (share - n); END IF;
    END LOOP;
  ELSE
    -- Fixed numbers a day, spread over the window (runs every hour).
    runs_left := greatest(1, a.hour_to - hr);
    FOREACH aud IN ARRAY ARRAY['seeker', 'employer'] LOOP
      EXIT WHEN full_stop;
      target := CASE aud WHEN 'seeker' THEN a.seeker_per_day ELSE a.employer_per_day END;
      SELECT count(*) INTO sent_today FROM public.email_log WHERE kind = 'auto_' || aud AND created_at >= d0 AND status <> 'skipped';
      budget := public.outreach_budget();
      chunk := least(greatest(0, target - sent_today), ceil(greatest(0, target - sent_today)::numeric / runs_left)::integer, budget, 400);
      IF p_force THEN chunk := least(greatest(0, target - sent_today), budget, 400); END IF;
      n := 0;
      FOR ct IN SELECT * FROM public.outreach_due(aud, greatest(chunk, 0)) LOOP
        snd := public.outreach_pick_sender_for(aud);
        IF snd.id IS NULL THEN full_stop := true; EXIT; END IF;
        key := 'auto_' || aud || '_' || (ct.auto_step + 1);
        BEGIN
          rendered := public.mv_render_auto(key, ct);
          PERFORM public.mv_send_outreach(ct.email, rendered, 'auto_' || aud, NULL, 'mv-auto-' || ct.id || '-' || (ct.auto_step + 1), snd);
          UPDATE public.email_contacts SET auto_step = auto_step + 1, auto_last_at = now(), sent_count = sent_count + 1, last_sent_at = now(), updated_at = now() WHERE id = ct.id;
          n := n + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'run_outreach_autopilot %: %', ct.email, SQLERRM;
        END;
      END LOOP;
      n_sent := n_sent || jsonb_build_object(aud, n);
    END LOOP;
  END IF;

  -- Running low on people to write to? (A day's need = the daily number, or the addresses' room in max mode.)
  FOREACH aud IN ARRAY ARRAY['seeker', 'employer'] LOOP
    target := CASE WHEN a.max_mode THEN (cap->>aud)::integer
                   ELSE CASE aud WHEN 'seeker' THEN a.seeker_per_day ELSE a.employer_per_day END END;
    CONTINUE WHEN target <= 0;
    SELECT count(*) INTO fresh FROM public.email_contacts
    WHERE status = 'subscribed' AND audience = aud AND user_id IS NULL AND auto_step = 0;
    IF fresh = 0 THEN
      PERFORM public.outreach_alert('empty_' || aud, 'Outreach: no new ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contacts left',
        'The autopilot has started every ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contact, so the '
        || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' addresses cannot reach their limit. Import more emails in Admin → Outreach → Contacts.');
    ELSIF fresh < target * 3 THEN
      PERFORM public.outreach_alert('low_' || aud, 'Outreach: ' || fresh || ' new ' || CASE aud WHEN 'seeker' THEN 'job seeker' ELSE 'employer' END || ' contacts left',
        'About ' || greatest(1, fresh / target) || ' day(s) left at ' || target || ' a day. Import more emails to keep every address sending its full limit.');
    END IF;
  END LOOP;

  -- More due than the senders can send?
  cap_left := (public.outreach_capacity()->>'left')::integer;
  SELECT count(*) INTO due FROM public.email_contacts c, public.outreach_autopilot x
  WHERE x.id AND c.status = 'subscribed' AND c.user_id IS NULL AND c.audience IS NOT NULL
    AND c.auto_step < CASE WHEN c.audience = 'employer' THEN x.employer_steps ELSE x.seeker_steps END
    AND (c.auto_last_at IS NULL OR c.auto_last_at < now() - make_interval(days => x.gap_days));
  IF full_stop OR (hr >= a.hour_to - 1 AND due > (cap->>'total')::integer * 5) THEN
    PERFORM public.outreach_alert('capacity', 'Outreach: senders are full',
      to_char(due, 'FM999,999') || ' contacts are waiting, and the sender addresses can send ' || to_char((cap->>'total')::integer, 'FM999,999')
      || ' a day. Add more sender addresses or raise their daily limits (slowly: +10–20 a day per address keeps you out of spam).');
  END IF;

  -- The overall daily cap (Sending & limits) stops it before the senders do?
  IF due > 0 AND (cap_stop OR public.outreach_budget() <= 0) THEN
    PERFORM public.outreach_alert('cap', 'Outreach: the daily email cap is reached',
      'The autopilot stopped at the daily cap in Admin → Outreach → Sending & limits (' || st.daily_cap || ' emails a day for everything MadeVisa sends), before every address reached its limit. Raise it if your Resend plan allows more.');
  END IF;

  UPDATE public.outreach_autopilot SET last_run_at = now(),
    last_note = 'Sent ' || ((n_sent->>'seeker')::integer + (n_sent->>'employer')::integer) || ' (' || (n_sent->>'seeker') || ' job seekers, ' || (n_sent->>'employer') || ' employers)'
      || CASE WHEN idle > 0 THEN ' · ' || idle || ' slots unused: no contacts due' ELSE '' END
      || CASE WHEN full_stop THEN ' · senders full' ELSE '' END
      || CASE WHEN cap_stop THEN ' · daily cap reached' ELSE '' END
  WHERE id;
  RETURN jsonb_build_object('sent', n_sent, 'by_sender', sent_by, 'unused', idle, 'senders_full', full_stop OR (cap_left = 0), 'cap_reached', cap_stop, 'due', due, 'capacity_left', cap_left);
END;
$$;
REVOKE ALL ON FUNCTION public.run_outreach_autopilot(boolean) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
