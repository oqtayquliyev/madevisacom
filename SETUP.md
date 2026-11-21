# MadeVisa 2.0 — setup (Cloudflare only, free plan)

Supabase is gone. Everything now runs on things you already have:

| What | Where | Free limit | MadeVisa uses |
|---|---|---|---|
| Website | Cloudflare Worker `madevisacom` | 100,000 requests/day | ~10–20k/day (pages are cached 5 min) |
| Database | Cloudflare **D1** `madevisa` | 500 MB, 5M rows read/day, 100k rows written/day | ~60–120 MB, reads are tiny, ~25k writes/day |
| Daily job cycle | **GitHub Actions** (in your repo) | 2,000 minutes/month (private repo) | ~5–10 min/day |

**Why the job cycle runs on GitHub and not inside Cloudflare:** a free Cloudflare Worker may use only
10 ms of CPU per run — too little to read thousands of job ads. GitHub Actions is free, has no such
limit, and writes the results straight into your Cloudflare D1 database. The website itself only reads.

You don't need to copy anything from Supabase: jobs are fetched fresh. (Ask Supabase support to cancel
the unpaid organisation.)

---

## Step 1 — Put this code in your GitHub repository

The new code replaces the old one completely (the old code stays in the Git history).

With **GitHub Desktop**: open your `madevisacom` repository → *Repository → Show in Finder* → delete
everything in the folder **except the hidden `.git` folder** → copy in all files from this zip
(including the hidden `.github` folder and `.gitignore`) → back in GitHub Desktop, write a summary like
"MadeVisa 2.0 on Cloudflare D1" → **Commit to main** → **Push origin**.

(Mac: press `Cmd + Shift + .` in Finder to see hidden files.)

## Step 2 — Create the database (DONE: `madevisa`, id f303152e-355a-4f77-b855-595d824aca73)

1. Cloudflare dashboard → left menu **Storage & databases → D1 SQL database** → **Create database**.
2. Name: `madevisa` (exactly this). Location: *Automatic*. → **Create**.
3. Copy the **Database ID** shown on the database page (looks like `a1b2c3d4-…`).
4. In your repository open `wrangler.jsonc` (on github.com: click the file → pencil icon) and replace
   `PASTE-YOUR-D1-DATABASE-ID-HERE` with that ID → **Commit changes**.

## Step 3 — Create the tables (DONE)

1. Still on the database page → **Console** tab.
2. Open `schema.sql` from this zip, copy all of it, paste it into the console → **Execute**.

## Step 4 — Let GitHub write into the database (nothing to do)

No API key is needed. The daily run proves it comes from this repository with GitHub's own
short-lived sign-in token (OIDC); madevisa.com/api/sync checks it and only accepts runs of
`oqtayquliyev/madevisacom` on the `main` branch (`GITHUB_REPO` in `wrangler.jsonc`).

## Step 5 — Deploy the website

If your Worker is connected to GitHub (Cloudflare → **Workers & Pages → madevisacom → Settings →
Build**), the push in step 1 / commit in step 2 deploys it by itself. Check there that:
- **Build command** is empty, **Deploy command** is `npx wrangler deploy`
  (the build runs automatically from `wrangler.jsonc`).

If it is *not* connected: on your computer, in the project folder, run `npm install` then `npx wrangler deploy`.

Old settings you can delete (Worker → Settings → Variables and Secrets): every `VITE_SUPABASE_…`,
`SUPABASE_…`, `GUMROAD_…` and other old variables. They are no longer used.

## Step 6 — Run the first job cycle

GitHub → your repository → **Actions** → **Daily jobs** → **Run workflow** → **Run workflow**.
It takes a few minutes. Then open **madevisa.com/admin**: you see how many jobs were added and
which company feeds failed. From now on it runs **every 15 minutes** by itself (jobs older than 7 days are removed).

The first run adds at most 5,000 jobs (daily write limit); the rest come the next day.

---

## Admin panel

