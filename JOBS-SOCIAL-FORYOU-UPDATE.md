# Job-link posts, hiring cards, "Jobs for you" emails, recruiter contacts — Auto Apply removed

Built 9 Oct 2026. Copy the files in this folder over the project (same paths), then do the steps below.

## 1. Delete these (Auto Apply and the people directory)

```
worker/                                   (the whole folder — the application robot)
src/lib/apply/                            (whole folder, its tests included)
src/components/apply/                     (whole folder)
supabase/functions/apply/                 (whole folder)
.github/workflows/apply-worker.yml
src/components/network/NetworkSettingsCard.tsx
```
Also remove the deployed function: `supabase functions delete apply`

## 2. Database — Supabase → SQL Editor, one paste
`supabase/migrations/20261214090000_jobs_for_you_contacts.sql` (safe to run more than once).

## 3. Functions and site
- `supabase functions deploy auto-pipeline --no-verify-jwt`
- `npm run build`, push.
- Telegram needs the Edge Function secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (the bot must be an admin of the channel). Without them, posts wait as "post by hand".

## What changed

**Telegram** posts only the job-channel style — no image, no intro, one line per job, "Link" is the tappable word:
`💼 Senior Backend Engineer (Blockchain/Crypto): Link`. 2–5 jobs per post, one company per line, never a job posted there before, 5 posts on weekdays / 3 at weekends. It starts by itself (no Start button) and runs on autopilot; Stop leaves Telegram running.

**Facebook** job posts use the same list (the full link is written out — Facebook can't hide a URL behind a word). At least one a day, planned in the content calendar with the rest of the Facebook mix.

**Instagram** job posts are the "We are Hiring" card (light gradient, company logo and name, role in big letters, three chips, "Send your CV to …" when the ad gives an email, otherwise the job's short link). One or two a day, and every card is a company that has never been posted on Instagram. Image: `/api/og/social?layout=hiring&ids=<8 chars>`.

**CV match**: Auto Apply is gone. The page shows the jobs that fit the CV and, on each one, the skills the CV is missing. Guests: 2 jobs, missing skills locked. Free account: 10 jobs, missing skills on the top 3. Pro: every job, every missing skill.

**"Jobs for you" email** to every confirmed account: new jobs since the last email that fit the CV (titles, roles, skills), the profile (occupation, specialization), job alerts and recent searches on /jobs. Never the same job twice; no email when nothing new fits. Daily by default, weekly or off in Profile → Settings; one-click unsubscribe. Free: 5 jobs listed (+N more with Pro); Pro: 10. Up to 150 emails per pass, passes hourly 07:10–12:10 UTC — Resend's free plan is 100 a day, so upgrade Resend before many people sign up.

**/network (Recruiters)**: MadeVisa users are no longer listed (and the directory function no longer answers). The page lists recruiter emails and contact people taken from live job ads, with the role, company, country and a Copy button. New ads are read when saved; older ones in batches every 10 minutes.

Not changed: the Privacy Policy still mentions Auto Apply — worth updating the wording before the next legal review.
