// GET /api/seo?r=<route>&…  (reached through vercel.json rewrites)
//
// MadeVisa is a single-page app: every URL used to return the same empty
// index.html with the homepage's title and canonical, and search engines
// had to run the app to see anything. This serves the SAME app to everyone,
// with the page's own <head> (title, description, canonical, share image,
// structured data) and a plain-HTML version of its content inside #root.
// The app then starts and replaces that content with the full page — people
// and search engines get the same thing, so nothing is cloaked.
//
// Cached at the edge (s-maxage), so each URL reaches Supabase at most once
// every few minutes, whatever the traffic. Any error → the plain app.

import { PAGES, type PageKey } from './_pages';
import { escHtml as esc } from './_supa';
import { slugify } from '../src/lib/jobUrl';
import { legalPages } from '../src/data/legalContent';
import { infoPages } from '../src/data/infoContent';
import { visaGuides } from '../src/data/visa';

export const config = { runtime: 'edge' };

const SITE = 'https://madevisa.com';
const LOGO = 'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789558197/madevisa-fav_j8ot2d.png';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);
function supa() {
  const base = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_ANON_KEY');
  return base && key ? { base, key } : null;
}
async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  const s = supa();
  if (!s) return null;
  try {
    const res = await fetch(`${s.base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
async function rest<T>(path: string): Promise<T | null> {
  const s = supa();
  if (!s) return null;
  try {
    const res = await fetch(`${s.base}/rest/v1/${path}`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type SeoJob = {
  id: string;
  title: string;
  html: string;
  description: string | null;
  company: string;
  company_id: string;
  logo: string | null;
  company_website: string | null;
  city: string | null;
  country: string | null;
  iso: string | null;
  remote: boolean | null;
  work_arrangement: string | null;
  employment_type: string | null;
  experience: string | null;
  job_function: string | null;
  compensation: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  visa: boolean | null;
  posted: string | null;
  expires_at: string | null;
  deadline: string | null;
  official_url: string | null;
  closed: boolean;
  related: { id: string; title: string; city: string | null }[];
};
type LatestJob = { id: string; title: string; company: string; city: string | null; iso: string | null; country: string | null; posted: string | null };

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const jobPath = (j: { id: string; title: string; company: string }) => `/jobs/${slugify(j.company) || 'company'}/${slugify(j.title) || 'job'}-${j.id.slice(0, 8).toLowerCase()}`;
const companyPath = (c: { id: string; name: string }) => `/companies/${slugify(c.name) || 'company'}-${c.id.slice(0, 8)}`;
const plain = (html: string | null | undefined) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
/** Stored HTML is sanitised when saved; this is a second, cheap safety net. */
const safeHtml = (html: string) =>
  html
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const link = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const crumbsHtml = (items: [string, string][]) =>
  `<nav aria-label="Breadcrumb"><ol class="crumbs">${items.map(([name, href], i) => `<li>${i === items.length - 1 ? esc(name) : link(href, name)}</li>`).join('')}</ol></nav>`;
const crumbsLd = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${href}` })),
});

type Page = {
  status?: number;
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
  ogType?: 'website' | 'article';
  jsonld?: Record<string, unknown>[];
  /** JobPosting gets the id the app uses, so the app replaces it instead of adding a second one. */
  jobPosting?: Record<string, unknown>;
  body: string;
  maxAge?: number;
};

const SSR_CSS = `#ssr{font-family:Inter,ui-sans-serif,system-ui,sans-serif;max-width:880px;margin:0 auto;padding:28px 20px 60px;color:#0f172a;line-height:1.65}#ssr a{color:#1d4ed8}#ssr h1{font-size:30px;line-height:1.25;margin:12px 0}#ssr h2{font-size:21px;margin:28px 0 8px}#ssr .crumbs{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:0;font-size:14px;color:#64748b}#ssr .crumbs li+li:before{content:"›";margin-right:6px}#ssr .meta{color:#475569;font-size:15px}#ssr ul.links{padding-left:18px}#ssr table{border-collapse:collapse;width:100%}#ssr td,#ssr th{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}`;

let template: { html: string; at: number } | null = null;

