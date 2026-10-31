# MadeVisa Chrome extension

New jobs abroad the moment they're published, a job alert with notifications, and every
MadeVisa tool one click away. Plain JavaScript (Manifest V3), nothing to build.

## 1. Add the two public values (once)

Open `config.js` and paste the same two values the website uses
(Vercel → your project → Settings → Environment Variables):

- `SUPABASE_URL` = the value of `VITE_SUPABASE_URL` (looks like `https://abcd1234.supabase.co`)
- `SUPABASE_ANON_KEY` = the value of `VITE_SUPABASE_ANON_KEY` (a long `eyJ…` text)

The anon key is public by design: the website already ships it to every visitor. It can only
read what the database lets anyone read (published jobs; never apply links or emails).

## 2. Try it on your computer

1. Chrome → `chrome://extensions` → switch on **Developer mode** (top right).
2. **Load unpacked** → pick this `extension` folder.
3. Pin it (puzzle icon → pin MadeVisa). Click the plane icon.

## 3. Publish on the Chrome Web Store

1. Make a zip of the **contents** of this folder (manifest.json at the top level of the zip).
   Leave out the `store` folder and this README.
   On a Mac, in Terminal inside the folder:
   `zip -r ../madevisa-extension.zip . -x "store/*" "README.md" ".*"`
2. Go to https://chrome.google.com/webstore/devconsole — pay the one-time $5 developer fee
   if you haven't.
3. **New item** → upload the zip.
4. Fill in the listing with the texts in `store/listing.md`, and upload:
   - icon: `icons/icon128.png`
   - screenshots: `store/screenshot-1.png`, `-2`, `-3` (1280×800)
   - small promo tile: `store/promo-small-440x280.png`
5. Privacy tab: paste the answers from `store/listing.md` (single purpose, permissions,
   data use). Privacy policy URL: `https://madevisa.com/privacy`.
6. Submit for review (usually 1–3 days).

## What it does

- **New jobs** tab: the newest live jobs (or the ones matching your alert), with logo,
  country flag, "Visa" and "New" marks. Click → the job on madevisa.com.
- **My alert**: job titles/skills, country, visa sponsorship only, how often to check.
  Every 15 min – 3 h the extension checks for new matching jobs; the icon shows a count and a
  notification appears (one per job, or a summary when there are many).
- **Tools**: CV match, sponsorship documents (members), company insights, visas by country,
  and the membership ($12.50 once, lifetime) → madevisa.com/pricing.
- Search box → madevisa.com/jobs with that search. "Sign up free" → madevisa.com/register.
- Every link carries `utm_source=chrome_extension`, so visits from it show up in your stats.

Permissions: `alarms` (check on a timer), `notifications` (new-job alerts), `storage`
(your alert settings). No access to your browsing, tabs or other sites.

Fonts: Geist (SIL Open Font License, `fonts/GEIST-OFL.txt`).
