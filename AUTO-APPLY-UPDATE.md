# MadeVisa: Auto Apply on CV match

Built 7 Oct 2026 on the project zip uploaded that day (migrations up to `20261203090000`).

## What it is, in one paragraph

On `/cv-match`, under the headline, there is now **Apply with MadeVisa**: every match gets a recommendation (apply, review first, or skip, with the reason), and **Apply to N jobs** prepares an application for each one: a CV tailored to that ad, a cover letter when one is useful, and the person's saved answers. Where the employer takes applications through MadeVisa, MadeVisa sends it and keeps the delivery confirmation. Everywhere else the application ends as **Ready to send**: the person opens the employer's form, attaches the tailored CV, and says when it is sent. Everything is kept in **Your applications** on the same page and in the existing dashboard tracker.

## The one thing to know first

**MadeVisa cannot submit applications on employers' own sites, and this update does not pretend to.** Nearly every job on MadeVisa is imported from an employer's hiring system (Workday, Greenhouse, Lever, Ashby, SmartRecruiters…). Those forms sit behind a sign-in or a check that a person is applying, and their submit APIs need the employer's own key. So:

| | What happens | Shown as |
|---|---|---|
| Employer takes applications through MadeVisa (you switch this on per job, see below) | MadeVisa emails the tailored CV, letter and answers to the address the employer gave. Replies go to the candidate. | **Submitted** + **Verified submission** once the mail service confirms |
| Every other job (today: all of them) | Application fully prepared. The person opens the form and sends it. | **Ready to send**, then **Sent by you** when they say so |

Until you switch on at least one employer, every application ends as "Ready to send".

## Pricing: unchanged

No credit packs, no new prices. Auto Apply uses a **monthly allowance that comes with the existing plans**, held in one database row (`apply_settings`):

- Free: **5** a month · Pro: **150** a month · at most **30** a day (the person can choose fewer; default 20).
- An application counts once MadeVisa has finished its part: sent with a confirmation, **or** prepared and handed over ready to send. A failed send gives it back. One that is skipped, expired or waiting for an answer never counted. One application can never count twice.

Change the numbers (as an admin, in the SQL editor): `select apply_configure(p_free_monthly => 10, p_pro_monthly => 200);`
Switch the whole feature off: `select apply_configure(p_enabled => false);`

These numbers are my choice. Please confirm or change them.

## Deploys (three, as usual)

1. **Site**: copy the files, `npm install` (adds the test runner `vitest`), push.
2. **Database**: run `supabase/migrations/20261204090000_auto_apply.sql` in the SQL Editor. One paste, one tab, one click. Safe to run twice.
3. **Function**: `supabase functions deploy apply --no-verify-jwt`. No new secret: it uses the Resend key already in `app_secrets`.

Order doesn't matter for safety:
- **Site before database**: the page is exactly as it was. Nothing new shows until the migration is run.
- **Database before function**: everything works except sending through MadeVisa, which shows "Could not submit — MadeVisa couldn't reach its sending service" and counts nothing.

## Switching on an employer

Admin → open a job in the job editor → **Admin only** → **Applications through MadeVisa** → type the address the employer gave for receiving applications → **Turn on**.

Only do this for an address the employer gave for exactly this purpose. People's CVs go there. The address is kept in a table only staff can read (`application_channels`), never on the public job row. (A job's existing `contact_email` is the publisher's admin contact, often `hello@madevisa.com`. It is never used.)

## What "never invents" means here, concretely

- **Tailored CV**: the person's own lines, reordered. Skills the ad asks for move to the front of each skills line; inside each role the bullets closest to the ad come first; one headline is added from the CV's own latest title, its years and the skills it shares with the ad. Every tailored CV is checked before use: apart from the headline it must be the same words the same number of times as the original. If the check fails, the untouched CV is used.
- **Cover letter**: only when the ad asks for one, the role is senior, or the match is one of the strongest. It quotes the CV's own closest lines and states only saved answers. If there is nothing specific to say, no letter is written.
- **Answers**: only from saved answers, the account (name, email, phone, LinkedIn) or contact details printed on the CV. A required question with no verified answer stops that application ("Needs your answer") and the queue carries on. Demographic questions (gender, ethnicity…) are never answered. "Ask me each time" is always asked.
- No AI service is involved. The rules run in the person's browser, like the match score.