/** Only ever serve the real app page — never an error or a sign-in page. */
const isAppPage = (html: string) => html.includes('<div id="root"></div>') && /\/assets\/[^"']+\.js/.test(html);

async function getTemplate(origin: string): Promise<string> {
  if (template && Date.now() - template.at < 5 * 60_000) return template.html;
  // The public address serves this deployment's own index.html once it's
  // live. (A deployment's private *.vercel.app address can be behind Vercel
  // sign-in, which returned the sign-in page instead of the app.)
  const res = await fetch(`${origin}/index.html`, { headers: { 'x-madevisa-template': '1' } });
  const html = res.ok ? await res.text() : '';
  if (!isAppPage(html)) throw new Error(`template not the app (${res.status})`);
  template = { html: withBootGuard(html), at: Date.now() };
  return template.html;
}

/**
 * If the app's script or stylesheet fails to load (a copy of this page cached
 * before a deploy that renamed the files), reload once from a fresh address, which
 * skips the cached copy. Also covers the app not starting within 15 s.
 * sessionStorage stops it from ever looping; main.tsx clears it on success.
 */
function withBootGuard(html: string): string {
  // Only for the app's own script failing to load. At most one reload every
  // 2 minutes (localStorage), so it can never loop. Stylesheet problems are
  // repaired inside the app without reloading (src/main.tsx).
  const guard = `<script>(function(){var k='mv-boot-retry-at';function again(){try{var last=+(localStorage.getItem(k)||0);if(Date.now()-last<120000)return;localStorage.setItem(k,String(Date.now()));var u=new URL(location.href);u.searchParams.set('_r',String(Date.now()));location.replace(u.toString());}catch(e){}}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&t.tagName==='SCRIPT'&&t.type==='module'&&/\\/assets\\//.test(t.src||''))again();},true);})();</script>`;
  return html.replace('<head>', `<head>\n${guard}`);
}

const HEAD_TAGS =
  /<meta\s+[^>]*?(?:name|property)\s*=\s*"(?:description|robots|og:title|og:description|og:url|og:image|og:type|og:image:width|og:image:height|twitter:card|twitter:title|twitter:description|twitter:image)"[^>]*>\s*/gi;

function render(tpl: string, p: Page): string {
  const title = p.title.includes('MadeVisa') ? p.title : `${p.title} | MadeVisa`;
  const url = `${SITE}${p.path}`;
  const image = p.image ?? `${SITE}/api/og/page?p=home`;
  const ld = (o: Record<string, unknown>, id?: string) =>
    `<script type="application/ld+json"${id ? ` id="${id}"` : ''} data-ssr-path="${esc(p.path)}">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(clip(p.description, 300))}">`,
    `<meta name="robots" content="${p.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">`,
    `<link rel="canonical" href="${esc(url)}" data-ssr-path="${esc(p.path)}">`,
    `<meta property="og:type" content="${p.ogType ?? 'website'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(clip(p.description, 300))}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(clip(p.description, 300))}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<style data-ssr-path="${esc(p.path)}">${SSR_CSS}</style>`,
    ...(p.jobPosting ? [ld(p.jobPosting, 'jobposting-jsonld')] : []),
    ...(p.jsonld ?? []).map((o) => ld(o)),
  ].join('\n');

  return tpl
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(HEAD_TAGS, '')
    .replace(/<link\s+[^>]*rel\s*=\s*"canonical"[^>]*>\s*/gi, '')
    .replace('</head>', `${head}\n</head>`)
    .replace(/<div id="root"><\/div>/, `<div id="root"><div id="ssr">${p.body}</div></div>`);
}

const footerLinks = () =>
  `<nav aria-label="MadeVisa"><h2>Explore MadeVisa</h2><ul class="links">${[
    ['/jobs', 'Live jobs from company career pages'],
    ['/companies', 'Company Scores — who replies to applicants'],
    ['/job-market', 'Job market insights, updated hourly'],
    ['/destinations', 'Visas by country'],
    ['/blog', 'Hiring reports and visa guides'],
    ['/about', 'About MadeVisa'],
    ['/how-it-works', 'How MadeVisa works'],
  ]
    .map(([h, t]) => `<li>${link(h, t)}</li>`)
    .join('')}</ul></nav>`;

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const EMPLOYMENT: Record<string, string> = {
  'full time': 'FULL_TIME',
  'part time': 'PART_TIME',
  internship: 'INTERN',
  'seasonal work': 'TEMPORARY',
  'contract / freelance': 'CONTRACTOR',
  volunteer: 'VOLUNTEER',
  apprenticeship: 'OTHER',
};
const SALARY_UNIT: Record<string, string> = { hour: 'HOUR', day: 'DAY', week: 'WEEK', month: 'MONTH', year: 'YEAR' };

