# Free plans, 3-month pricing, new font, title-first UI

Built 28 Oct 2026.

## 1. Running on the free plans

### Supabase Free
Limits: 500 MB database, 1 GB files, 5 GB egress a month, a small shared computer, no backups. The project pauses after a week without activity.

- **Migration `20261231140000_free_plan.sql`:**
  - **Nightly log cleanup**, run once immediately too. Paywall events are kept 90 days; job views, pipeline logs, email-provider events and CV-search logs 30 days; email logs and notifications 120 days; pg_cron's own run history 3 days. Jobs, accounts, CVs, payments and applications are never touched.
  - **Calmer background jobs.** The email outbox went from every 5 seconds to every minute. Auto-release, site stats, the company finder, the social program and a few others now run every 2–30 minutes instead of every few seconds. Emails still go out within a minute.
  - **`admin_storage_report()`:** the database size against 500 MB, plus the largest tables. It shows in **Admin → Today**, which warns at 85%.
- **Reels:** video files are kept 3 days instead of 10, because files count against the 1 GB.
- **Jobs list:** a visitor's copy of the list is kept 30 minutes instead of 10, so fewer downloads count against egress.
- **Weekly backup:** `.github/workflows/db-backup.yml` runs every Sunday. Add the GitHub secret `SUPABASE_DB_URL` (Supabase → Connect → Session pooler, with your password). The dump is kept 30 days as a private artifact.

**Before switching to Free:** run the migration, then open Admin → Today and check the database size. Over 500 MB, Supabase can make the database read-only, so trim the largest tables first.

### GitHub Actions (free minutes)
- The reel renderer's safety-net run is now every 3 hours instead of hourly.
- Add the Supabase secrets `GITHUB_DISPATCH_TOKEN` and `GITHUB_REPO` and each reel renders minutes after it's written.
- An unrendered reel now waits 5 hours before it is dropped.

### Vercel Hobby
- **The limits are fine for this traffic.**
- **Hobby is for non-commercial use only.** MadeVisa sells memberships, so Vercel can pause the account.
- **The safe free option is Cloudflare Pages.** Its free plan allows commercial use. Moving `api/` (job pages for Google, share images, reel images, sitemap) takes a few hours of porting and isn't done in this update.

## 2. The 3-month plan: $4.99 (about $1.66 a month, save 27%)

**Where it shows:**
- **The popup:** "3 months" and "Monthly" side by side, 3 months picked first. The button reads "Unlock this job — $4.99 for 3 months".
- **The pricing page:** rebuilt around the two plans ("Your job-search toolkit. 3 months for $4.99.").
- **Checkout:** `/checkout?billing=quarterly` opens Gumroad on the 3-month price.

**How it works on the server:**
- The `gumroad` function opens a 3-month checkout **only when the product's quarterly price on Gumroad is exactly $4.99**. Otherwise it refuses and logs why. Monthly is unchanged.
- The subscription runs 3 months from the payment. The existing renewal code already handled `quarterly`.

**Subscription Terms:** updated to cover 3-month billing, renewal and cancellation for the period you paid for. Please review them.

**Set up in Gumroad, or the 3-month button won't open:** Products → Membership → its one tier → switch on **Quarterly** → price **$4.99**. Leave purchasing-power pricing off. Then redeploy: `supabase functions deploy gumroad --no-verify-jwt`.

## 3. Font: Geist everywhere
- Geist is free, open-licence, and very legible at small sizes. It's the clean product look of Vercel, Stripe and Linear.
- It replaces Inter for body text and the Fraunces serif on job titles and popup headlines.
- Headings use tighter letter-spacing.
- It loads from Google Fonts without blocking the first paint.

## 4. Title-first UI
- **Grey sentences under titles were replaced** by short bold chips (`src/components/common/TitleChips.tsx`) or removed. Pages changed:
  - landing hero and CV match section
  - jobs page
  - job page: the CV match panel, the sign-up invite, the source line and the report box
  - pricing
  - destinations: no blurb on each card
  - companies
  - CV match
  - the popup: the job shows as a "Title · Company" pill; the footer is shorter
- **Notes under each "Your edge" answer** are behind an ⓘ button now. Sources and estimate details are still one tap away.
- **Kept:** error and empty-state help, legal pages, the FAQ, and the "not partners" line under employer logos (shortened).

## Deploy
1. Supabase SQL Editor: run `20261231140000_free_plan.sql`.
2. Gumroad: add the Quarterly $4.99 price to the membership's tier.
3. Run `supabase functions deploy gumroad --no-verify-jwt` and `supabase functions deploy auto-pipeline`.
4. GitHub: add the `SUPABASE_DB_URL` secret, then run Actions → Database backup once.
5. Push the site.

## Checked here
- Typecheck and ESLint: no new errors.
- Tests: 103 pass, including a new test for the 3-month checkout. It only opens at Gumroad's $4.99 quarterly price; a missing or different price is refused.
- Build: OK.
- Migration on scratch Postgres 16: runs twice cleanly, slows a 5-second job to every minute, and the storage report works.
- Screens at 1366 px and 390 px with the real Geist font and mocked data: landing, jobs, job page with the popup, pricing, destinations, companies.
