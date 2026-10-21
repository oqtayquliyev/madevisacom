# One membership ($2.29), the paywall on jobs, guest checkout — what changed

Built 21 Oct 2026.

## What visitors see now
- **Every job is visible to everyone.** No sign-up for "Show more jobs" or the filters.
- **Opening a job (from the jobs list, the landing page, CV match, a company page or a shared link)** shows the membership card over the job page. **Apply stays locked** behind it and the job's own application link is no longer in the page for non-members. Members and admins see the page as before.
  The card: "1,240 more hotel jobs are waiting." (the visitor's last search on /jobs, or the job title they typed on /cv-match; otherwise the site's live job count), $2.29/month, **Subscribe now**, five short benefits (Remote and online job listings is 3rd), one rotating member quote, "Already a member? Sign in" and "Back to jobs". It fits one phone screen (checked at 390 × 844).
- **Subscribe → straight to Gumroad**, signed in or not. There is no checkout page of our own any more: `/checkout` only shows "Opening secure payment…" and redirects (old links keep working).
- **After a guest pays**: an account is created for the Gumroad email, the membership goes on it, and two emails go out automatically: **member_account** ("Your MadeVisa account is ready", how to sign in with a one-time code) and **member_welcome** ("You now have access to every job"). Both are editable in **Admin → Emails → Templates**; sent ones show in the email log as "Membership: account ready, welcome". Someone who already has a verified (or Google) account with that email simply gets the membership + the welcome email.
- **Pricing page**: one plan, rebuilt to the brief (headline, card, 7 benefits with icons, 10 employer logos in grey with a no-endorsement note, closing CTA, FAQ). Logos come from Simple Icons; Amazon and Mercado Libre have no mark there, so they are set as grey text.
- **Landing**: "Jobs abroad · CV match · Hiring insights" and "Reach people ready to move abroad" removed. The CV match example is now a looping animation (cursor drops a CV → score counts up → missing skills + a suggestion → jobs that fit + interview-chances bar). Pauses off-screen; reduced-motion users get the final frame.
- **Jobs page**: the newest jobs show at once (a 10-minute copy on the device, else one small request) with a "Loading the latest jobs for you…" bar instead of a frozen page; the full list loads behind them without reshuffling the top. **Show more jobs** is a blue button in a light-blue band, placed **before** the "email me latest jobs" box.
- **CV match**: step 1 = "What job are you looking for?" + upload CV (matching starts by itself, the title leads the search); step 2 = the matching jobs. Non-members picking a job get the membership card.
- **Removed**: Auto Apply everywhere (UI, admin tab, job-editor channel control, `apply` edge function, browser worker + its GitHub workflow, its tests), plan switching, Starter/Pro wording across the app, the old CV-quiz flow and every source file no longer imported anywhere (≈90 files).

## Social sharing / SEO
Not affected. Job pages are still server-rendered by `api/seo.ts` (title, description, JobPosting data, OG image) and crawlers/link previews read that HTML; the card is drawn by the app on top. Note: Google discourages full-screen interstitials on mobile; if search traffic to job pages drops, make the card dismissible (pass `onClose` to `<Paywall>` in `JobDetailPage.tsx`).

## Deploy (in this order)
1. **Gumroad**: set the product connected as Starter to ONE tier at **$2.29 monthly** (no yearly, PPP off). Optionally rename it "MadeVisa Membership" and add a content button to `https://madevisa.com/checkout/complete`.
2. **Supabase SQL Editor**: run `supabase/migrations/20261231090000_single_membership_guest_checkout.sql` (safe to re-run, deletes nothing).
3. **Function**: `supabase functions deploy gumroad --no-verify-jwt`. Optionally `supabase functions delete apply` (Auto Apply).
4. **Admin → Plans → Card payments**: press Connect again on the membership with the product link (re-reads the $2.29 price). Card payments must be **on for everyone** for guests to pay.
5. **Site**: `npm ci && npm test && npm run build`, push.

## Checked here
- Typecheck: 0 errors (the 7 old ones were in removed Auto Apply code). ESLint: 0 errors.
- Unit tests: 69 pass (billing + Gumroad function, incl. new guest-checkout and guest-purchase cases).
- SQL: all 133 migrations applied on a scratch Postgres 16; suites pass, incl. the new `single_membership.test.sql` (34 checks). `plans_billing.test.sql` pins the old two-plan state inside its own transaction.
- Screens: landing, jobs, job page + card, pricing, CV match, checkout redirect at 1366 px and 390 px with mocked data; no horizontal scroll.
- Not run here: `vite build` (npm registry blocked in this sandbox; bundled with Bun to prove every import resolves).

## Worth knowing
- An existing account whose email was never verified is not given a guest purchase automatically (anyone can sign up with any email). Admins get the usual "paid, no account matched" notice.
- Auto Apply's database tables/functions are kept (its two cron jobs are stopped); nothing was dropped.
- Some member quotes in `src/data/journeys.ts` mention "$2.99"/"$8.99". They are members' own words, so they weren't edited; the paywall skips quotes with prices.
- `legalContent.ts` (Subscription Terms) was rewritten for one plan; please review before going live.
