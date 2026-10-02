// Sitemaps for search engines (reached through vercel.json rewrites):
//   /sitemap.xml                  → index of all the files below
//   /sitemaps/pages.xml           → main pages, info and policy pages
//   /sitemaps/destinations.xml    → one page per country
//   /sitemaps/articles.xml        → published blog articles
//   /sitemaps/companies.xml       → companies with open jobs
//   /sitemaps/jobs-1.xml … jobs-N.xml → every live job, 5,000 per file
// Cached at the edge for an hour, so Supabase is asked at most once an hour
// per file however often crawlers come.

import { slugify } from '../src/lib/jobUrl';
import { legalPageOrder } from '../src/data/legalContent';
import { visaGuides } from '../src/data/visa';

export const config = { runtime: 'edge' };

const SITE = 'https://madevisa.com';
const JOBS_PER_FILE = 5000;

const env = (k: string) => (typeof process !== 'undefined' ? process.env[k] : undefined);
async function rpc<T>(name: string, body: Record<string, unknown> = {}): Promise<T | null> {
  const base = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_ANON_KEY');
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);
const url = (loc: string, lastmod?: string, changefreq?: string, priority?: string) =>
  `<url><loc>${xmlEsc(SITE + loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}</url>`;
const urlset = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</urlset>`;
const xml = (body: string, maxAge = 3600) =>
  new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=86400` } });

export default async function handler(req: Request): Promise<Response> {
  const f = new URL(req.url).searchParams.get('f') ?? 'index';
  const today = new Date().toISOString().slice(0, 10);

  if (f === 'index') {
    const counts = await rpc<{ jobs: number; articles: number }>('seo_sitemap_counts');
    const jobFiles = Math.max(1, Math.ceil((counts?.jobs ?? 0) / JOBS_PER_FILE));
    const files = ['pages', 'destinations', 'articles', 'companies', ...Array.from({ length: jobFiles }, (_, i) => `jobs-${i + 1}`)];
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files
        .map((n) => `<sitemap><loc>${SITE}/sitemaps/${n}.xml</loc><lastmod>${today}</lastmod></sitemap>`)
        .join('\n')}\n</sitemapindex>`
    );
  }

  if (f === 'pages') {
    const main: [string, string, string][] = [
      ['/', 'daily', '1.0'],
      ['/jobs', 'hourly', '0.9'],
      ['/companies', 'daily', '0.8'],
      ['/job-market', 'hourly', '0.8'],
      ['/destinations', 'weekly', '0.8'],
      ['/blog', 'daily', '0.7'],
      ['/feedback', 'daily', '0.6'],
      ['/network', 'daily', '0.5'],
      ['/about', 'monthly', '0.6'],
      ['/how-it-works', 'monthly', '0.6'],
      ['/pricing', 'monthly', '0.5'],
      ['/submit-job', 'monthly', '0.4'],
      ['/official-sources', 'monthly', '0.3'],
      ['/employers/inbox', 'monthly', '0.4'],
    ];
    return xml(urlset([...main.map(([p, c, pr]) => url(p, today, c, pr)), ...legalPageOrder.map((s) => url(`/${s}`, undefined, 'yearly', '0.2'))]), 86400);
  }

  if (f === 'destinations') {
    return xml(urlset(visaGuides.map((g) => url(`/destinations/${g.slug}`, undefined, 'weekly', '0.7'))), 86400);
  }

  if (f === 'articles') {
    const base = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL');
    const key = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_ANON_KEY');
    let rows: { slug: string; updated_at: string }[] = [];
    if (base && key) {
      try {
        const res = await fetch(`${base}/rest/v1/articles?select=slug,updated_at&status=eq.published&publish_at=lte.${new Date().toISOString()}&order=publish_at.desc&limit=5000`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) rows = await res.json();
      } catch {
        /* empty file */
      }
    }
    return xml(urlset(rows.map((a) => url(`/blog/${a.slug}`, day(a.updated_at), 'weekly', '0.6'))), 1800);
  }

  if (f === 'companies') {
    const rows = (await rpc<[string, string, string][]>('seo_sitemap_companies')) ?? [];
    return xml(urlset(rows.map(([id, name, lastmod]) => url(`/companies/${slugify(name) || 'company'}-${id.slice(0, 8)}`, day(lastmod), 'daily', '0.6'))));
  }

  const m = f.match(/^jobs-(\d+)$/);
  if (m) {
    const page = Math.max(0, Number(m[1]) - 1);
    const rows = (await rpc<[string, string, string, string][]>('seo_sitemap_jobs', { p_page: page, p_size: JOBS_PER_FILE })) ?? [];
    return xml(urlset(rows.map(([id, title, company, lastmod]) => url(`/jobs/${slugify(company) || 'company'}/${slugify(title) || 'job'}-${id.slice(0, 8)}`, day(lastmod), 'daily', '0.7'))));
  }

  return new Response('Not found', { status: 404 });
}