function jobPostingLd(j: SeoJob, path: string, descriptionHtml: string): Record<string, unknown> | null {
  if (!j.posted || !descriptionHtml) return null;
  const d: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: j.title,
    description: descriptionHtml,
    datePosted: j.posted,
    url: `${SITE}${path}`,
    identifier: { '@type': 'PropertyValue', name: j.company, value: j.id },
    hiringOrganization: { '@type': 'Organization', name: j.company, ...(j.company_website ? { sameAs: j.company_website } : {}), ...(j.logo ? { logo: j.logo } : {}) },
    directApply: false,
  };
  const validThrough = j.deadline ?? j.expires_at;
  if (validThrough) d.validThrough = validThrough;
  const et = EMPLOYMENT[(j.employment_type ?? '').toLowerCase()];
  if (et) d.employmentType = et;
  const remote = j.work_arrangement === 'remote' || (j.remote && !j.work_arrangement);
  if (remote) {
    d.jobLocationType = 'TELECOMMUTE';
    if (j.country) d.applicantLocationRequirements = { '@type': 'Country', name: j.country };
  }
  if (j.iso && (!remote || j.city)) {
    d.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', ...(j.city ? { addressLocality: j.city } : {}), addressCountry: j.iso } };
  }
  if (!d.jobLocation && !remote) return null; // Google requires a location or remote
  if (j.salary_min != null || j.salary_max != null) {
    const value: Record<string, unknown> = { '@type': 'QuantitativeValue', unitText: SALARY_UNIT[j.salary_period ?? ''] ?? 'YEAR' };
    if (j.salary_min != null && j.salary_max != null && j.salary_min !== j.salary_max) {
      value.minValue = j.salary_min;
      value.maxValue = j.salary_max;
    } else value.value = j.salary_min ?? j.salary_max;
    d.baseSalary = { '@type': 'MonetaryAmount', currency: j.salary_currency || 'USD', value };
  }
  if (j.experience) d.experienceRequirements = j.experience;
  if (j.job_function) d.occupationalCategory = j.job_function;
  return d;
}

