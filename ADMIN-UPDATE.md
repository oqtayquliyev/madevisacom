# Control room, CVs, social media — what changed and how to put it live

Built 3 Oct 2026, on top of the CV match update (`CV-MATCH-CHANGES.md`). This package holds both, so it works whether or not you already put the first one live.

## Before you copy: which social media page do you have?

This was built on the project zip you uploaded on 3 Oct. That zip has the social admin page with the tabs **Up next · Strategy · Content ideas · News desk · Published · Campaigns · Platforms · Manual image**, and no migration `20261125090000_social_reel_backgrounds.sql`.

If your live site instead shows **Schedule · Posted · Post types · News desk · Settings** (the later “schedule and clips” update), your project is newer than that zip. Then copy everything **except** the files marked *social* in the list at the bottom — they would undo that update — and send the current versions of those files so the social changes can be redone on top of them. The Control room, the CVs tab, the upload limits, the wording and both SQL files are safe either way.

## Putting it live — three deploys, in this order

**1. The site (GitHub → Vercel).** Copy the files over your project (same paths) and push. If you haven't done the first update yet, also delete the six files listed in `CV-MATCH-CHANGES.md` and run `npm install` once.

**2. The database (Supabase → SQL Editor).** Run, each in one paste, in this order:

1. `supabase/migrations/20261126090000_cv_match_one_plan.sql` (skip if already run)
2. `supabase/migrations/20261127090000_control_room_cvs_media.sql`

Both can be run more than once. Until the second one is run, the Control room and CVs tabs show a note asking for it and everything else works as before.

**3. The pipeline.**

- Add the secret `PIXABAY_API_KEY` to the function (Supabase → Edge Functions → Secrets). The key is free: log in at pixabay.com, open pixabay.com/api/docs, and your key is shown in the parameter table. (Pexels stopped giving out new keys; if you already have a `PEXELS_API_KEY`, that works too.)
- `supabase functions deploy auto-pipeline --no-verify-jwt`
- Pushing to GitHub (step 1) already updates the reel renderer (`scripts/render-reels.mjs`).

Then: Admin → Social media → Photos & clips → **Fill the library**. Each press fills about 15 countries and takes up to two minutes; press again until the note says the library is full. Pixabay photos are copied into your own storage (`social-images/library/`, roughly 100 MB for the whole library), because Pixabay doesn't allow linking to its photos permanently.

---

## Admin → Control room (the first tab now)

**The button.** “Start everything” switches on, and runs once straight away:

| Part | What it does | Its settings stay in |
|---|---|---|
| Job sync | re-reads every company's careers page: new vacancies in, closed ones down | Import & sync |
| Publishing | releases waiting vacancies through the day | Import & sync |
| Company finder | searches for and adds new companies with their jobs | Import & sync |
| Social media | writes and posts on every network that is switched on | Social media |

Tick boxes choose which parts the button drives. “Stop everything” switches all four off; posts not yet sent are withdrawn, published jobs and posts stay. Each part can still be switched on its own in its tab, as before — the Control room shows the true state of each either way.

**The last 24 hours** (or 7 days): sign-ups, CVs added (and replaced, and tried by visitors without an account), match checks, jobs published and closed, companies added, social posts by network, plan requests and Pro started, sponsorship documents — each with the change against the period before — an hour-by-hour chart, the latest sign-ups (with or without a CV), the latest CVs, and what the server did. It refreshes every minute.

## Admin → CVs (new tab)

Every CV stored with an account, newest first. Search a name, an email, a file name or any word inside the CV. Open one to see the text, what the site read from it (titles, years, education, languages, skills), the jobs it was checked against with scores, and to download the original file.

CVs of visitors without an account never leave their browser, so they are counted but can't be listed.

**Because admins can now read CVs, the site's wording changed.** “Only you can see it” became “never sent to employers”, the two FAQ answers (“Who sees my CV?”) and the Privacy Policy now say that authorised MadeVisa staff can open CVs to run and support the service. Please read the Privacy Policy paragraph — it is a promise to your users.

**Limits**, so nobody can flood the system:

- without an account: 3 different CVs a day per visitor (counted on the server by a one-way code of the network address; nothing of the CV is stored). After that: “create a free account to keep going”.
- with an account: 15 CV changes a day.
- as before: 5 MB per file, 60,000 characters of text.

To change the numbers: `cv_guest_daily_uploads()` and the `15` in `user_cvs_limit()` in the migration.

