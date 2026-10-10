# MadeVisa: emails, email settings, simpler profile, Auto Apply service

Built 10 Oct 2026 on the project zip uploaded that day (migrations up to `20261214090000`).

## Deploy (two steps)

1. **Database**: paste `supabase/migrations/20261215090000_emails_and_auto_apply_service.sql` in the Supabase SQL Editor, run once. Safe to run twice.
2. **Site**: copy the files below into the project and push. No new packages.

Order doesn't matter: before the migration the new admin tabs say "run the migration", and the Auto Apply card and email settings simply don't show.

## Files

New
- `supabase/migrations/20261215090000_emails_and_auto_apply_service.sql`
- `supabase/tests/emails_auto_apply_service.test.sql` (scratch database only)
- `src/lib/autoApplyService.ts`, `src/lib/emailPrefs.ts`
- `src/components/apply/AutoApplyService.tsx`
- `src/components/common/EmailSettingsCard.tsx`
- `src/pages/admin/EmailsSection.tsx`, `src/pages/admin/AutoApplySection.tsx`

Changed
- `src/pages/admin/AdminPanelPage.tsx` — two new tabs: **Emails**, **Auto Apply**
- `src/pages/cv/CvMatchPage.tsx` — Auto Apply card above the matches; FAQ
- `src/pages/profile/ProfilePage.tsx` — dashboard = jobs you applied to + jobs you viewed; Settings → Email notifications
- `src/components/briefs/MyBriefsSection.tsx` — hidden on the dashboard when the person has no documents
- `src/pages/jobs/JobDetailPage.tsx` — removed "How X hires" and the locked "Before you apply" tools
- `src/pages/landing/components/LandingHeader.tsx` — removed the "Did X reply?" tracking reminder
- `src/pages/alerts/UnsubscribePage.tsx` — one-click unsubscribe for every email type (the "Jobs for you" link was broken before: it called the job-alert function)

The tracker files (`ApplicantReport.tsx`, `JobInsights.tsx`, `JobProInsights.tsx`, `CheckInReminder.tsx`) are no longer used anywhere; delete them whenever you like.

## Auto Apply — how you run it

1. A Pro member turns it on in /cv-match: job titles, countries, lowest match (60/70/80%), applications a day (3/5/10), answers (email, phone, sponsorship, notice, salary…), and ticks the consent. It runs one month.
2. You get a bell notification and an email: **New Auto Apply request**.
3. Their best matches go into their queue each time they open CV match (max 40 waiting).
4. **Admin → Auto Apply** → open the person: their details with Copy buttons, CV download, the queue. For each job: **Employer's page** → apply → **Mark applied** (optional note). "Start" shows the job to them as *Applying* while you work.
5. On **Mark applied**: they get a bell and the "You applied for X at Y" email, and the job shows *Applied* on CV match and on their profile.
6. Add any other job with **Add a job** (MadeVisa link, or title/company/link; tick "already applied" to email them at once). **+30 days** extends; **End** stops.

## Emails

- One layout for all: header, card, button, footer with **Email settings · Unsubscribe · Unsubscribe from all**, plus the List-Unsubscribe header.
- Redesigned: "Jobs that match your skills" (shows the matched skills as chips), job alerts, "You applied", new "Auto Apply is on".
- Every email is logged (`email_log`); **Admin → Emails** shows today's count, people, refused, by type, by hour, 14 days, and the list. Resend's answer is copied every 5 minutes.
- People's settings are respected everywhere: a turned-off email is logged as "Turned off", not sent.
- Not in the log: sign-in codes (sent by Supabase Auth).

## Tested
- SQL: 40 checks on PostgreSQL 16 after all earlier migrations (settings, unsubscribe links, Auto Apply start/sync/admin/email once/stop/month end, email log and dashboard). Migration ran twice.
- Typecheck (one existing error in `src/lib/apply/facts.ts`, not from this update), lint clean on changed files, production build OK.
- Pages rendered in a browser with test data: CV match (on and off), setup sheet, profile, settings, admin Emails, admin Auto Apply.
- Not run against the live Supabase or real Resend.