async function jobPage(a: string, b: string | null, reqPath: string): Promise<Page | Response> {
  const prefix = b ? b.match(/([0-9a-f]{8})$/i)?.[1] : a.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? a.match(/([0-9a-f]{8})$/i)?.[1];
  const j = prefix ? await rpc<SeoJob | null>('seo_job', { p_prefix: prefix }) : null;
  if (!j) {
    return { status: 404, noindex: true, title: 'Job not found', description: 'This job is no longer on MadeVisa.', path: reqPath, body: `<h1>This job is no longer available</h1><p>${link('/jobs', 'Browse live jobs')}</p>${footerLinks()}`, maxAge: 300 };
  }
  const path = jobPath(j);
  if (path !== reqPath) return new Response(null, { status: 301, headers: { Location: path, 'Cache-Control': 'public, s-maxage=3600' } });

  const loc = [j.city, j.country].filter(Boolean).join(', ') || (j.remote ? 'Remote' : '');
  const crumbs: [string, string][] = [
    ['MadeVisa', '/'],
    ['Jobs', '/jobs'],
    [j.company, companyPath({ id: j.company_id, name: j.company })],
    [j.title, path],
  ];
  const descHtml = safeHtml(j.html || j.description || '');
  const text = plain(descHtml);

  if (j.closed) {
    return {
      status: 410,
      noindex: true,
      title: `${j.title} at ${j.company} (closed)`,
      description: `This ${j.title} role at ${j.company} has closed. See ${j.company}'s other open jobs on MadeVisa.`,
      path,
      body:
        crumbsHtml(crumbs) +
        `<h1>${esc(j.title)} — this job has closed</h1><p>${link(crumbs[2][1], `See open jobs at ${j.company}`)} or ${link('/jobs', 'browse all live jobs')}.</p>` +
        (j.related.length ? `<h2>Other jobs at ${esc(j.company)}</h2><ul class="links">${j.related.map((r) => `<li>${link(jobPath({ ...r, company: j.company }), r.title)}</li>`).join('')}</ul>` : '') +
        footerLinks(),
      maxAge: 3600,
    };
  }

  const facts = [
    loc && `Location: ${loc}`,
    j.work_arrangement && `Work arrangement: ${j.work_arrangement === 'onsite' ? 'On-site' : j.work_arrangement === 'hybrid' ? 'Hybrid' : 'Remote'}`,
    j.employment_type && j.employment_type !== 'Other' && `Employment type: ${j.employment_type}`,
    j.experience && `Experience: ${j.experience}`,
    j.compensation && `Salary: ${j.compensation}`,
    j.visa && 'Visa sponsorship: offered',
    j.posted && `Posted: ${fmtDate(j.posted)}`,
  ].filter(Boolean) as string[];
  const guide = j.iso ? visaGuides.find((g) => g.code === j.iso) : undefined;

  return {
    title: `${j.title} at ${j.company}${loc ? `, ${loc}` : ''}`,
    description: clip(`${j.title} at ${j.company}${loc ? ` in ${loc}` : ''}.${j.employment_type && j.employment_type !== 'Other' ? ` ${j.employment_type}.` : ''} ${text}`, 160),
    path,
    image: `${SITE}/api/og/job?id=${j.id.slice(0, 8)}`,
    jobPosting: jobPostingLd(j, path, descHtml) ?? undefined,
    jsonld: [crumbsLd(crumbs)],
    body:
      crumbsHtml(crumbs) +
      `<h1>${esc(j.title)}</h1><p class="meta">${link(crumbs[2][1], j.company)}${loc ? ` · ${esc(loc)}` : ''}</p>` +
      `<ul>${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` +
      `<h2>About the role</h2><div>${descHtml || `<p>${esc(text)}</p>`}</div>` +
      (j.official_url ? `<p>${`<a href="${esc(j.official_url)}" rel="nofollow noopener">Apply on ${esc(j.company)}’s careers page</a>`}</p>` : '') +
      (j.related.length ? `<h2>More jobs at ${esc(j.company)}</h2><ul class="links">${j.related.map((r) => `<li>${link(jobPath({ ...r, company: j.company }), r.title + (r.city ? ` — ${r.city}` : ''))}</li>`).join('')}</ul>` : '') +
      (guide ? `<p>${link(`/destinations/${guide.slug}`, `Visa routes for working in ${guide.name}`)}</p>` : '') +
      footerLinks(),
    maxAge: 900,
  };
}

async function jobsPage(): Promise<Page> {
  const latest = (await rpc<LatestJob[]>('seo_latest_jobs', { p_limit: 80 })) ?? [];
  const m = PAGES.jobs;
  const byCountry = new Map<string, number>();
  for (const j of latest) if (j.country) byCountry.set(j.country, (byCountry.get(j.country) ?? 0) + 1);
  return {
    title: m.title,
    description: m.description,
    path: '/jobs',
    image: `${SITE}/api/og/page?p=jobs`,
    jsonld: [crumbsLd([['MadeVisa', '/'], ['Jobs', '/jobs']])],
    body:
      `<h1>Live jobs from company career pages</h1><p>${esc(m.description)}</p>` +
      `<h2>Just added</h2><ul class="links">${latest
        .map((j) => `<li>${link(jobPath(j), `${j.title} — ${j.company}${j.city || j.country ? `, ${[j.city, j.country].filter(Boolean).join(', ')}` : ''}`)}</li>`)
        .join('')}</ul>` +
      `<h2>Jobs by country — visa routes</h2><ul class="links">${visaGuides.map((g) => `<li>${link(`/destinations/${g.slug}`, `Jobs and visas in ${g.name}`)}</li>`).join('')}</ul>` +
      footerLinks(),
    maxAge: 600,
  };
}

