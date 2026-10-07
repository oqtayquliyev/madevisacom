# MadeVisa — File Guide for Future Chats

Starting a new chat? Paste this line first so Claude has context fast:

> "This is madevisa.com, a React/Vite/TypeScript/Tailwind + Supabase visa/jobs/programs
> platform. I'm attaching the relevant files for [X]. Here's what I want changed: ..."

Then attach the files listed below for whatever you're touching. Always safe to
also attach `src/App.tsx` and `src/types.ts` — they show the whole routing
structure and help Claude orient instantly regardless of which page you're editing.

---

## Pages (attach these to change how something looks/behaves)

**Homepage**
`src/pages/landing/LandingPage.tsx`
`src/pages/landing/components/LandingHero.tsx`
`src/pages/landing/components/LandingHeader.tsx`
`src/pages/landing/components/LandingFooter.tsx`

**Jobs board**
`src/pages/landing/jobs/JobsPage.tsx`
`src/pages/jobs/JobDetailPage.tsx`
`src/data/jobs.ts`
`src/data/sources/arbeitnow.ts`
`src/lib/sponsoredJobs.ts`

**CV match (the score next to Apply) and the CV itself**
`src/lib/cv/` — the whole engine: `skills.ts` (skill dictionary — add a line to teach it a skill), `cvProfile.ts` (reads the CV), `jobProfile.ts` (reads the ad), `match.ts` (the score and the report), `extract.ts` (PDF/Word → text), `store.ts` (where the CV is kept), `checks.ts` (3 free a day)
`src/components/cv/` — `MatchButton.tsx`, `MatchPanel.tsx`, `ApplySheet.tsx`, `CvUpload.tsx`, `CvGate.tsx` (CV required at sign-up), `CvPrompt.tsx`, `CvCard.tsx`
`src/pages/cv/CvMatchPage.tsx` (`/cv-match`)
`supabase/migrations/20261126090000_cv_match_one_plan.sql`

**Auto Apply (the "Apply with MadeVisa" block on /cv-match, and "Your applications")**
`src/lib/apply/` — the rules: `decision.ts` (apply / review / skip, priority, sponsorship), `profile.ts` (saved answers — add a line to `RULES` to teach it a question), `tailor.ts` (the tailored CV and its "nothing added" check), `coverLetter.ts`, `runner.ts` (the queue), `allowance.ts`, `machine.ts` (allowed states), `channels.ts`, `store.ts` (database calls)
`src/components/apply/` — the screens: `AutoApply.tsx` (start here), `ApplicationSummary.tsx`, `ApplicationPreferences.tsx`, `ApplicationReview.tsx`, `ApplicationProgress.tsx`, `ApplicationReceipt.tsx`, `ApplicationTracker.tsx`, `ApplyChannelControl.tsx` (admin: switch a job to "applications through MadeVisa")
`supabase/migrations/20261204090000_auto_apply.sql` — every table and rule (allowance numbers: table `apply_settings`)
`supabase/functions/apply/` — the one server part: sends an application by email for employers that take them through MadeVisa
`AUTO-APPLY-UPDATE.md` — what it does and what it can't
Tests: `npm test` (and `supabase/tests/auto_apply.test.sql` on a scratch database)