**madevisa.com/admin** — live jobs, new today, visa share, companies, countries, sources, run history
and failed feeds. Protected by Cloudflare Access (Zero Trust → Access → Applications → "MadeVisa admin"):
only `oqtayquliyev@hotmail.com` gets in, with a one-time code sent by email (or your Cloudflare login).
To let someone else in, add their email to the "MadeVisa owner" policy.

## Everyday use

**Add or remove companies:** edit `fetcher/companies.json` on github.com (pencil icon) → Commit.
Put the company's job-board id under the platform it uses:

| Careers page looks like | Put this | Under |
|---|---|---|
| `boards.greenhouse.io/stripe` or `job-boards.greenhouse.io/stripe` | `"stripe"` | `greenhouse` |
| `jobs.lever.co/spotify` | `"spotify"` | `lever` |
| `jobs.ashbyhq.com/notion` | `"notion"` | `ashby` |
| `apply.workable.com/acme` | `"acme"` | `workable` |
| `acme.recruitee.com` | `"acme"` | `recruitee` |
| `acme.jobs.personio.de` | `"acme"` | `personio` |
| `jobs.smartrecruiters.com/Acme` | `"Acme"` | `smartrecruiters` |

The starting list was made without internet access, so some ids may be wrong: after the first run,
**madevisa.com/status** lists every feed that failed — fix or delete those lines.

**Settings** (top of `companies.json`): `windowDays` (how old a job may be, default 7), `everyHours` (read a feed only every N hours),
`maxNewPerRun` (5,000), `maxJobs` (15,000 — keeps the database far under 500 MB).

**Run now:** GitHub → Actions → Daily jobs → Run workflow.

**Every 15 minutes:** each "Daily jobs" run fetches every 15 minutes for about 5½ hours, then starts the
next run itself (GitHub's own timer never fired for this repository). If the chain ever stops, press
**Run workflow** once to restart it. This only stays free while the repository is public.

**The free book:** the corner box and /book link to `BOOK_URL` in `worker/html.ts`.

**Change texts:** `content/pages.ts` (About, Privacy, Terms …), `content/visa/countries/*.ts`
(visa guides), `content/bookPromo.ts` (book reviews). The book's buy link is `BOOK_URL` in
`worker/pages/misc.ts`.

---

## What changed

**Kept (all free):** fresh jobs board with search and filters (country, visa sponsorship, remote,
salary, posted date), job pages with visa / salary / experience facts, CV match (now 100% in the
browser), work-visa guides for 21 countries, the job market page, the book page, About / How it
works / policies, sitemaps, Google job markup.

**Removed** (needed Supabase, paid servers or sign-in): accounts and login, membership / pricing /
Gumroad checkout, Auto Apply, Visa Plan sponsorship proposals, Company Scores (needed user reports),
job alert emails, outreach / email finder, social media and Telegram posting, translations, admin
panel, OG image generator. Old addresses redirect to the closest page; old job links show
"This job has closed".

**Look:** a normal full-width website built from a classic 1999 web-portal style kit — blue title
strips, light-yellow boxes, grey bevelled buttons, sunken inputs, underlined blue links, the original
MadeVisa logo. No charts. Works on phones.

## Files

```
worker/            the website (one Cloudflare Worker)
  index.ts         routes, caching, redirects, daily cron
  pages/*.ts       each page
  html.ts          windows, dialogs, icons, page layout
client/*.ts        small browser scripts (jobs board, CV match, clock) → built into public/js
public/            CSS (retro.css), images, robots.txt
fetcher/           the daily job cycle (runs on GitHub Actions)
  companies.json   ← the list of companies
  run.ts           the cycle
  sources.ts       readers for Greenhouse, Lever, Ashby, Workable, Recruitee, Personio, SmartRecruiters, Arbeitnow, Remotive
content/           texts and visa guides
lib/cv/            CV match engine
schema.sql         database tables
```

Test on your computer: `npm install`, `npm run db:setup:local`, `npm run jobs:local`, `npm run dev`
→ http://localhost:8787