async function homePage(): Promise<Page> {
  const latest = (await rpc<LatestJob[]>('seo_latest_jobs', { p_limit: 30 })) ?? [];
  const m = PAGES.home;
  return {
    title: 'MadeVisa | Jobs from the Source + Hiring Insights',
    description: m.description,
    path: '/',
    body:
      `<h1>Jobs straight from company career pages — and the insight to apply smarter</h1><p>${esc(m.description)}</p>` +
      `<ul class="links">${[
        ['/jobs', 'Browse live jobs'],
        ['/companies', 'Company Scores: which companies reply'],
        ['/job-market', 'The job market, live'],
        ['/destinations', 'Visas by country'],
        ['/blog', 'Hiring reports and visa guides'],
      ]
        .map(([h, t]) => `<li>${link(h, t)}</li>`)
        .join('')}</ul>` +
      `<h2>New jobs</h2><ul class="links">${latest.map((j) => `<li>${link(jobPath(j), `${j.title} — ${j.company}`)}</li>`).join('')}</ul>` +
      footerLinks(),
    maxAge: 600,
  };
}

async function companyPage(slug: string, reqPath: string): Promise<Page | Response> {
  const prefix = slug.match(/([0-9a-f]{8})$/i)?.[1];
  const c = prefix
    ? await rpc<{ id: string; name: string; logo: string | null; website: string | null; country: string | null; live_jobs: number; jobs: { id: string; title: string; city: string | null }[] } | null>('seo_company', { p_prefix: prefix })
    : null;
  if (!c) return { status: 404, noindex: true, title: 'Company not found', description: 'This company isn’t on MadeVisa.', path: reqPath, body: `<h1>Company not found</h1><p>${link('/companies', 'All companies')}</p>`, maxAge: 300 };
  const path = companyPath(c);
  if (path !== reqPath) return new Response(null, { status: 301, headers: { Location: path, 'Cache-Control': 'public, s-maxage=3600' } });
  const crumbs: [string, string][] = [
    ['MadeVisa', '/'],
    ['Company Scores', '/companies'],
    [c.name, path],
  ];
  return {
    title: `${c.name} — jobs, hiring activity & applicant response`,
    description: `${c.live_jobs ? `${c.live_jobs.toLocaleString('en-US')} open ${c.live_jobs === 1 ? 'job' : 'jobs'} at ${c.name}` : `Jobs at ${c.name}`}, plus real hiring activity and whether the company replies to applicants — tracked on MadeVisa.`,
    path,
    image: `${SITE}/api/og/company?slug=${encodeURIComponent(slug)}`,
    jsonld: [crumbsLd(crumbs), { '@context': 'https://schema.org', '@type': 'Organization', name: c.name, ...(c.website ? { url: c.website } : {}), ...(c.logo ? { logo: c.logo } : {}) }],
    body:
      crumbsHtml(crumbs) +
      `<h1>${esc(c.name)}</h1><p class="meta">${c.country ? `${esc(c.country)} · ` : ''}${c.live_jobs.toLocaleString('en-US')} open jobs on MadeVisa</p>` +
      `<p>Open roles at ${esc(c.name)}, straight from its careers page, with hiring activity and the share of applicants who got a reply.</p>` +
      (c.jobs.length ? `<h2>Open jobs at ${esc(c.name)}</h2><ul class="links">${c.jobs.map((j) => `<li>${link(jobPath({ ...j, company: c.name }), j.title + (j.city ? ` — ${j.city}` : ''))}</li>`).join('')}</ul>` : '') +
      footerLinks(),
    maxAge: 900,
  };
}

function destinationPage(slug: string, reqPath: string): Page {
  const g = visaGuides.find((x) => x.slug === slug);
  if (!g) return { status: 404, noindex: true, title: 'Country not found', description: 'Visas by country on MadeVisa.', path: reqPath, body: `<h1>Not found</h1><p>${link('/destinations', 'All countries')}</p>`, maxAge: 3600 };
  const path = `/destinations/${g.slug}`;
  const crumbs: [string, string][] = [
    ['MadeVisa', '/'],
    ['Visas by country', '/destinations'],
    [g.name, path],
  ];
  return {
    title: `${g.name} — visas, sponsored jobs & companies hiring`,
    description: `Visa routes for ${g.name}, years to permanent residence and citizenship, plus live visa-sponsored jobs and the companies hiring there.`,
    path,
    image: `${SITE}/api/og/page?p=destinations`,
    jsonld: [crumbsLd(crumbs)],
    body:
      crumbsHtml(crumbs) +
      `<h1>Visas and jobs in ${esc(g.name)}</h1><p>${esc(g.blurb)}</p>` +
      `<p>Permanent residence: ${g.prYears == null ? 'no fixed period' : `${g.prYears} years`}. ${esc(g.prNote)}</p><p>Citizenship: ${g.citizenshipYears == null ? 'no fixed period' : `${g.citizenshipYears} years`}. ${esc(g.citizenshipNote)}</p>` +
      `<h2>Visa routes</h2><table><thead><tr><th>Route</th><th>Valid for</th><th>Fee</th></tr></thead><tbody>${g.routes
        .map((r) => `<tr><td><strong>${esc(r.name)}</strong><br>${esc(r.summary)}</td><td>${esc(r.validity)}</td><td>${esc(r.fee ?? '—')}</td></tr>`)
        .join('')}</tbody></table>` +
      `<h2>Official sources</h2><ul class="links">${g.officialLinks.map((l) => `<li><a href="${esc(l.url)}" rel="nofollow noopener">${esc(l.label)}</a></li>`).join('')}</ul>` +
      footerLinks(),
    maxAge: 3600,
  };
}

