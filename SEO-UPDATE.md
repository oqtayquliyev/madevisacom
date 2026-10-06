# MadeVisa — SEO pass (6 Oct 2026)

What was audited, what was changed in the code, and what is left to do. Every change keeps the
product, design, pricing, sign-in and job search behaviour exactly as they were: the edits are
in `<head>` tags, server-rendered HTML, structured data, robots/sitemap rules and routing status codes.

---

## A. Executive summary

MadeVisa already had a better SEO foundation than most new sites: an edge function (`api/seo.ts`)
that serves real HTML (title, description, canonical, breadcrumbs, JobPosting, content) for jobs,
companies, countries, blog and info pages, plus segmented sitemaps. The problems were in the details,
and one of them was serious:

1. **`robots.txt` blocked every company page.** `Disallow: /company` (meant for the private
   company-manager page) is a prefix rule, so it also blocked `/companies` and all
   `/companies/<name>-<id>` pages — about 1,000+ URLs that are in the sitemap and linked from
   every job's breadcrumb. Google could not crawl any of them. **Fixed.**
2. **Every unknown URL answered 200** with the app shell (soft 404s). **Fixed** — real 404 + noindex.
3. **Three different homepage titles** (raw HTML, server render, React) and different titles for
   jobs/companies/countries between the HTML Google downloads and the page it renders. Weakens the
   brand/entity signal. **Fixed** with one shared source, `src/lib/seoMeta.ts`.
4. **Structured data**: Organization had no `sameAs` (so Google can't link the site to the
   LinkedIn/Instagram/Facebook profiles it already knows); a `WebApplication` block without ratings
   (reported as invalid by Search Console); closed jobs still got JobPosting markup and `index` from the
   app; remote jobs with no country produced invalid JobPosting. **All fixed.**
5. **Brand positioning drift**: the HTML said "Jobs from the Source + Hiring Insights"; the app says
   "Find a job abroad". Google's AI Overview for "madevisa com" is currently built from Instagram posts
   (one of them from a different company, *we_are_tern*) — not from madevisa.com. **Aligned** every
   surface on one statement: *jobs abroad with visa sponsorship, straight from employers*.

## B. Current SEO health (before → after this pass)

| Area | Before | After |
|---|---|---|
| Crawlability | Company section blocked; `/api/facets` blocked (jobs page renders without filter counts for Google) | Both open |
| Server-rendered HTML | Good for jobs/companies/countries/blog/info | + `/offers` (Visa Plan) and `/official-sources` |
| Status codes | Unknown paths 200 | 404 + noindex; closed jobs 410 (unchanged) |
| Titles/descriptions | Inconsistent server vs app | Identical, from one module |
| Canonicals | Company page canonical = whatever slug the visitor typed (app); blog categories `?c=` canonical in app but `/blog` in HTML | Canonical always the clean URL, same in both |
| Trailing slashes | `/jobs/` and `/jobs` both served | `trailingSlash: false` → 308 to the slashless URL |
| Structured data | Organization w/o sameAs; invalid WebApplication; JobPosting on closed jobs | Organization+WebSite `@graph` with `@id`, sameAs; JobPosting only on open, valid jobs |
| Sitemap | Static pages stamped `lastmod=today` on every request; Visa Plan page missing | lastmod only where content really changes daily; `/offers`, `/official-sources` added |
| Favicon | Only an external Cloudinary PNG; `/favicon.ico` returned the HTML app | `/favicon.ico` and `/apple-touch-icon.png` served from madevisa.com |
| Thin pages | "Coming soon" Programs/Study indexable; one feedback form per company indexable | noindex until they have content |

Overall: technical foundation **good → strong**. The remaining limiter is **authority and trust**
(new domain, few links, ~70k aggregated job pages), which no code change fixes — see T and U–W.

## C. Why MadeVisa doesn't show up for "madevisa com" in Incognito

Incognito removes your search history, so what you see there is closer to what a new visitor sees.
In the screenshot, Google answers "madevisa com" with an AI Overview built from **Instagram posts** and
lists Facebook/LinkedIn pages for *Visa Made Easy*, *Make Visas*, etc. — madevisa.com itself is not in
the top results, even for its own name. That pattern points to these causes, in order of likelihood:

1. **Weak / incomplete indexing of the site itself.** A brand-new domain that submitted up to ~75,000
   URLs at once (15 job sitemaps × 5,000) usually ends up mostly "Discovered – currently not indexed".
   Google crawls cautiously until the site earns trust. Check Search Console → Pages (section M).
2. **The robots.txt bug** blocked the entire company section — a large share of the site's unique,
   non-duplicated pages (company scores, reply rates). Fixed now.
