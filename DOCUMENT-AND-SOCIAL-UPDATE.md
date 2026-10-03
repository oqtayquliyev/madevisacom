# Document page, CV match steps and social reels — what changed and how to put it live

Built 3 Oct 2026 (evening), on top of `CV-RESULTS-UPDATE.md`.

## Putting it live — four steps

**1. Site.** Copy the files (list at the bottom), `npm run build`, push. The push also updates the reel maker, because GitHub runs `scripts/render-reels.mjs` from the repository.

**2. Database (Supabase → SQL Editor), in this order, each in one paste:**

- `supabase/migrations/20261130090000_document_edit_and_confirm.sql`
- `supabase/migrations/20261201090000_social_reels_first.sql`

Both can be run more than once. Until the first one is run, saved documents stay final as before (the edit panel simply isn't shown).

**3. Function.** `supabase functions deploy auto-pipeline --no-verify-jwt`

**4. Check that reels are switched on** (see "Why there were no reels" below).

---

## Sponsorship document page (`/brief/new`)

- **Name first.** If we don't know the visitor's name, the page asks for it before anything else: "First, your full name — as in your passport. Include your father's name if your passport shows it." One word isn't accepted. Signed-in people whose profile has a full name skip this step.
- **No more "Your name" documents.** A document with a gap can't be downloaded. The line under the header turns amber ("One thing is missing. Add your full name…") and the button becomes **Fix it**, which jumps to the field.
- **"Check your details"** is the first card: name ✓, company ✓, and three things to look at twice — the country ("The job ad is in Germany — make sure United States is where you will work"), the place of work, and the visa route when we have no checked route for that country.
- **Required inputs first**: full name, role line, country, then the company. The terms (who pays what, salary, note) sit under "Change the terms or add a note — optional", already filled with the recommended ones.
- **Small preview.** The document is a small card on the right (below the inputs on a phone) with **See full document**, which opens it full size over the page.
- **Pro members see the whole text** — no blurred lines, no PREVIEW watermark. Printing still only works after "Save & download", so the 50-a-month count stays right.
- The last check before saving now lists the place of work and the visa route, and its tick box reads "I've checked my name, the country, the place of work and these terms."

## Saved documents: editable, then "Confirmed"

- The owner can correct **name, role line, note and the terms** on a saved document (side panel → "Edit your document" → Save changes). Same link, nothing extra counted; the company always sees the latest saved version. The job, country and visa route can't be changed.
- The company has a new reply on the document: **We accept these terms** (name and work email required). From that moment:
  - the document shows a green **Confirmed by the Employer on <date> (<name>)** stamp, on screen and in the PDF;
  - the owner sees "Confirmed by <company>" and whether the email was on the company's own domain;
  - the document is locked — the server refuses further changes.
- A confirmation is not a signature; the document still says "Binding once signed by both parties".
- **The Sponsorship Document Terms were updated** to say this (they said "final after approval"). Please read the new wording under Legal → Sponsorship Document Terms before publishing.

## CV match (`/cv-match`)

- Step 2 lists the skills as **bullets**, with "Only the ones you really have." and a link **Every requirement, line by line, with Pro**.
- Step 3 asks **"Do you have a sponsorship document?"** and answers "If not, yours for South32 Limited is ready to download."
- CV fixes are **tags** ("Few numbers", "No LinkedIn link"…); tapping one shows what to do.
- The green percentage in step 3 is the real one — "N% of the documents made on MadeVisa were opened by the employer" — and appears once 30 documents exist (migration `20261129090000`). "X% more chance to be hired" is still not written: there is no data behind it.

## Social media

### Why there were no reels on Instagram and Facebook

Reels are only planned while the **video maker on GitHub** is reporting in. If it has never run (or stopped), the program quietly plans image posts only. Strategy now says so in the first card, in green or amber.

To switch it on:

1. GitHub → your repository → **Settings → Secrets and variables → Actions** → add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project settings → API).
2. Make sure `scripts/render-reels.mjs` and `.github/workflows/render-reels.yml` are in the repository (pushed).
3. **Actions → Render reels → Run workflow.** When it finishes, the line in Strategy turns green and reels join the plan within the hour.
4. Facebook and Instagram must be connected under Platforms, with more than 0 posts a day.

Two more reasons, now fixed:

- A reel only moved when the country had a **video clip**; with photos only it was one still photo. Now **every other reel is a slideshow of 3–5 library photos** (each with a slow zoom, cross-faded), and a country with no clips still gets a moving reel.
- Each network got about **one reel a day**. Now reels come first: **about 6 posts in 10** on Instagram, Facebook, TikTok and Telegram.

### New defaults

| Setting | Before | Now |
| --- | --- | --- |
| Reels | about 1 a day per network | 6 posts in 10 (Some 3 / Most 6 / Nearly all 8) |
| Reel background | clip, else one still photo | photos slideshow and clips, alternating |
| Time between any two posts, all networks | at least 30 min | 15–30 min at the closest, a different pause each time |
| Posts waiting together (late reel, retry) | could go out in the same minute | one at a time, never under 15 min apart |
| Instagram / Facebook / TikTok a day | 3 / 2 / 2 | 4 / 4 / 3 (only where you haven't set your own number — or press "Use the recommended settings") |

Posts still go out in each network's good hours (morning, lunch, evening…), not as one continuous stream: with about 16 posts a day, a 15–30 minute stream would be over in a few hours.

### Simpler Strategy screen

One card, **The basics**: the reels status line, "How many posts are reels", "Time between any two posts", posts a day per network, and **Use the recommended settings**. Everything else (themes, look, signature, clock, approval, countries, handles) is under **More settings**.

---

## Files

Site:

```
src/components/cv/TopMatches.tsx
src/pages/brief/BriefPage.tsx
src/components/briefs/EmployerReply.tsx
src/components/briefs/OfferBits.tsx
src/lib/briefs.ts
src/data/legalContent.ts
src/pages/admin/social/StrategyPanel.tsx
src/pages/admin/social/ProgramPanel.tsx
src/pages/admin/social/ReelParts.tsx
src/pages/admin/social/shared.tsx
```

Function (the admin screen reads the first two as well, so they are needed for the site build too):

```
supabase/functions/auto-pipeline/programCatalog.ts
supabase/functions/auto-pipeline/programSchedule.ts
supabase/functions/auto-pipeline/program.ts
supabase/functions/auto-pipeline/media.ts
supabase/functions/auto-pipeline/social.ts
```

Reel maker and SQL:

```
scripts/render-reels.mjs
supabase/migrations/20261130090000_document_edit_and_confirm.sql
supabase/migrations/20261201090000_social_reels_first.sql
```