## What changed elsewhere on the site (please read)

The site promised in several places that a CV is "never sent to employers". That is no longer always true, so the wording is now "sent to an employer only when you ask": `CvCard`, `CvGate`, `MatchPanel`, `LandingHero`, `CvMatchPage` (hero, step 1, FAQ), `PricingPage` (FAQ).

**Privacy Policy** (`src/data/legalContent.ts`) — four edits, which need your read:
1. Summary line about the CV.
2. "Your CV" bullet: shared with an employer only when you ask MadeVisa to apply.
3. New bullet "Auto Apply (only if you use it)": what is stored, what is sent, what is never done.
4. "What we never do" and the email provider line.

`/cv-match` also has four new FAQ entries about Auto Apply.

## Where it lives

- **Rules** (no page code, all tested): `src/lib/apply/` — `decision.ts` (apply / review / skip, priority, quality, sponsorship), `machine.ts` (allowed states), `allowance.ts`, `profile.ts` (saved answers, question recognition), `tailor.ts`, `coverLetter.ts`, `docx.ts` (Word file), `channels.ts`, `runner.ts` (the queue), `prepare.ts`, `store.ts` (database calls and page state).
- **Screens**: `src/components/apply/` — `AutoApply` (container), `ApplicationSummary`, `ApplicationPreferences`, `ApplicationProfile`, `ApplicationReview` (review + confirm), `ApplicationProgress` (live + completion), `ApplicationQueue`, `ApplicationReceipt` (answer / send / receipt), `ApplicationStatus`, `ApplicationCredits`, `ApplicationTracker`, `ApplyChannelControl` (admin).
- **Database**: `supabase/migrations/20261204090000_auto_apply.sql`.
- **Function**: `supabase/functions/apply/` (`core.ts` + `index.ts`).
- **Tests**: `src/lib/apply/__tests__/` (run with `npm test`) and `supabase/tests/auto_apply.test.sql` (scratch database only; it rolls itself back).

## For admins: numbers

- `select apply_funnel(30);` — people and events at each step over 30 days, and outcomes.
- `select apply_learning();` — response and interview rates by match range, country, priority, sponsorship, tailored CV, cover letter. Returns `{enough: false}` until 30 applications are at least 14 days old; a group under 10 applications gets no rate.

## Status on 7 Oct 2026

Passed:
- Typecheck; build; lint with no new problems (the repo's existing 107 errors and 53 warnings are unchanged).
- 112 unit tests (`npm test`).
- 17 database test groups, on a local PostgreSQL 16 after all 99 earlier migrations ran in order (Supabase's auth, storage, timers and network were stand-ins). The new migration ran twice without error.
- The whole flow in a real browser against that database and the real function code, with a pretend mail service: guest, free account, Pro, first-time setup, review, confirm, live progress, a question MadeVisa couldn't answer, sending ready applications, pause / resume / stop, closing the page mid-batch and coming back, the monthly limit, a refused email and a retry, the tracker and receipts; at 320, 390, 768 and 1280 px. The tailored Word file opened correctly in LibreOffice.

Not run:
- Nothing against the live Supabase project.
- No real email through Resend.
- The Greenhouse question list against Greenhouse's live API (tested against the documented shape only).
- Real CVs with unusual layouts through the tailoring.

Seen while testing, not caused by this update: at exactly 320 px and 768 px the site header was a few pixels wider than the screen in my test browser, with or without Auto Apply on the page. My test browser had no web fonts, so check on a real device before treating it as a bug.
