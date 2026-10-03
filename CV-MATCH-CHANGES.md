# CV match + one plan — what changed and how to put it live

Built 3 Oct 2026. Three deploys, in this order.

## 1. The site (GitHub → Vercel)

1. Copy the files from this package over your project (same paths).
2. Delete these files — they are no longer used, and `npm run typecheck` fails while they exist:
   - `src/components/briefs/ApplyNudge.tsx`
   - `src/components/briefs/BuyOffers.tsx`
   - `src/components/briefs/HiringBriefCallout.tsx`
   - `src/components/briefs/OfferButton.tsx`
   - `src/components/briefs/OfferWelcome.tsx`
   - `src/pages/landing/components/OfferSection.tsx`
3. Run `npm install` once (two new packages: `pdfjs-dist` reads PDFs, `fflate` reads Word files), then push.

The site works before step 2 below is done: CVs are then kept in the browser only, and the 3-a-day limit is counted in the browser.

## 2. The database (Supabase → SQL Editor)

Run `supabase/migrations/20261126090000_cv_match_one_plan.sql` in one paste. It can be run more than once.

It adds the CV table and a private `cvs` storage bucket, the daily check counter, raises Pro to 50 documents a month, and stops the free document for new accounts.

**The moment you run it is the cut-off:** accounts created before it keep their one free document if unused; accounts created after get none. Credits already bought or earned through invites are kept.

## 3. The social pipeline (only wording)

`supabase functions deploy auto-pipeline --no-verify-jwt`

Every automatic post that said "your first one is free" now says "see how it works". Until this is deployed, the old posts keep promising a free document that no longer exists.

Optional: `supabase functions deploy delete-account` (also removes the CV file when an account is deleted; the site already does this on its own).

---

## What visitors see now

**Job page.** "Visa Plan" next to Apply is replaced by **Check your match**. One press compares the CV with the ad and the button becomes the score ("94% · Strong match"). The big "Get sponsored for this job" block is gone; in its place is the match panel:

| | No account | Free account | Pro |
|---|---|---|---|
| Match score | every job | every job | every job |
| Skills missing from the CV | — | 3 jobs a day | every job |
| Each part of the score, what to change, CV checks | — | — | yes |
| Sponsorship documents | — | — | 50 a month |

Under the score is **Your application**: the CV (ticked) and the **sponsorship document — "Missing"** until one is made for that job, with "Add it with Pro · 50 a month · price". The same list appears as a small sheet when the person comes back from pressing Apply. Jobs in the visitor's own country don't show the document line.

**Sign-up.** The last step is "Upload your CV" — no skip. People who sign up with Google or from a dialog get the same step as a pop-up on the next page. Employers press "I'm here to hire" once. Accounts older than 7 days without a CV are reminded and can press "Later".

**Reminders to upload.** Landing hero, the new CV match section on the landing page, the top of `/jobs`, the dashboard, the profile sidebar, the pricing page.

**New page `/cv-match`** (in the main menu instead of "Visa Plan"): upload, what MadeVisa read from the CV, recently opened jobs to check, how the score works.

**Pricing.** One plan, MadeVisa Pro, monthly or yearly. Credit packs and Pro Relocation are gone. `/offers` still exists (footer, pricing page, profile) but is no longer in the menu.

## The score

Rules only, no AI service, runs in the visitor's browser. 100 points: skills 40, role fit 20, experience 15, wording 10, languages 8, education 7. A part the ad doesn't ask about is left out and the rest share its points. A required language missing from the CV holds the score at 60%. An ad with almost no text holds it at 70%.

To teach it a skill: add a line to `src/lib/cv/skills.ts` (`Name|other spelling|other spelling`).

## The price per country

`src/lib/pricing.ts`. $19 a month where income per person is $50k+ (same as before), sliding down to $5 in the lowest-income countries; yearly = 7.84 × monthly (about 35% off). Examples: Germany €17 / €130, Azerbaijan AZN 20 / AZN 160, Türkiye $15 / $118, India ₹700 / ₹5,500, Nigeria $5 / $39.

Two tables in that file are estimates and worth a look: `INCOME_K` (income per person by country) and `USD_RATE` (exchange rates). Countries with unstable currencies still see USD, as before.

## Admin

Admin → Plans shows the CV match numbers (CVs uploaded, people checking, who hit the free limit today). Activating a yearly request gives 12 months, as before.

## Not tested against the live services

Checked here: typecheck, lint, build, the scoring on sample CVs and ads, every screen in a browser with the database simulated, and the SQL file on a local PostgreSQL 16 with all 93 of your migrations run in order (Supabase’s own parts — sign-in, storage, timers — were stand-ins). Not run: the SQL file on your real Supabase project, real payments (still by request, as before), and CVs with unusual layouts (two columns, tables) — try a few of your own.

**Changed since this was written** (see `ADMIN-UPDATE.md`): the site no longer says “only you can see your CV” — admins can now open CVs, and the wording and Privacy Policy say so.

Legal text changed and should be read by you: Privacy Policy (a paragraph on CVs) and Sponsorship Document Terms (plan only, credits from before).
