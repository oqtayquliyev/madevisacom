# Moving MadeVisa off Supabase Cloud (+ 7-day jobs)

## Where to move: self-hosted Supabase on an Oracle Cloud "Always Free" server

MadeVisa doesn't just use Supabase as a database. It uses Supabase Auth (email codes, Google
sign-in, 2-factor), ~170 database functions called from the site, row-level security, Storage
buckets, 10 Edge Functions, and pg_cron + pg_net schedules. Moving to Firebase, Appwrite, Neon,
etc. means rewriting most of the app.

**Self-hosted Supabase is the same open-source software**, so the code doesn't change: only the
address and the keys do. Run it on:

| | Oracle Cloud Always Free (recommended) | Any small VPS (fallback) |
|---|---|---|
| Cost | $0 | ~€6–20 / month in 2026 |
| Size | 2 ARM CPUs / 12 GB RAM / 200 GB disk (Oracle cut it from 4/24 in June 2026 — still enough) | Need ≥ 4 GB RAM, 2 CPUs, 40 GB disk |
| Catch | Card needed to sign up; "Out of capacity" sometimes — retry; idle servers can be reclaimed (see below) | Paid |

Supabase's own minimum for self-hosting is **4 GB RAM, 2 cores, 40 GB SSD**.

> **Your website hosting doesn't change.** It stays on Vercel; you only change two environment
> variables there (step 7).

> **The unpaid invoice:** moving doesn't cancel it. Write to Supabase support, say you can't pay,
> ask them to cancel/downgrade the organization, and ask for a database export if the dashboard
> no longer lets you take one (step 0).

---

## Step 0 — Take a copy of everything now

Do this before anything else, while the old project still answers.