type ArticleRow = { slug: string; title: string; excerpt: string; body_html?: string; category: string; publish_at: string; updated_at: string; cover_url: string | null; author_name: string };

async function blogPage(): Promise<Page> {
  const list = (await rest<ArticleRow[]>(`articles?select=slug,title,excerpt,category,publish_at,updated_at,cover_url,author_name&status=eq.published&publish_at=lte.${new Date().toISOString()}&order=publish_at.desc&limit=80`)) ?? [];
  return {
    title: 'MadeVisa Blog — hiring reports, visa guides and job-search advice',
    description: 'Weekly hiring reports from live jobs, visa guides by country and practical advice for applying — and hiring — across borders.',
    path: '/blog',
    jsonld: [crumbsLd([['MadeVisa', '/'], ['Blog', '/blog']]), { '@context': 'https://schema.org', '@type': 'Blog', name: 'MadeVisa Blog', url: `${SITE}/blog` }],
    body:
      `<h1>The MadeVisa Blog</h1><p>Hiring reports from live data, visa guides by country and practical job-search advice.</p>` +
      `<ul class="links">${list.map((a) => `<li>${link(`/blog/${a.slug}`, a.title)} — ${esc(a.excerpt)}</li>`).join('')}</ul>` +
      footerLinks(),
    maxAge: 600,
  };
}

async function articlePage(slug: string): Promise<Page> {
  const rows = await rest<ArticleRow[]>(`articles?select=slug,title,excerpt,body_html,category,publish_at,updated_at,cover_url,author_name&slug=eq.${encodeURIComponent(slug)}&status=eq.published&publish_at=lte.${new Date().toISOString()}&limit=1`);
  const a = rows?.[0];
  const path = `/blog/${slug}`;
  if (!a) return { status: 404, noindex: true, title: 'Article not found', description: 'MadeVisa Blog.', path, body: `<h1>Article not found</h1><p>${link('/blog', 'All articles')}</p>`, maxAge: 120 };
  const crumbs: [string, string][] = [
    ['MadeVisa', '/'],
    ['Blog', '/blog'],
    [a.title, path],
  ];
  const image = a.cover_url ?? `${SITE}/api/og/page?p=home`;
  return {
    title: a.title,
    description: a.excerpt || clip(plain(a.body_html), 160),
    path,
    image,
    ogType: 'article',
    jsonld: [
      crumbsLd(crumbs),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: clip(a.title, 110),
        description: a.excerpt,
        image: [image],
        datePublished: a.publish_at,
        dateModified: a.updated_at,
        author: { '@type': 'Organization', name: a.author_name || 'MadeVisa Editorial', url: `${SITE}/about` },
        publisher: { '@type': 'Organization', name: 'MadeVisa', logo: { '@type': 'ImageObject', url: LOGO } },
        mainEntityOfPage: `${SITE}${path}`,
      },
    ],
    body: crumbsHtml(crumbs) + `<h1>${esc(a.title)}</h1><p class="meta">${esc(a.author_name)} · ${fmtDate(a.publish_at)}</p><p>${esc(a.excerpt)}</p><article>${safeHtml(a.body_html ?? '')}</article>` + footerLinks(),
    maxAge: 900,
  };
}