**Pricing / the plan**
`src/lib/pricing.ts` (price per country, currencies, what's in the plan)
`src/lib/plans.ts`
`src/pages/pricing/PricingPage.tsx`
`src/components/pro/ProPlanCard.tsx`

**Programs (marketing page + real sponsored board)**
`src/pages/landing/programs/ProgramsPage.tsx`
`src/pages/programs/SponsoredProgramsPage.tsx`
`src/pages/programs/ProgramDetailPage.tsx`
`src/pages/programs/SubmitProgramPage.tsx`
`src/lib/programs.ts`

**Agencies & Experts marketplace**
`src/pages/experts/ExpertsMarketplacePage.tsx`
`src/lib/programs.ts`

**Destinations page**
`src/pages/destinations/DestinationsPage.tsx`
`src/data/destinationInfo.ts`

**Flights & Stays**
`src/pages/travel/TravelPage.tsx`
`src/lib/affiliate.ts`
`src/data/airports.ts`

**Login / Register / password reset / email pending**
`src/pages/auth/LoginPage.tsx`
`src/pages/auth/RegisterPage.tsx`
`src/pages/auth/ResetPasswordPage.tsx`
`src/pages/auth/PendingConfirmationPage.tsx`
`src/components/auth/AuthUI.tsx`
`src/components/auth/AuthSidePanel.tsx`
`src/lib/auth.tsx`

**Profile page (incl. "Become a partner")**
`src/pages/profile/ProfilePage.tsx`
`src/lib/programs.ts`

**Dashboard (saved jobs/programs)**
`src/pages/dashboard/DashboardPage.tsx`
`src/lib/applications.ts`

**Admin panel** (`/admin`)
`src/pages/admin/AdminPanelPage.tsx`
`src/pages/admin/ControlRoom.tsx` — the first tab: the Start / Stop everything button and the last-24-hours numbers
`src/pages/admin/CvsSection.tsx` — the CVs tab (list, search, open one, download)
`src/pages/admin/SocialSection.tsx` + `src/pages/admin/social/` — social media: `StrategyPanel.tsx` (mix, look, signature, minutes between posts), `MediaLibrary.tsx` (photos and clips), `ProgramPanel.tsx` (its own Start / Stop)
`supabase/migrations/20261127090000_control_room_cvs_media.sql` — everything those three need on the server
`src/lib/admin.ts`

---

## Cutting across many pages

**Routing / navigation / "page X doesn't open right"**
`src/App.tsx`
`src/types.ts`
`src/pages/landing/components/LandingHeader.tsx`

**Anything involving the database (new fields, new tables, permissions, RLS errors)**
Whole `supabase/migrations/` folder (all `.sql` files, in order — Claude needs to see
the full history to avoid conflicting with something already there)
`src/lib/supabase.ts`

**Image upload**
`src/lib/uploadImage.ts`
`src/components/common/ImageUploadField.tsx`

**Location detection / "Browsing as [country]" banner**
`src/lib/geolocation.ts`
`src/lib/originCountry.tsx`
`src/components/location/CountrySwitcher.tsx`

**Trip cost estimator widget**
`src/lib/costEstimates.ts`
`src/components/estimator/TripCostEstimator.tsx`

**Eligibility badges / "fits your profile" logic**
`src/lib/personalization.ts`
`src/components/opportunities/PersonalizationBar.tsx`

**Shared small components** (avatars, flags, phone input, company logos)
`src/components/common/CircleFlag.tsx`
`src/components/common/CompanyLogo.tsx`
`src/components/common/TravelerAvatar.tsx`
`src/components/common/PhoneInput.tsx`

---

## Quick examples

- *"Redesign the Jobs board cards"* → JobsPage.tsx + jobs.ts
- *"Add a new field to program submissions"* → SubmitProgramPage.tsx + programs.ts + the migrations folder (new column needs a migration)
- *"Header link goes to the wrong page"* → App.tsx + types.ts + LandingHeader.tsx
- *"Let agencies upload multiple photos"* → SubmitProgramPage.tsx (or ProfilePage.tsx) + ImageUploadField.tsx + uploadImage.ts + migrations folder
- *"Change the login page design"* → AuthUI.tsx + AuthSidePanel.tsx

## One habit that will save you the most time

Whatever Claude sends back, **always ask for the full changed file(s), not a diff** —
that's already the default, but confirm it — and **always test + redeploy immediately**
rather than batching several fixes unverified. Most of the back-and-forth we did in
this conversation was chasing "did the last fix actually get deployed?" — a new chat
won't have that shared memory, so a stale deploy will look like a brand-new bug to it.

Also: if something needs a **database change** (new column, new table, RLS fix), the
new chat will hand you SQL to run in Supabase's SQL Editor. Run it in **one paste, one
tab, one click** — don't split it across multiple query tabs, that's what caused most
of the "table not found" errors here.