## Admin → Social media

**New posts about what MadeVisa now is.** The theme “Visa Plan” became **Your application**, with seven new formats (all listed under Content ideas, where each can be switched off or tried): *How well does your CV match?*, *Where the score comes from*, *The skill your CV forgot*, *CV fix of the day*, *What's free, what's Pro*, and two reels (*Check your match*, *One CV fix*). Older posts that promised a free document are gone; the plan post now starts with “check your match”.

**30 minutes apart.** Any two posts, on any networks, are now at least 30 minutes apart. The number is under Strategy (10–180). The program's own Start / Stop button is unchanged, and the Control room button drives it too.

**Real photos instead of graphics only.** Strategy → *Photo first* (the default): each post opens with a real photograph — the country's streets, people at work — with the headline on it and the photographer's name; the card with the numbers follows as the second image. Reels play real clips from the library behind the text. *Graphic* brings back cards only.

**Photos & clips (new sub-tab).** The library the photos come from: about 10 photos and 5 clips per country plus general ones (people at work, interviews, airports). “Fill the library” fills it on the server from Pixabay; it tops itself up daily while the program runs. You can switch any item off, remove it, or add your own photo or clip by address. The old one-photo-per-country list still works as a fallback.

**Signed by (optional).** Strategy → a first name of a real person on your team; captions then end “— Name, MadeVisa”.

### What was not built, and why

Posts are not written as an invented blogger telling “her” experience, and stock faces are not presented as that person. A made-up person's first-hand story presented as real is a fake testimonial. Consumer-protection rules in the EU, UK and US treat fake testimonials as misleading advertising (worth confirming with a lawyer for your markets), the networks' own rules forbid inauthentic content, and for a site that asks people to trust it with a visa move it is the kind of thing that ends badly when noticed. Your content program already had the rule “no made-up testimonials”.

What gives the same human feel honestly:

- a real team member signs the posts (the setting above), and films two or three short clips — add them under Photos & clips → “Add your own”;
- real user stories, once you have them: ask people who got a job to send a line and a photo with their permission, and post those through the News desk;
- the “Real outcomes” theme already posts true totals from your users' reports.

## Checked, and not checked

Checked here: typecheck, lint and build; the pipeline's type check; all new post formats written with sample data; the 30-minute rule over a simulated week on five networks (closest two posts: exactly 30 minutes); the photo template drawn; every new admin screen in a browser with a simulated database; and both SQL files on a local PostgreSQL 16 with all 93 migrations run in order, then exercised as an admin, two users, a visitor and the pipeline (limits, admin-only access, start/stop, the 24-hour numbers, CV list and search).

Not run against the live services: your real Supabase project; **Pixabay itself** (the fill and what the photos look like — it was run against a simulated Pixabay only, so look through the library after the first fill and switch off anything that doesn't fit; Pixabay's largest free photo size is 1280 px, a little soft on a 1080-wide post); posting to the real networks; the reel renderer with library clips.

## Files changed in this round

Safe for every version of the project:

```
src/pages/admin/AdminPanelPage.tsx                two new tabs
src/pages/admin/ControlRoom.tsx                   NEW
src/pages/admin/CvsSection.tsx                    NEW
src/lib/cv/store.ts                               upload limits
src/components/cv/CvCard.tsx, CvGate.tsx, MatchPanel.tsx                                    wording
src/pages/cv/CvMatchPage.tsx, pricing/PricingPage.tsx, landing/components/LandingHero.tsx   wording
src/data/legalContent.ts                          Privacy Policy
supabase/migrations/20261127090000_control_room_cvs_media.sql     NEW
```

*Social* — only on top of the social page from the zip of 3 Oct (see “Before you copy”):

```
src/pages/admin/SocialSection.tsx
src/pages/admin/social/MediaLibrary.tsx           NEW
src/pages/admin/social/ProgramPanel.tsx, StrategyPanel.tsx, ReelParts.tsx, shared.tsx
api/_post.ts, api/og/post.ts                      photo image template
scripts/render-reels.mjs                          reels use library clips first
supabase/functions/auto-pipeline/media.ts         NEW
supabase/functions/auto-pipeline/index.ts, program.ts, programCatalog.ts, programFormats.ts, programSchedule.ts, programVoice.ts
```

From the first update, also *social*: `supabase/functions/auto-pipeline/monthly.ts`, `social.ts`.