3. **Brand ambiguity.** "madevisa com" is read as *made visa* / *make visa*; there are established
   pages called "Visa Made Easy" and "Make Visas". Until Google has a strong entity for "MadeVisa",
   it treats the query as generic. The Organization `sameAs`, `alternateName: "Made Visa"`, consistent
   titles and the definitional sentence on the homepage give it the signals it needs; links and
   branded searches (T, 41) do the rest.
4. **Duplicate job content.** Most job pages repeat text that also exists on the employer's careers page
   and on other aggregators. Google indexes only a fraction of such pages from new domains. MadeVisa's
   unique value per job (visa sponsorship status, company reply rate, CV match, visa route) is what can
   make them index-worthy — it needs to be visible on the page (see P).
5. **Data-quality pages in the sitemap** — e.g. `/jobs/opko-health-ireland/opko-health-to-report-third-quarter-2023-financial-results…`
   (a press release imported as a job). Pages like this lower Google's opinion of the whole sitemap.
6. **Not causes** (checked): no `noindex` on public pages, HTTPS/HSTS correct, canonicals self-consistent
   on server pages, JavaScript rendering not required for core content (server HTML is complete).

Normal personalisation (location Azerbaijan, Azerbaijani UI language, history) explains small
differences between windows — but not the site being absent for its own name. That is an indexing
and entity problem, and it is fixable.

## D. Critical problems discovered

| # | Problem | Where | Status |
|---|---|---|---|
| P0-1 | `Disallow: /company` blocks `/companies*` | `public/robots.txt` | Fixed |
| P0-2 | Soft 404 on every unknown URL | `vercel.json` catch-all | Fixed (`api/seo.ts` `r=spa`) |
| P0-3 | Closed jobs: app re-sets `index, follow` and re-adds JobPosting after the server sent 410/noindex | `JobDetailPage.tsx` | Fixed |
| P0-4 | Invalid JobPosting for remote jobs with no country (missing `applicantLocationRequirements`) | `api/seo.ts`, `JobDetailPage.tsx` | Fixed |
| P1-1 | Title/description mismatch server vs app; 3 homepage titles | many pages | Fixed |
| P1-2 | `WebApplication` schema with `offers` but no rating → Search Console "invalid item" | `index.html` | Removed |
| P1-3 | Organization lacks `sameAs`, `@id` | `index.html` | Fixed |
| P1-4 | Job titles built from street addresses ("…at Sportradar, Rothschildplatz 4") | title template | Fixed (`titleLocation`) |
| P1-5 | Non-job content imported as jobs | import pipeline / DB | **Not fixed** (data) |
| P1-6 | SEO RPCs (`seo_job`, `seo_company`, `seo_latest_jobs`, `seo_sitemap_*`) are **not in `supabase/migrations`** — they exist only in the live database | `supabase/` | **Recommend** committing them |

## E. Changes implemented (files)

| File | Change |
|---|---|
| `public/robots.txt` | `Disallow: /company$` + `/company/` instead of `/company`; `Allow: /api/facets`; comments |
| `vercel.json` | `trailingSlash: false`; `/favicon.ico` and `/apple-touch-icon.png` served from the logo; `/offers` and `/official-sources` server-rendered; catch-all now goes through `api/seo.ts` so unknown paths return 404 |
| `src/lib/seoMeta.ts` (new) | One source for titles/descriptions + templates for job, company, country titles; `COMING_SOON_NOINDEX`; `titleLocation()` |
| `api/seo.ts` | Uses `seoMeta`; homepage H1 matches the app + one-sentence definition of MadeVisa (incl. what it does *not* do); Visa Plan and Official sources pages; destination pages link to their country's jobs and visa-sponsored jobs; company Organization gets `@id` + country; no canonical on 404/410; `og:locale`; known-route list + real 404; JobPosting validity rule |
| `api/sitemap.ts` | Honest `lastmod`; `/offers`, `/official-sources` added |
| `api/_pages.ts` | Link-preview titles come from `seoMeta` |
| `index.html` | Title/description aligned; Organization + WebSite as one `@graph` with `@id`, `alternateName`, `sameAs` (the three profiles already linked in the footer), `publisher`; removed invalid `WebApplication`; apple-touch-icon; `og:locale`; richer robots directive |
| `src/lib/seo.ts` | Robots directives identical to the server; `noindex, follow` (not `nofollow`) |
| `JobDetailPage.tsx` | Shared title template (adds "(Visa Sponsorship)" only when the job says so); noindex + no JobPosting for closed jobs; JobPosting dropped when Google's location rule can't be met; cleaner description |
| `CompanyProfilePage.tsx` | Canonical = the company's own URL; shared title/description; noindex when not found; per-company share image |
| `CountryPage.tsx`, `DestinationsPage.tsx`, `CompaniesPage.tsx`, `JobsPage.tsx`, `LandingPage.tsx`, `OffersPage.tsx`, `CvMatchPage.tsx`, `NetworkPage.tsx`, `OfficialPartnersPage.tsx`, `PricingPage.tsx`, `JobMarketPage.tsx` | Shared titles/descriptions (and share images where the server already had one) |
| `FeedbackPage.tsx` | `/feedback/<company>` forms → noindex (near-copies of the company page) |
| `BlogPage.tsx` | `?c=` category views canonical to `/blog` (matches server HTML) |
| `ProgramsPage.tsx` | Programs / Study noindex while "soon" |
| `src/data/infoContent.ts` | About title shortened to 58 chars |
| `public/llms.txt` | Definition updated (Visa Plan, sponsorship, disclaimers); key pages added |