1. Supabase dashboard → **Connect** → copy the **Session pooler** connection string
   (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
2. On any machine with Docker + Node (or on the new server after step 2):
   ```sh
   npx supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
   npx supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
   npx supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only
   ```
   These include your tables, functions, policies, triggers **and `auth.users`** (so everyone's
   account and password carry over).
3. If the dashboard / connection is blocked (402 or "restricted"): Dashboard → Database →
   Backups → download the latest, or ask support for an export.

## Step 1 — Create the server (Oracle Cloud)

1. Sign up at cloud.oracle.com (pick the home region closest to your users — it can't change).
2. Compute → Instances → **Create instance**
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere → VM.Standard.A1.Flex**, 2 OCPU, **8 GB** memory (see "idle" below)
   - Boot volume: **100 GB**
   - Add your SSH key. Create. ("Out of capacity" → try again later / another availability domain.)
3. Networking → your VCN → Security List → **Ingress rules**: allow TCP **80** and **443** from
   `0.0.0.0/0`. Do **not** open 5432.
4. Oracle's Ubuntu image also blocks ports in iptables. On the server:
   ```sh
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
5. DNS: add an **A record** `api.madevisa.com` → the server's public IP. (On Cloudflare: "DNS
   only", grey cloud, at least until the certificate is issued.)

**Idle servers:** Oracle may reclaim an Always Free server when, over 7 days, CPU, network **and**
memory are all under 20%. Supabase + Postgres use ~3 GB, so on an **8 GB** server memory stays
above 20% — don't give it the full 12 GB. Safest: upgrade the account to **Pay As You Go**
(Always Free resources stay free; idle reclaim doesn't apply).

## Step 2 — Install Supabase + HTTPS

```sh
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git caddy postgresql-client nodejs npm
sudo usermod -aG docker $USER && newgrp docker

git clone --depth 1 https://github.com/supabase/supabase
mkdir -p ~/madevisa-supabase && cp -rf supabase/docker/* ~/madevisa-supabase && cp supabase/docker/.env.example ~/madevisa-supabase/.env
cd ~/madevisa-supabase
```

Edit `.env` (the Supabase self-hosting docs explain each line):

| Setting | Value |
|---|---|
| `POSTGRES_PASSWORD` | long random password |
| `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` | generate new ones (docs → "Generate API keys") — **new keys, everyone signs in again once** |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | your Studio login |
| `SITE_URL` | `https://madevisa.com` |
| `ADDITIONAL_REDIRECT_URLS` | `https://madevisa.com/**,https://www.madevisa.com/**` (same list as in the old Auth → URL configuration) |
| `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` | `https://api.madevisa.com` |
| `SMTP_HOST` / `PORT` / `USER` / `PASS` / `SENDER_NAME` / `ADMIN_EMAIL` | Resend SMTP: `smtp.resend.com`, `465`, `resend`, your Resend API key, `MadeVisa`, `hello@madevisa.com` (sign-in codes are sent this way) |
| `FUNCTIONS_VERIFY_JWT` | `false` (all MadeVisa functions were deployed with `--no-verify-jwt`; they check the caller themselves) |
| `ENABLE_EMAIL_AUTOCONFIRM` | same as the old project (Auth → Providers → Email → "Confirm email") |

Google sign-in: add to the `auth` service's `environment:` in `docker-compose.yml`:
```yaml
GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET}
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: https://api.madevisa.com/auth/v1/callback
```
…and put `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` in `.env`. In Google Cloud Console → Credentials →
your OAuth client → **Authorized redirect URIs**: add `https://api.madevisa.com/auth/v1/callback`.

Start it, and put HTTPS in front:
```sh
docker compose pull && docker compose up -d
echo 'api.madevisa.com {
  reverse_proxy localhost:8000
}' | sudo tee /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
`https://api.madevisa.com` should now open Studio (with your dashboard login).

## Step 3 — Restore the database

Copy `roles.sql`, `schema.sql`, `data.sql` to the server (`scp`), then:

```sh
NEW_DB_URL="postgres://postgres.$(grep ^POOLER_TENANT_ID .env | cut -d= -f2):$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2)@localhost:5432/postgres"

psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$NEW_DB_URL"
```
If it stops on a line like `SET transaction_timeout` (Postgres 17 only), comment that line out in
`data.sql` and run again.

Make sure the scheduler extensions are on (Studio → SQL editor):
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
```

Then, from the project folder (this zip), the new 7-day migration and the address rewrite:
```sh
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261231300000_seven_day_jobs_capacity.sql
psql "$NEW_DB_URL" -v old=https://fduetqpklyoxeqqdhozg.supabase.co -v new=https://api.madevisa.com \
     -f supabase/move/rewrite-project-url.sql
```
The second one fixes every saved link to the old address (logos/images in Storage, and the
job-facts / auto-pipeline / search-ping function URLs the scheduler calls).

**First big clean-up** (the old database had ~70,000 jobs; this brings it to the last 7 days).
In the SQL editor, run each block until it returns all zeros:
```sql
select public.job_window_enforce(20000);
select public.storage_diet_retention(20000);
```
Then give the space back once, and check:
```sql
vacuum (full, analyze) public.sponsored_jobs;
select public.job_capacity_check();
select public.job_capacity_status();
```
`is_full` should be `false`. If it's `true` because of the **database size** (not the job
count), another table is big — `select public.admin_storage_report();` shows which. On this
server you have plenty of disk, so you can simply raise the limit:
```sql
update public.job_capacity_settings set db_budget_mb = 20000 where id;
```
(Keep it under ~450 if you ever move back to the Supabase Free plan, which stops at 500 MB.)

## Step 4 — Files (Storage)

The dump has the file list, not the files. From the project folder (after `npm install`):
```sh
OLD_URL=https://fduetqpklyoxeqqdhozg.supabase.co OLD_SERVICE_KEY=<old service_role key> \
NEW_URL=https://api.madevisa.com NEW_SERVICE_KEY=<new SERVICE_ROLE_KEY> \
node scripts/copy-storage.mjs
```
If the old project is blocked, ask Supabase support for the Storage export too.

## Step 5 — Edge Functions

```sh
cp -r <this project>/supabase/functions/* ~/madevisa-supabase/volumes/functions/
```
(Keep the `main` folder that's already there — it routes `/functions/v1/<name>`.)

Copy the secrets you had in the old dashboard (Edge Functions → Secrets) into `.env` and into
the `functions` service's `environment:` in `docker-compose.yml`. The ones the code reads:
`GUMROAD_ACCESS_TOKEN`, `RESEND_WEBHOOK_SECRET`, `GOOGLE_INDEXING_SA`, `GOOGLE_INDEXING_KEY`,
`GOOGLE_TRANSLATE_API_KEY`, `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `PEXELS_API_KEY`,
`PIXABAY_API_KEY`, `FB_PAGE_ID`, `FB_PAGE_TOKEN`, `IG_ACCESS_TOKEN`, `IG_USER_ID`, `IG_API_HOST`,
`LINKEDIN_TOKEN`, `LINKEDIN_AUTHOR`, `LINKEDIN_VERSION`, `TIKTOK_TOKEN`, `TIKTOK_PRIVACY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` — only the ones
you actually use. (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are set by
the compose file already.) Then `docker compose up -d`.

## Step 6 — Turn the pipeline back on

Admin → Publish update → Automatic pipeline: check it's on. The new limits are already set
(only jobs posted in the last 7 days, ~1,400 published a day, 10,000 imported jobs max).
If `detect_bearer` was set to the old anon key, clear it or set the new one:
```sql
update public.auto_release_settings set detect_bearer = null where id;
```

## Step 7 — Point everything at the new address

| Where | What to change |
|---|---|
| **Vercel** → Project → Settings → Environment Variables | `VITE_SUPABASE_URL` = `https://api.madevisa.com`, `VITE_SUPABASE_ANON_KEY` = new `ANON_KEY` (and `SUPABASE_URL` / `SUPABASE_ANON_KEY` if you set those). **Redeploy** — Vite bakes them in at build. |
| **GitHub** → repo → Settings → Secrets → Actions | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the reels workflow) |
| **Resend** → Webhooks | `https://api.madevisa.com/functions/v1/resend-webhook` |
| **Gumroad** → Settings → Advanced → Ping | same URL as before with `https://api.madevisa.com/functions/v1/gumroad` at the front (keep the `?k=…` part) |
| **Google Cloud** → OAuth client | redirect URI from step 2 |
| Your own `.env` for `npm run dev` | same two `VITE_` values |

Users sign in once more (new keys); their accounts, passwords, CVs and memberships are all there.

## Step 8 — Backups (self-hosting has none by default)

On the server, `crontab -e`:
```
15 2 * * * pg_dump "postgres://postgres.TENANT:PASSWORD@localhost:5432/postgres" -Fc -f ~/backups/madevisa-$(date +\%u).dump
```
(7 rolling daily copies.) Copy them off the server now and then (Oracle Object Storage has 20 GB
free, or your own computer).

---

## Plan B — a Supabase Free project

If Supabase support lets you keep using a Free organization, the 7-day change makes the jobs fit
the Free plan (500 MB database, 1 GB files, 5 GB egress). Same steps 0, 3 (into the new project's
SQL editor / connection string), 4, 5 (`supabase functions deploy <name> --no-verify-jwt`), 7.
Downsides: Free projects pause after a week without traffic, no backups, 500 MB hard stop.

---

## What changed in this zip (7-day jobs, sized to the server)

- **`supabase/migrations/20261231300000_seven_day_jobs_capacity.sql`**
  - Imported jobs are shown **7 days after they're shared** on MadeVisa, then closed and deleted
    the next day. Jobs companies post and pay for on MadeVisa keep their 30 days.
  - **Capacity guard:** when there are ≥ 10,000 imported jobs or the database is ≥ 420 MB, new
    imports are skipped and today's publishing stops; it resumes on its own once there's room.
  - Fetching sized to match: only jobs posted in the last 7 days, ~1,400/day (300–2,000), target
    10,000 live (was 75,000 target, 6,000–10,000/day).
  - Weekly `VACUUM FULL` of the jobs table so the database file actually shrinks.
  - `select public.job_capacity_status();` shows the numbers. Change the limits with
    `update public.job_capacity_settings set max_imported_jobs = …, db_budget_mb = …, window_days = … where id;`
- **`src/lib/sponsoredJobs.ts`** — the board downloads the last 8 days (was 31), plus older
  company-posted jobs; old saved copies in browsers (~70k jobs) are thrown away.
- **`src/pages/landing/jobs/JobsPage.tsx`** — "Past 2 weeks" filter removed.
- **`src/lib/admin.ts`, `supabase/functions/auto-pipeline/shared.ts`** — manual and automatic
  imports skip jobs posted more than 7 days ago (was 30).
- **`scripts/copy-storage.mjs`**, **`supabase/move/rewrite-project-url.sql`** — moving helpers.
