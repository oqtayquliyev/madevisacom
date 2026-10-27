# Conversion boost: checkout, popup, new job features, reels — what changed

Built 28 Oct 2026. Goal: more of the people who see the $2.29 popup actually pay.
Admin → Paywall showed two leaks: 2.4% of opens pressed “Subscribe now”, and 7 of 8 who pressed didn’t pay.

## 1. Checkout stays on MadeVisa (the 7-of-8 leak)
- “Subscribe” now opens **Gumroad’s payment form over the page** (Gumroad’s own overlay, `src/lib/gumroadOverlay.ts`) instead of sending people to gumroad.com. gumroad.js starts loading the moment the popup appears.
- If the script is blocked (ad blocker, slow network), the same link opens Gumroad’s page exactly as before. Nobody is ever stuck.
- Signed in: while the form is open, the payment is checked every 5 s and the page unlocks by itself (then `/checkout/complete`). Guests: GuestReturn starts watching for the payment the moment they press Subscribe (`CLAIM_EVENT`).
- `/checkout` (pricing page button) works with the overlay too: when the form closes it offers “Open the payment again / Back to jobs” instead of a spinner.

## 2. The popup (src/components/pro/Paywall.tsx)
- **What’s behind this job, shown but locked:** posted X hours ago on the company’s careers page · N people looked at it today (real counts, from 3 up) · recruiter email masked (`u••••••@f•••••.no`) · official visa-sponsor record · money left after tax & rent · your CV match · reply odds (up to 4 rows, so it still fits one phone screen).
- Button: **“Unlock this job — $2.29”**. Under it: the guarantee (“Not 10 visa-sponsor jobs in your field in 14 days? Full refund.”). The matching clause was added to the Subscription Terms (`src/data/legalContent.ts`), so **please review it** before going live.
- **Member quote from the visitor’s own country**, otherwise English only. The Bahasa quote no longer shows to people from Brazil.
- **One free application per browser.** The first Apply on a job opens it, with a note: “This application is on us. Your next one needs the membership.” The second Apply opens the popup. Change `FREE_APPLIES` in `src/lib/conversion.ts` (0 turns it off).
- **The popup comes up by itself only from the 3rd job page** a visitor opens. Before that it appears only when they press Apply. Change `AUTO_POPUP_FROM_VIEW`.
- **“First month for $0.99” offer**, once a week, when someone leaves (Back / Not now / Esc / mouse to the tab bar). Off until you set it up:
  1. In Gumroad → membership → Offer codes: create e.g. `FIRST099`, $1.30 off, first payment only.
  2. In Vercel: `VITE_GUMROAD_DOWNSELL_CODE=FIRST099` and `VITE_GUMROAD_DOWNSELL_PRICE=$0.99`, then redeploy.
- Admin → Paywall has new tiles: payment form opened, free applications used, offer shown, offer taken. The date column no longer shows “M10 27”.

## 3. New on every job page: “Your edge on this job” (src/components/jobs/JobEdge.tsx)
Members see the answers. Everyone else sees the rows blurred with a lock, and tapping a row opens the popup.
- **Sponsor proof:** official government records that the company sponsors visas, from the UK Home Office register (already there), the **Netherlands IND register** and **US USCIS H-1B data (approvals per year)**. NL and US load daily with the existing `{ cron: "sponsors" }` run (`auto-pipeline/sponsors.ts`, parsers in `_shared/sponsorParsers.ts`). The hero pill now says “Visa sponsor on record · UK, US, NL” for any of them.
- **Move math:** the salary in the ad, minus tax and rent there, compared with take-home pay minus rent where the visitor lives. Rough 2025 estimates per country, labelled as estimates. Edit them in `supabase/functions/_shared/moveMath.ts`. `/destinations` cards show the same figure per country.
- **Reply odds:** High / Fair / Low, with the reasons. It combines the company’s reply rate, how fresh the job is, how active the company is, visa fit and the CV match.
- **Your people here:** “5 people from Azerbaijan applied to Formue through MadeVisa”. It only shows from 3 people up and never shows names.
- Non-members no longer get the recruiter’s email, phone or website on the page (it was in the page before, just under the blur). The server-rendered job HTML (`api/seo.ts`, which every visitor’s browser receives) also stops containing the company’s apply address.

## 4. Reels
- **Covers:** every reel now gets a designed thumbnail: 2–4 huge lines in boxes, the number in yellow, the flag. It sits inside the 3:4 middle, so the Instagram grid shows it whole (`api/_reel.ts` scene `thumb`; the words come from `thumbLines()`).
- **Music, automatic:** upload tracks with a mood (Energetic / Upbeat / Chill / Emotional / Cinematic). Each reel picks a track of its mood, never one of the last 6, and **starts at the track’s drop** (where the energy jumps), so the first second hits on the beat. Tested locally: a track that gets loud at 4.0 s starts at 3.65 s.
- **Trending sounds:** no app allows adding its trending sounds through the API, and those in-app sounds are what the algorithm boosts. Paste this week’s list in Admin → Social media → Reels. Each new reel suggests one (“Trending sound to add in the app”) for when you post by hand.
- **Two new fast formats:** “Move math” (“$1,900 a month left in Germany vs about $100 in Pakistan”) and “Already sponsors visas” (white job screens marked Licensed UK visa sponsor).

## Deploy (in this order)
1. **Supabase SQL Editor:** run `supabase/migrations/20261231120000_conversion_boost.sql`. It is safe to re-run and deletes nothing.
2. **Functions:** `supabase functions deploy auto-pipeline`.
3. **Optional:** set the $0.99 offer env vars (above), upload music with moods, and paste trending sounds.
4. **Site:** `npm ci && npm test && npm run build`, then push. The reel renderer (`scripts/render-reels.mjs`) runs from GitHub, so pushing updates it.

## Checked here
- Typecheck: no new errors (the 3 that remain were there before, in `billing.test.ts` and `resend-webhook`). ESLint: 0 errors. Tests: 95 pass, including 18 new ones (quotes, masking, move math, reply odds, Gumroad messages and offer codes, IND/USCIS parsers including UTF-16 files, cover lines, moods).
- SQL: all migrations applied on a scratch Postgres 16. The new functions were exercised: US approvals add up across batches and a same-day re-run doesn’t double them; sponsor proof returns UK + NL + US; view counter; new paywall kinds accepted and unknown ones ignored; diaspora is null below 3.
- Screens: the popup at 1366 px and 390 px (the button is above the fold on a phone), and the edge panel locked, all with mocked data. A test reel was rendered with ffmpeg, including the cover and the drop start.
- **Not tested live:** Gumroad’s overlay itself, and fetching the IND and USCIS files (this sandbox can’t reach those sites). The first sponsors run will show in the pipeline log whether NL/US loaded; if a site changed its layout, the log says so and the old data is kept.

## Still open (recommended next)
- **The apply address is still readable for anyone who knows how:** `official_url` comes from Supabase to every browser, and the popup only hides it. The real fix is to revoke that column from `anon`/`authenticated` and serve it from a members-only RPC. That touches every job query, so it was left for its own change.