const faqLd = (faq: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

async function staticPage(slug: string): Promise<Page | null> {
  const path = `/${slug}`;
  if (slug === 'about' || slug === 'how-it-works') {
    const p = infoPages[slug];
    const blocks = p.blocks
      .map((b) => {
        if (b.kind === 'text') return `<h2>${esc(b.heading)}</h2>${b.paragraphs.map((x) => `<p>${esc(x)}</p>`).join('')}`;
        if (b.kind === 'contrast')
          return `<h2>${esc(b.heading)}</h2><h3>${esc(b.before.title)}</h3><ul>${b.before.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><h3>${esc(b.after.title)}</h3><ul>${b.after.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
        if (b.kind === 'audiences') return `<h2>${esc(b.heading)}</h2>${b.items.map((i) => `<h3>${esc(i.title)}</h3><ul>${i.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}`;
        const tag = b.kind === 'steps' ? 'ol' : 'ul';
        return `<h2>${esc(b.heading)}</h2>${b.intro ? `<p>${esc(b.intro)}</p>` : ''}<${tag}>${b.items.map((i) => `<li><strong>${esc(i.title)}.</strong> ${esc(i.text)}</li>`).join('')}</${tag}>`;
      })
      .join('');
    return {
      title: p.title,
      description: p.description,
      path,
      jsonld: [crumbsLd([['MadeVisa', '/'], [p.eyebrow, path]]), faqLd(p.faq)],
      body: `<h1>${esc(p.heroTitle)}</h1><p>${esc(p.heroSub)}</p>${blocks}<h2>Questions people ask</h2>${p.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}${footerLinks()}`,
      maxAge: 3600,
    };
  }

  if (slug === 'pricing') {
    return {
      title: 'Pricing — MadeVisa Pro for job seekers, sponsored jobs for employers',
      description: 'Free job search with reply rates and visa routes on every job. Pro adds instant job alerts, full company response data and visa-sponsoring companies. Fair prices by country.',
      path,
      jsonld: [crumbsLd([['MadeVisa', '/'], ['Pricing', path]])],
      body:
        '<h1>Pricing</h1><p>Every job, reply rate and visa route on MadeVisa is free. MadeVisa Pro adds instant job alerts, full company response data and the companies that sponsor visas.</p>' +
        '<h2>For employers</h2><p>Sponsored jobs ($299 for 30 days), featured placement in social posts, employer plans and Hiring Briefs.</p>' +
        footerLinks(),
      maxAge: 3600,
    };
  }

  if (slug === 'job-market') {
    const snap = await rest<{ data: Record<string, any>; computed_at: string }[]>('insights_snapshot?select=data,computed_at&limit=1'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const d = snap?.[0]?.data;
    const n = (x: unknown) => Number(x ?? 0).toLocaleString('en-US');
    const desc = d
      ? `${n(d.live_jobs)} live jobs from ${n(d.companies)} companies in ${n(d.countries)} countries. Who’s hiring this week, the most in-demand roles, remote work and visa sponsorship — updated every hour.`
      : 'Live hiring data from company career pages: who is hiring, in-demand roles, remote work and visa sponsorship by country.';
    return {
      title: 'Job market insights — who’s hiring, where and how, updated hourly',
      description: desc,
      path,
      image: `${SITE}/api/og/page?p=jobs`,
      jsonld: [crumbsLd([['MadeVisa', '/'], ['Job market insights', path]])],
      body:
        `<h1>The job market, live</h1><p>${esc(desc)}</p>` +
        (d
          ? `<h2>Where the jobs are</h2><table><thead><tr><th>Country</th><th>Live jobs</th><th>New this week</th></tr></thead><tbody>${(d.by_country ?? [])
              .slice(0, 15)
              .map((c: { name: string; jobs: number; new_7d: number }) => `<tr><td>${esc(c.name)}</td><td>${n(c.jobs)}</td><td>${n(c.new_7d)}</td></tr>`)
              .join('')}</tbody></table>` +
            `<h2>Who’s hiring this week</h2><ul class="links">${(d.top_companies_7d ?? [])
              .slice(0, 12)
              .map((c: { id: string; name: string; new_7d: number }) => `<li>${link(companyPath(c), c.name)} — ${n(c.new_7d)} new roles</li>`)
              .join('')}</ul>` +
            `<h2>Most in-demand roles</h2><ul>${(d.functions ?? []).slice(0, 10).map((f: { name: string; jobs: number }) => `<li>${esc(f.name)}: ${n(f.jobs)} jobs</li>`).join('')}</ul>` +
            `<p>Remote ${Math.round(d.work?.remote ?? 0)}% · hybrid ${Math.round(d.work?.hybrid ?? 0)}% · on-site ${Math.round(d.work?.onsite ?? 0)}% of jobs that state it. Visa sponsorship stated in ${Math.round(d.visa_share ?? 0)}% of jobs; salary shown in ${Math.round(d.salary_share ?? 0)}%.</p>`
          : '') +
        footerLinks(),
      maxAge: 1800,
    };
  }

  const legal = legalPages[slug];
  if (legal) {
    return {
      title: legal.title,
      description: legal.description,
      path,
      jsonld: [crumbsLd([['MadeVisa', '/'], [legal.title, path]]), ...(legal.faq ? [faqLd(legal.faq)] : [])],
      body:
        `<h1>${esc(legal.title)}</h1>${legal.intro ? `<p>${esc(legal.intro)}</p>` : ''}` +
        (legal.summary ? `<h2>At a glance</h2><ul>${legal.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '') +
        legal.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`).join('') +
        footerLinks(),
      maxAge: 86400,
    };
  }

  const key = (['companies', 'destinations', 'feedback', 'network', 'programs', 'study'] as PageKey[]).find((k) => PAGES[k].path === path);
  if (key) {
    const m = PAGES[key];
    const extra =
      key === 'destinations'
        ? `<ul class="links">${visaGuides.map((g) => `<li>${link(`/destinations/${g.slug}`, `${g.name} — visas, jobs and companies hiring`)}</li>`).join('')}</ul>`
        : '';
    return { title: m.title, description: m.description, path, image: `${SITE}/api/og/page?p=${key}`, jsonld: [crumbsLd([['MadeVisa', '/'], [m.label ?? m.headline, path]])], body: `<h1>${esc(m.headline)}</h1><p>${esc(m.description)}</p>${extra}${footerLinks()}`, maxAge: 1800 };
  }
  return null;
}

// ---------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  const q = url.searchParams;
  const r = q.get('r') ?? '';
  let tpl: string;
  try {
    tpl = await getTemplate(origin);
  } catch {
    // Fall back to the plain static app page, uncached.
    const res = await fetch(`${origin}/index.html`);
    return new Response(res.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const plainApp = () => new Response(tpl, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60' } });

  try {
    const a = q.get('a') ?? '';
    const b = q.get('b');
    const s = q.get('s') ?? '';
    let page: Page | Response | null = null;
    // Short links from social posts: /j/<8 hex>?s=<platform> → the job page.
    if (r === 'short') {
      const prefix = a.match(/^[0-9a-f]{8}$/i)?.[0];
      const j = prefix ? await rpc<SeoJob | null>('seo_job', { p_prefix: prefix }) : null;
      const src = (q.get('s') ?? '').replace(/[^a-z]/gi, '').slice(0, 20);
      const utm = src ? `?utm_source=${src}&utm_medium=social&utm_campaign=jobs` : '';
      const to = j && !j.closed ? `${jobPath(j)}${utm}` : `/jobs${utm}`;
      return new Response(null, { status: j && !j.closed ? 301 : 302, headers: { Location: to, 'Cache-Control': 'public, s-maxage=3600' } });
    }
    if (r === 'job' && a) page = await jobPage(a, b, `/jobs/${a}${b ? `/${b}` : ''}`);
    else if (r === 'jobs') page = await jobsPage();
    else if (r === 'home') page = await homePage();
    else if (r === 'company' && s) page = await companyPage(s, `/companies/${s}`);
    else if (r === 'destination' && s) page = destinationPage(s, `/destinations/${s}`);
    else if (r === 'blog') page = await blogPage();
    else if (r === 'article' && s) page = await articlePage(s);
    else if (r === 'page' && s) page = await staticPage(s);

    if (!page) return plainApp();
    if (page instanceof Response) return page;
    const maxAge = page.maxAge ?? 600;
    return new Response(render(tpl, page), {
      status: page.status ?? 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Browsers always revalidate (the app itself updates live); the edge keeps a copy.
        // Short stale window: after a deploy, old copies must disappear within minutes.
        'cache-control': `public, max-age=0, s-maxage=${Math.min(maxAge, 900)}, stale-while-revalidate=120`,
      },
    });
  } catch {
    return plainApp();
  }
}