**Verified here:** app typecheck (`tsc`) clean; API files typecheck clean; ESLint clean on changed
files; the whole app bundles; `api/seo.ts` and `api/sitemap.ts` executed against mocked data for every
page type (home, jobs, job, wrong-slug 301, closed 410, remote job, company, country, Visa Plan,
official sources, programs, companies, pricing, about, blog, known SPA routes, unknown routes) —
one `<title>`, one robots tag, correct canonical, valid JSON-LD on each.
**Not run here:** `vite build` (the uploaded `node_modules` are macOS binaries) — run `npm run build`
locally or let Vercel build the preview.

### After deploying, check these in a browser (2 minutes)
1. `https://madevisa.com/robots.txt` shows `Disallow: /company$`.
2. `https://madevisa.com/some-nonsense` → page shows "not found", DevTools Network shows **404**.
3. `https://madevisa.com/jobs/` → redirects to `/jobs`.
4. `https://madevisa.com/favicon.ico` → shows the logo.
5. `https://madevisa.com/profile`, `/u/<someone>`, `/brief/<id>` → still load normally (200).
6. Paste a job URL into Google's Rich Results Test → JobPosting valid.

## F. Recommended but not implemented

| Priority | Recommendation | Why not done here |
|---|---|---|
| P0 | In Search Console: submit `sitemap.xml`, inspect `/companies/ryanair-02f690bd` and request indexing; validate the "Blocked by robots.txt" fix | Needs your account |
| P0 | Set `www.madevisa.com` → `madevisa.com` 301 in Vercel Domains (confirm it isn't served as a duplicate) | Domain setting |
| P1 | Commit the `seo_*` SQL functions to `supabase/migrations` | Not in the upload; rebuilding them blind could break production |
| P1 | Stop importing non-job posts (press releases, "report results" pages); remove existing ones (→ 410) | Data pipeline |
| P1 | **Index fewer, better job pages**: put jobs with `visa = true`, salary, or a company with reply data in `jobs-1…`; consider noindex for jobs with < ~600 characters of description and no MadeVisa-specific data | Product decision |
| P1 | Return visa status, company reply rate and the country's main visa route in `seo_job`, and print them in the server HTML of each job ("Does Sportradar sponsor visas? …", "Replies to 34% of applicants") | Needs SQL change |
| P1 | Add `seo_company` fields: description, HQ, countries hired in, visa-job count, reply rate; print them on company pages | Needs SQL change |
| P2 | Country + "visa sponsorship jobs" landing pages (`/destinations/germany` already exists — add a server-rendered list of that country's latest visa-sponsored jobs to it, rather than new URLs) | Needs an RPC |
| P2 | A real `/favicon.ico` (48×48 multiple) and `site.webmanifest` in `public/` | Needs the source logo file |
| P2 | About page: name the founder/team, a photo, LinkedIn, company registration — the strongest trust signal for a site about visas and jobs | Content from you |
| P3 | Public profiles `/u/*`: noindex when the profile has no headline/bio | Product decision |

## G. Page-by-page SEO table

All titles below get " | MadeVisa" appended unless they already contain the brand. Canonical = the URL itself unless noted.

| URL | Type | Old title | New title | New meta description | H1 | Primary keyword / intent | Index | Schema | Notes / priority |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Home | MadeVisa \| Jobs from the Source + Hiring Insights *(HTML)* / MadeVisa \| Find a job abroad. See how well you match it. *(app)* | MadeVisa — Find Jobs Abroad with Visa Sponsorship | Live jobs straight from company career pages, filterable by visa sponsorship, country and remote work. Upload your CV once and see your match on every job — free. | Find a job abroad. See how well you match it. | madevisa; jobs abroad with visa sponsorship (brand + nav) | Index | Organization, WebSite | P0 entity |
| `/jobs` | Jobs hub | Jobs Beyond LinkedIn: Company Career Pages & Jobs Abroad | Jobs Abroad & Visa Sponsorship Jobs, Live from Employers | Search live jobs taken straight from company career pages. Filter by country, visa sponsorship, remote or hybrid, salary and experience — updated every day. | Jobs abroad, live from company career pages | jobs abroad; visa sponsorship jobs | Index (filters → canonical /jobs) | BreadcrumbList | P1 |
| `/jobs/<co>/<title>-<id>` | Job | {title} at {co}, {city}, {country} | {title} at {co}, {city}, {country} (Visa Sponsorship)\* | {title} at {co} in {place}. {type}. Visa sponsorship offered.\* {description…} | {title} | "{title} {city}"; "{title} visa sponsorship" | Index; closed → 410 noindex | JobPosting, BreadcrumbList | \*only when the job states it |
| `/companies` | Company directory | Company Scores — hiring activity & applicant response | Company Scores: Who's Hiring, Who Replies & Who Sponsors Visas | Check a company before you apply: open jobs, hiring activity, how often it replies to applicants and whether it sponsors visas — from real data on MadeVisa. | Who's hiring — and who actually replies | companies that sponsor visas; does X reply | Index | BreadcrumbList | P0 (was blocked) |
| `/companies/<name>-<id>` | Company | {co} — jobs, hiring activity & applicant response | {co} Jobs, Hiring Activity & Applicant Reply Rate | {n} open jobs at {co}, straight from its careers page — plus hiring activity and how often it replies to applicants, from real applicant data. (UK sponsors: "Does {co} sponsor visas? It holds a UK sponsor licence…") | {co} | "{co} jobs", "{co} visa sponsorship", "does {co} reply" | Index | Organization, BreadcrumbList | P0 (was blocked) |
| `/destinations` | Country hub | Visas by Country — visa routes, sponsorship rates and companies hiring by country | Work Visas by Country: Routes, Sponsored Jobs & Companies Hiring | Compare work, talent and job-search visa routes in 20+ countries, with years to permanent residence, live visa-sponsored jobs and the companies hiring there. | Where can you go? | work visa by country | Index | BreadcrumbList | P1 |
| `/destinations/<country>` (21) | Country | {Country} — visas, sponsored jobs & companies hiring | Work in {Country}: Visa Routes, Sponsored Jobs & Companies Hiring | Visa routes for working in {Country}, years to permanent residence and citizenship, plus live visa-sponsored jobs and the companies hiring there. | Visas and jobs in {Country} | "{country} work visa", "visa sponsorship jobs {country}" | Index | BreadcrumbList | P1; now links to country job lists |
| `/offers` | Visa Plan | Visa Plan for your job application — MadeVisa | Visa Plan — a Sponsorship Proposal for Your Job Application | Job ad doesn't mention a visa? Attach a Visa Plan: a one-page sponsorship proposal with the visa route, the employer's steps and who pays what. | Job doesn't mention a visa? Send them a Visa Plan. | visa sponsorship proposal; how to ask employer to sponsor visa | Index (new in sitemap) | BreadcrumbList | P1 — unique product |
| `/cv-match` | Tool | CV match — upload your CV and see the jobs you match most | CV Match — See How Well Your CV Fits a Job Before You Apply | (dynamic, unchanged in app; server: "Upload your CV once…") | How well does your CV match the job? | CV job match | Index | BreadcrumbList | P2 |
| `/job-market` | Data | Job market insights — … | Job Market Insights — Who's Hiring, Where and How, Updated Hourly | live numbers (unchanged) | The job market, live | who is hiring; jobs by country | Index | BreadcrumbList | P2; candidate for Dataset later |
| `/pricing` | Pricing | Pricing — one plan: full CV match reports and sponsorship documents | MadeVisa Pricing — Free Job Search, Pro CV Reports & Visa Plans | live prices (unchanged) | Pricing | madevisa price | Index | Product, Offer | P2 |
| `/about` | About | What is MadeVisa? Jobs abroad, and a sponsorship proposal to start the visa conversation | What Is MadeVisa? Jobs Abroad & Visa Sponsorship Proposals | unchanged | Find a job abroad. Get the visa sponsored. | what is madevisa | Index | FAQPage, BreadcrumbList | P1 trust (add team) |
| `/how-it-works` | Info | How MadeVisa works — from a company careers page to your next move | unchanged | unchanged | unchanged | how madevisa works | Index | FAQPage | P2 |
| `/blog` | Blog hub | MadeVisa Blog — hiring reports, visa guides… | MadeVisa Blog — Hiring Reports, Visa Guides & Job-Search Advice | unchanged | The MadeVisa Blog | — | Index; `?c=` → canonical /blog | Blog | P2 |
| `/blog/<slug>` | Article | {title} | unchanged | excerpt | {title} | per article | Index | Article, BreadcrumbList | P2 — add named authors |
| `/network` | Recruiters | Recruiters — hiring managers… | Recruiters Hiring Across Borders & Employers That Sponsor Visas | Hiring managers, recruiters and visa experts who hire internationally… | Recruiters on MadeVisa | international recruiters | Index | BreadcrumbList | P3 |
| `/feedback` | Feedback | Hiring Feedback — how companies really respond… | Hiring Feedback — How Companies Really Respond to Applicants | unchanged | How did your application go? | — | Index | BreadcrumbList | P3 |
| `/feedback/<co>` | Form | {co} — share how your application went | unchanged | unchanged | — | — | **Noindex** | — | thin |
| `/official-sources` | Directory | Official Government & Global Opportunity Institutions | Official Immigration & Government Sources by Country | Official immigration, investment, education and research institutions… Not partnerships. | Official sources | — | Index (now server-rendered) | BreadcrumbList | P3 |
| `/programs`, `/study` | Coming soon | Programs: … / Study Opportunities: … | unchanged | unchanged | — | — | **Noindex until launched** | — | flip `COMING_SOON_NOINDEX` |
| `/submit-job`, `/employers/inbox` | Employer | unchanged | unchanged | unchanged | — | post a job abroad | Index | — | P3 |
| `/contact`, `/privacy`, `/terms`, `/cookies`, `/disclaimer`, `/advertising-policy`, `/sponsored-listing-terms`, `/sponsorship-document-terms`, `/editorial-policy`, `/corrections`, `/verification-policy` | Legal/trust | {Title} | unchanged | unchanged | {Title} | — | Index | BreadcrumbList (+FAQ where present) | Trust pages; linked from footer |
| `/u/<username>` | Public profile | {name} on MadeVisa | unchanged | unchanged | — | — | Index if exists | — | consider noindex when empty |
| `/brief/*`, `/login`, `/register`, `/reset-password`, `/verify-email`, `/profile`, `/dashboard`, `/company`, `/admin*`, `/alerts/unsubscribe` | Private | — | — | — | — | — | Noindex (+ robots Disallow for account/admin) | — | — |
| anything else | Unknown | 200 app shell | Page not found | — | This page isn't on MadeVisa | — | **404 noindex** | — | Fixed |

## H. Technical SEO checklist

- [x] **Crawlability** — robots allows all public sections; company pages unblocked; `/api/facets` allowed for rendering.
- [x] **Indexability** — noindex only on private, error, closed, "soon" and per-company feedback pages.
- [x] **Rendering** — titles, descriptions, canonicals, JSON-LD and main content are in the raw HTML for every indexable page type (no JS needed).
- [x] **Canonicalization** — self-referencing, clean URLs; wrong slugs 301; filters/categories canonical to the hub; trailing slash 308.
- [x] **Robots** — prefix bug fixed; sitemap referenced.
- [x] **Sitemap** — index + segmented files; honest lastmod; only indexable URLs. ☐ remove non-job imports.
- [x] **Status codes** — 200 / 301 (slug) / 404 (unknown) / 410 (closed job).
- [ ] **Redirects** — confirm `www` → apex and `http` → `https` are single hops in Vercel.
- [x] **URLs** — lowercase, hyphenated, stable short id; no change needed.
- [x] **Metadata** — unique titles/descriptions from one module.
- [x] **Headings** — one H1 per page in both server HTML and app.
- [ ] **Content** — add MadeVisa-specific facts to job and company HTML (F, P1).
- [x] **Internal linking** — breadcrumbs everywhere; job → company → country; country → its jobs (new).
- [x] **Structured data** — Organization/WebSite graph; JobPosting (valid only); BreadcrumbList; Article; Product/Offer; FAQPage on about/how-it-works/legal.
- [x] **Images** — share images 1200×630 for every page type. ☐ check `alt` on company logos in the app.
- [ ] **Performance** — see S.
- [x] **Mobile** — responsive viewport; server HTML is the same content as mobile app.
- [x] **Accessibility** — breadcrumb `nav` with `aria-label`, footer nav labelled; social links have `aria-label`.
- [x] **International** — English only, `lang="en"`, `og:locale`; no hreflang needed (see O).
- [x] **JobPosting** — datePosted, validThrough, hiringOrganization, location or applicant countries, salary only when disclosed, closed jobs excluded.
- [x] **Organization** — logo, sameAs, address, email, @id.
- [x] **Breadcrumbs** — HTML + BreadcrumbList on all hierarchical pages.
- [x] **Open Graph** — dynamic images for job/company/profile/page; X/Twitter cards.
- [x] **Security** — HTTPS, HSTS preload, nosniff, frame options, `security.txt`.
- [ ] **Analytics** — see 39 below (organic segments in GA4).
- [ ] **Search Console** — see M.
- [ ] **Off-page** — see T.

## I. Content strategy

Don't add a blog-style content farm. MadeVisa's advantage is **data nobody else shows**: which jobs
state visa sponsorship, which companies reply, UK sponsor-register matches, live counts by country.
Content should package that data.

Priority content (in order):
1. **Country pages as the visa-sponsorship hubs** — each `/destinations/<country>` gets: number of
   live visa-sponsored jobs, top 10 sponsoring companies (with evidence), latest 20 visa-sponsored
   jobs (server-rendered), median salary where disclosed, last-updated date.
2. **"How to ask an employer to sponsor your visa"** — one strong guide that explains the problem the
   Visa Plan solves, with a real (anonymised) example. Links to `/offers`.
3. **"What visa sponsorship means (and what it doesn't)"** — definitions, who pays what, typical
   timelines by country (from your `visaGuides` data, with official sources).
4. **Monthly "Who sponsors visas" report** per big market (UK, Germany, Netherlands, Ireland,
   Canada) built from your own job data — the linkable asset for T.
5. **"How to tell if a 'visa sponsorship' job is real"** — scam patterns, checking the UK register, etc.

Skip: generic CV tips, "top 10 countries to move to" lists, anything not tied to your data.

## J. Keyword architecture (cluster → page)

| Cluster | Example queries | Page | Notes |
|---|---|---|---|
| Brand | madevisa, made visa, madevisa jobs, madevisa visa plan | `/`, `/about`, `/offers` | Entity signals now consistent |
| Jobs abroad (head) | jobs abroad, work abroad, international jobs, jobs for foreigners | `/jobs` | Very competitive; rank via long tail first |
| Visa sponsorship jobs | visa sponsorship jobs, jobs with visa sponsorship | `/jobs` (filter) → later a server-rendered `/jobs?visa=1` hub | Single page; avoid a second competing URL |
| Country × sponsorship | visa sponsorship jobs germany, work visa netherlands, uk skilled worker jobs | `/destinations/<country>` | Best opportunity: specific, you have data |
| Company × sponsorship | does {company} sponsor visas, {company} visa sponsorship, {company} careers | `/companies/<co>` | Now crawlable; add evidence fields |
| Company × response | does {company} reply to applicants, {company} hiring process | `/companies/<co>` | Unique data |
| Job long tail | {job title} {city}, {job title} visa sponsorship | job pages | Index-worthy only with MadeVisa facts |
| Sponsorship how-to | how to get visa sponsorship, how to ask employer to sponsor visa, sponsorship letter | `/offers` + guide article | Unique product |
| CV fit | cv job match, check cv against job description | `/cv-match` | |
| Market data | who is hiring, companies hiring foreigners {country} | `/job-market`, monthly reports | Linkable |

Cannibalisation checked: `/companies` vs `/network` (both said "employers that sponsor visas") — kept
`/companies` for sponsorship/company intent and `/network` for recruiter intent. `/destinations/<c>` vs
blog visa guides — the country page is the canonical hub; guides should link to it.

## K. Internal linking architecture

```
Home ─┬─ Jobs ── Job ── Company (breadcrumb) ── Company's other jobs
      ├─ Companies ── Company ── Jobs at company
      ├─ Visas by country ── Country ── country jobs / visa-sponsored jobs (new) ── jobs
      ├─ Visa Plan (new in server footer) ── Pricing / Terms
      └─ Blog ── Article ── country / company pages
Every server page: footer → Jobs, CV match, Visa Plan, Companies, Job market, Countries, Blog, Pricing, About, How it works, Editorial policy, Contact
```
Next: from each job, link "Visa routes for {country}" (exists) **and** "Companies sponsoring in
{country}"; from each country page, its top sponsoring companies.

## L. Structured data strategy

| Page type | Schema | Rule |
|---|---|---|
| All | Organization + WebSite (`@graph`, `@id`) | sameAs only real profiles |
| Job (open) | JobPosting | Only visible data; no salary unless disclosed; location or applicantLocationRequirements; none on closed jobs |
| Company | Organization (+ BreadcrumbList) | No ratings — reply rates are not reviews; never `AggregateRating` |
| Country | BreadcrumbList | Consider `FAQPage` only if the FAQ is visible (Google shows FAQ rich results only for gov/health sites now, so value is understanding, not stars) |
| Article | Article with named author | Move from "MadeVisa Editorial" to real people |
| Pricing | Product + Offer | Real prices |
| Not used on purpose | SearchAction (Google retired the sitelinks search box), Review/AggregateRating, WebApplication |

## M. Google Search Console checklist

1. **Property**: Domain property `madevisa.com` (DNS verification) — covers www/http.
2. **Sitemaps**: submit `https://madevisa.com/sitemap.xml`. Expect ~20 child sitemaps "Success".
3. **Pages report** (Indexing → Pages): note counts for *Indexed*, *Blocked by robots.txt* (should drop
   to ~0 company URLs after re-crawl — click **Validate fix**), *Discovered – currently not indexed*,
   *Crawled – currently not indexed*, *Duplicate, Google chose different canonical*, *Soft 404*
   (should fall), *Not found (404)* (will rise briefly — expected).
4. **URL Inspection**: `/`, `/companies/ryanair-02f690bd`, a job, `/destinations/germany`, `/offers` →
   *Test live URL* → View tested page → check the rendered HTML has the title and content → *Request indexing*.
5. **Enhancements**: *Job postings* — fix any errors; *Breadcrumbs* — valid; *Organization* in
   Rich Results Test for `/`.
6. **Core Web Vitals** (mobile first): LCP/INP/CLS buckets per URL group.
7. **Manual actions** and **Security issues**: should be empty.
8. **Performance**: filter Query contains "madevisa" to track branded impressions week by week.
9. Repeat 3–4 weekly for the first 6 weeks.

Also: **Bing Webmaster Tools** (import from GSC) — Bing feeds ChatGPT search and Copilot; submit
the sitemap there too, and consider IndexNow for new jobs.

## N. Indexing strategy (page-type matrix)

| Page type | Index | Follow | Canonical | Sitemap | Schema | Intent |
|---|---|---|---|---|---|---|
| Home | ✓ | ✓ | self | ✓ | Org, WebSite | brand |
| Jobs hub | ✓ | ✓ | /jobs | ✓ | Breadcrumb | browse |
| Jobs filtered `?…` | (canonical→/jobs) | ✓ | /jobs | ✗ | — | — |
| Job (open) | ✓ | ✓ | self | ✓ | JobPosting | apply |
| Job (closed) | ✗ (410) | ✓ | none | ✗ | — | — |
| Companies hub | ✓ | ✓ | self | ✓ | Breadcrumb | research |
| Company | ✓ | ✓ | self (301 from other slugs) | ✓ (with open jobs) | Organization | research |
| Country hub / country | ✓ | ✓ | self | ✓ | Breadcrumb | research |
| Visa Plan / CV match / Pricing | ✓ | ✓ | self | ✓ | — / Product | product |
| Blog / article | ✓ | ✓ | self (`?c=`→/blog) | ✓ | Blog / Article | learn |
| Legal / trust | ✓ | ✓ | self | ✓ | Breadcrumb | trust |
| Programs / Study (soon) | ✗ | ✓ | self | ✗ | — | — |
| Feedback form per company | ✗ | ✓ | self | ✗ | — | — |
| Public profile | ✓ (if exists) | ✓ | self | ✗ | — | — |
| Brief/Visa Plan document | ✗ | ✓ | — | ✗ | — | private |
| Login/Register/Profile/Dashboard/Admin/Company manager | ✗ + Disallow | — | — | ✗ | — | private |
| Unknown | ✗ (404) | ✓ | none | ✗ | — | — |

## O. International SEO strategy

Keep **one English site, no hreflang**. The audience is international but searches in English for
English-language jobs; translated job ads don't exist, and machine-translated duplicates would be thin.
Already right: `lang="en"`, prices in USD with regional pricing shown per visitor (not as separate URLs —
correct, avoids cloaking-like variants). Use the official local term on each country page
("Skilled Worker visa", "EU Blue Card", "Red-White-Red Card", "Express Entry") — your `visaGuides`
already do. Revisit localisation only if Search Console shows meaningful non-English queries
(e.g. German or Russian) with impressions.

## P. JobPosting strategy

- Implemented: server + app markup identical in rules; expired → 410 + out of sitemap (best practice
  for Google Jobs: remove expired postings quickly); `validThrough` from deadline/expiry; `directApply: false`.
- Next: (1) print visa status + company reply rate + main visa route in the job's server HTML;
  (2) prioritise visa-sponsored and salary-disclosed jobs in sitemap file 1; (3) stop non-job imports;
  (4) when a job closes, keep the 410 page but link to 3 similar open jobs (already links the company's
  other jobs); (5) Google's Indexing API is permitted for pages with JobPosting markup — use it to
  notify Google when a job is published or closed, instead of waiting for a re-crawl.

## Q. Company / entity strategy

MadeVisa entity: done in code (Organization graph, sameAs, alternateName, consistent definition).
Off-site: make the LinkedIn, Instagram and Facebook "About" sections use the same one-line
definition and link to madevisa.com; get listed on Crunchbase / Product Hunt / Wellfound with the same
name, logo and sentence. Company pages: never claim sponsorship without evidence (the UK register
match is good evidence; add others — e.g. jobs with `visa = true` in the last 90 days — with the
evidence stated on the page).

## R. AI search / AI Overview strategy

- Server HTML now contains a plain definitional sentence on the homepage and `llms.txt` — AI crawlers
  (GPTBot, ClaudeBot, PerplexityBot) don't run JavaScript, and this is what they read.
- Pages most likely to be cited: country pages (visa routes with official sources and fees in a
  table), company pages (sponsor/reply data), `/offers` (definition of a sponsorship proposal),
  monthly data reports. Give each a "Last updated" date and a short answer paragraph at the top.
- The current AI Overview for your name quotes another company's Instagram post. That gets corrected
  as madevisa.com itself becomes indexed and the profiles carry the same definition.

## S. Performance recommendations

From the code (no lab test possible here):
1. Google Analytics `gtag.js` loads in `<head>` on every page — move the `<script async>` to after the
   app script or load it on `requestIdleCallback`; it competes with the app bundle for LCP.
2. The app bundle is large (~5.5 MB unminified in a test bundle; check `dist/assets/index-*.js` size).
   Admin pages are already lazy — confirm `pdfjs-dist` and `pdf.worker` are only loaded on CV/brief pages.
3. Fonts: Inter + Fraunces variable fonts via Google Fonts; preload only the one used above the fold,
   or self-host with `font-display: swap`.
4. Server HTML is cached at the edge (`s-maxage` up to 900 s) — good TTFB; keep it.
5. Company logos from many hosts: add `width`/`height` and `loading="lazy"` below the fold to avoid CLS.
6. Measure: PageSpeed Insights on `/`, `/jobs`, one job, one company — mobile.

## T. Off-page authority strategy

1. **Data PR**: monthly "Companies sponsoring visas in the UK/Germany/Netherlands" from your own data →
   pitch to relocation newsletters, r/IWantOut-type communities (as useful posts, not spam),
   international-student offices, expat media.
2. **Universities**: international student career services link to "how to find sponsorship" tools.
3. **Founder story**: interviews on startup/relocation podcasts and Azerbaijani/regional tech media
   (a real person behind the site helps E-E-A-T and links).
4. **Product directories**: Product Hunt launch for the Visa Plan, Wellfound, Crunchbase, BetaList.
5. **Employer side**: companies that reply to Visa Plans — "Featured on MadeVisa" badge linking to
   their company page.
6. Never buy links or join link networks.

## U. 30-day roadmap
- Deploy this branch; run the 6 browser checks (E).
- Search Console + Bing: submit sitemaps, validate robots fix, request indexing for 10 key URLs.
- Remove non-job imports; commit the `seo_*` SQL to migrations.
- Update social bios to the same one-line definition; add About-page team section.
- Track: indexed pages, branded impressions.

## V. 60-day roadmap
- Add visa status / reply rate / visa route to job server HTML; evidence fields to company pages.
- Country pages: server-rendered latest visa-sponsored jobs + top sponsoring companies.
- Publish the sponsorship guide and the first monthly data report; start outreach.
- Re-order job sitemaps by value; consider noindex for thin jobs.

## W. 90-day roadmap
- Second and third monthly reports; Product Hunt launch for Visa Plan.
- Review GSC: which countries/companies get impressions → deepen those country pages.
- Launch Programs/Study only with real listings, then flip `COMING_SOON_NOINDEX`.
- Performance pass (gtag deferral, font, bundle) with PageSpeed before/after.

## X. Highest-priority actions (in order)
1. Deploy (robots fix unblocks the whole company section).
2. Search Console: submit sitemap, validate fix, request indexing for home + key pages.
3. Confirm `www`/`http` single-hop redirects.
4. Clean non-job imports out of the job sitemap.
5. Put MadeVisa's own data (visa status, reply rate, sponsor evidence) into job and company HTML.
6. Give the brand a face: team on About, consistent social bios, first data report + outreach.

---
*Section 39 (Analytics):* GA4 is already installed with consent mode. In GA4 create an exploration:
Session default channel group = Organic Search, by Landing page — and mark "apply click", "CV
upload", "Visa Plan created" and "sign up" as key events, so SEO is measured in users who act, not
impressions. No new tracking needed.

*Section 42 (Competitors, from general knowledge — not crawled live):* job aggregators (LinkedIn,
Indeed, Glassdoor) dominate head terms; niche visa-sponsorship boards and relocation sites
(e.g. Relocate.me-style boards, UK sponsor-list lookup sites) win "visa sponsorship jobs {country}"
and "does {company} sponsor". Their weak spot is that sponsorship labels are rarely evidenced and they
show nothing about employer response. MadeVisa's edge — evidence + reply data + a proposal tool —
is where to compete, not on raw job count.
