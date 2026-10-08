# MadeVisa application worker

The part of Auto Apply that actually submits applications on employers'
career sites. It runs on its own small server, so applications keep going
after the person closes the page.

```
person presses "Save answers & apply to 16 jobs"
        │  (the page prepares each application: tailored CV, answers → status "ready")
        ▼
worker  ── apply_worker_claim ──►  ready → submitting   (credit held, daily limit checked)
        │  opens the employer's careers page in Chromium
        │  finds the form (or the "Apply" button, or the embedded Greenhouse/Lever/Ashby form)
        │  reads every field, fills what the application was prepared with
        │  attaches the tailored CV (and the letter where one was written)
        │  presses Submit once, reads the employer's confirmation
        ▼
        ── apply_worker_report ──►  submitted (with evidence) · needs_attention · blocked · expired · ready (retry)
```

It never gets round a CAPTCHA, never signs in as anyone, never answers
demographic questions, never ticks an optional consent, and never calls an
application submitted without the employer's confirmation page. Anything
like that becomes **Needs attention** for that one application — the rest of
the batch carries on.

## What it needs

- The database migration `20261205090000_auto_apply_batch.sql`.
- Two secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  (Supabase → Project settings → API → `service_role`). Keep the service key
  only on the worker's server.
- About 1 GB of memory (one Chromium). One worker handles 2 applications at a
  time by default (`select apply_configure(p_worker_concurrency => 3);` to change).

## Deploy (pick one)

**GitHub Actions — free, nothing to host** (recommended to start):
1. Run `supabase/migrations/20261206090000_apply_worker_schedule.sql` in the SQL Editor.
2. GitHub → your repository → Settings → Secrets and variables → Actions → add
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the reels workflow uses the same two).
3. Push. The workflow `.github/workflows/apply-worker.yml` runs every hour,
   and right away when someone confirms a batch — if Supabase has the function
   secrets `GITHUB_DISPATCH_TOKEN` and `GITHUB_REPO` (the reels already use them;
   otherwise: GitHub → Settings → Developer settings → Fine-grained token with
   *Contents: read and write* on this repository, then
   `supabase secrets set GITHUB_DISPATCH_TOKEN=… GITHUB_REPO=owner/madevisacom`).
4. Try it now: Actions → **Apply worker** → **Run workflow**.

Each run takes the ready applications, submits them, and stops. When there is
nothing to submit it uses about one minute. Public repositories get Actions
minutes free; private ones get 2,000 a month on the free plan — plenty at the
start (about 720 a month for the hourly checks, plus roughly a minute per application).
GitHub's terms expect Actions to be used for the repository's own project;
when MadeVisa grows, move to one of the options below (same code, nothing else changes).

**Railway** (simplest): New project → Deploy from GitHub repo → Settings →
Dockerfile path `worker/Dockerfile`, root directory `/` → Variables: add the
two secrets → Deploy. About $5–10 a month.

**Fly.io**: from the repository root
```
fly launch --dockerfile worker/Dockerfile --no-deploy --name madevisa-worker
fly secrets set SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key>
fly scale memory 1024
fly deploy
```

**Any server with Docker** (Hetzner, DigitalOcean, …):
```
docker build -f worker/Dockerfile -t madevisa-worker .
docker run -d --restart=always --name madevisa-worker \
  -e SUPABASE_URL=https://<project>.supabase.co -e SUPABASE_SERVICE_ROLE_KEY=<key> madevisa-worker
```

Within 30 seconds of starting it checks in. In the SQL editor:
`select * from apply_workers;` shows it, and the site starts telling people
"You can leave this page — MadeVisa will continue processing your
applications". If no worker has checked in for 3 minutes, the site stops
saying that, and ready applications simply wait until one is back.

## Trying it safely first

```sql
select apply_configure(p_auto_submit => false);   -- fill every form, press nothing
```
Each application then ends as *Needs attention — Test mode* with a
screenshot of the filled form in the `application-files` bucket. Look at a
few, then switch it on:
```sql
select apply_configure(p_auto_submit => true);
```

## Settings (environment)

| Variable | Default | |
|---|---|---|
| `WORKER_ID` | host name | Shown in `apply_workers` and on each attempt |
| `POLL_SECONDS` | 5 | How often to look for work when idle |
| `HOST_GAP_SECONDS` | 20 | Least time between two applications on the same site |
| `CHROMIUM_PATH` | — | Only outside the Playwright image |
| `ONCE` | — | `1` = process what is ready, then exit (for a scheduled runner) |

## What each platform does today

| Platform | Reads questions before asking the person | Fills and submits |
|---|---|---|
| Greenhouse | yes (public job board API) | yes |
| Lever | yes (application page) | yes |
| Ashby | yes (job board form) | yes |
| Company career pages, SmartRecruiters, Workable, others | when the form is opened | yes, when the form is a normal web form |
| Workday, iCIMS, SuccessFactors, Oracle, Taleo, Amazon | — | no: they need the candidate's own account → *Blocked: requires login* |

Any site may show a CAPTCHA; that application becomes *Needs attention* and
the person finishes it in one visit (everything else is prepared).

## Tests

```
cd worker && npm install && npm test
```
Runs the worker in a real Chromium against pretend employer sites
(`test/sites.ts`): a Greenhouse-style form, a Lever-style form with a
question card, a careers page behind an "Apply now" button, a CAPTCHA, a
sign-in, a form that refuses, a site that never confirms, test mode, closed
jobs, and the email channel. Set `CHROMIUM_PATH` if Chromium isn't at the
Playwright default.
