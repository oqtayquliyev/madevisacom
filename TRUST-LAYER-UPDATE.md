# Trust layer: what changed

Built 28 Oct 2026, on top of CONVERSION-BOOST-UPDATE.md. The focus is real jobs, safe applying, real outcomes, and one screen that tells you whether MadeVisa works.

## 1. The apply link is locked on the server
- Before: the company's apply address was in the data every browser downloaded, so the popup only *hid* it.
- Now: visitors who aren't signed in can't read `official_url`, `application_url` or `contact_email` from the database at all.
- `job_apply_link()` hands the address to: members, the job's own company, admins, and **one free application** per account or per browser. The server counts the free application now, not the page.
- The job page asks the server for the link (`src/lib/applyLink.ts`). The sponsorship-document builder reads it as before when signed in.
- **Gaps that remain:**
  - Signed-in non-members can still read those columns. The company and admin screens use the same database role, and moving them to server functions is a separate job.
  - `seo_job` isn't in your migrations (it was made in the dashboard). If it returns `official_url`, edit it so it doesn't. The site no longer uses it there.
- **Rule for the future:** after adding a column to `sponsored_jobs`, run `SELECT public.regrant_public_job_columns();` so visitors can read the new column.

## 2. Job Reality Score and scam shield (job page)
- A pill in the job header: **Verified live / Looks real / Be careful**, plus what was checked, e.g. "Checked live on Formue's careers page 2 hours ago". Tap it to see every reason and the score.
- A red or amber warning above the ad when it shows scam signs:
  - asks for a fee or deposit
  - pay in crypto or gift cards
  - "guaranteed visa", or no interview
  - asks for your passport or bank details up front
  - apply only via WhatsApp or Telegram
  - a recruiter on a free email address (not checked for jobs that come straight from the company's careers page)
- Fees the employer pays ("visa fees are paid by the company") are not flagged.
- The popup shows "Checked live on <company>'s site X hours ago" when that is true.

## 3. Outcome loop
- Signed-in people with a tracked application 5+ days old get a small card: **"Did Formue reply about Graphic Designer?"**, answered in one tap: replied / interview / offer / rejected / no reply yet (asks again in a week) / I didn't apply.
- Answers feed reply rates, reply odds and GhostGood.
- The popup now shows **real** numbers ("N employer replies and M interviews tracked by members in the last 30 days"), but only once there are 10+ replies. Until then it shows nothing; nothing is made up.

## 4. Admin → Today (now the first admin tab)
- **North Star:** employer replies per paying member.
- **"Do this today":** the weakest link first, e.g. stale jobs, jobs with no apply address, a low reply rate, unanswered check-ins, the popup or the payment step.
- Outcomes, job freshness (% re-checked in 24 h, median hours since a check, stale 72 h+), members and the paywall funnel.

## Deploy (in this order: the database first)
1. **Supabase SQL Editor:** run `20261231120000_conversion_boost.sql` if you haven't yet, then `20261231130000_trust_layer.sql`.
2. Push the site.

Pushing the site before running the migration is safe: until the migration runs, members still get their link the old way.

## Checked here
- Typecheck and ESLint: no new errors.
- Tests: 102 pass, including 7 new ones (scam patterns and the employer-pays exception, reality levels).
- SQL on a scratch Postgres 16:
  - as a visitor, reading `official_url` gives "permission denied"
  - the free application works once and again on the same job, then is refused for a second job
  - `public_outcome_stats` and `admin_north_star` return the expected shapes
  - running the migration twice is fine
- Screens on a phone with mocked data: the scam warning, the reality pill, the locked edge panel.
- **Not seen on screen:** the check-in card (it needs a signed-in session with real tracked applications).

## Not built yet (needs your decisions)
- **Employer side:** shortlists of sponsorship-ready candidates, employer accounts, employer payment.
- **A higher tier** with an outcome guarantee: needs a second Gumroad product and a price.
- **Verified candidate profile:** work-authorization route, notice period, references.
- **Honest AI application helper:** you removed Auto Apply. Why matters before rebuilding it.
- **Localization and local payment methods.**
