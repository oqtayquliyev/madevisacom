// MadeVisa website — one Cloudflare Worker + one D1 database, inside the free plan.
//
//   fetch()      serves every page (HTML is built here; CSS/JS/images come from public/)
//   scheduled()  once a day: asks GitHub to start the job cycle (only if GITHUB_TOKEN is set —
//                GitHub's own daily schedule does it anyway; this is a backup)

import { blobText, type Env } from './db';
import { home } from './pages/home';
import { board } from './pages/jobs';
import { jobPage } from './pages/job';
import { destination, destinations } from './pages/destinations';
import { market, status } from './pages/market';
import { book, cvMatch, notFound, textPage } from './pages/misc';
import { countryBySlug } from './parts';
import { textPages } from '../content/pages';
import { visaGuides } from '../content/visa/index';
import { SITE } from './html';

// Pages of the old site that no longer exist → the closest page now.
const MOVED: [RegExp, string][] = [
  [/^\/(pricing|membership|checkout.*|subscription-terms|sponsorship-document-terms|sponsored-listing-terms|advertising-policy)$/, '/jobs'],
  [/^\/(login|register|reset-password|verify-email|dashboard|profile|my(\/.*)?|notifications|alerts(\/.*)?|network|u\/.+|admin.*|company(\/.*)?|submit.*|employers|partners|offers(\/.*)?|brief(\/.*)?|visa-plan)$/, '/'],
  [/^\/(companies|company-scores|ghostgood|feedback)(\/.*)?$/, '/job-market'],
  [/^\/(blog|reports|programs|study|experts|official-sources|corrections|verification-policy)(\/.*)?$/, '/destinations'],
  [/^\/(visas|work-visas)$/, '/destinations'],
  [/^\/visas\/([a-z-]+)$/, '/destinations/$1'],
  [/^\/jobs\/visa$/, '/jobs/visa-sponsorship'],
];

const HTML_CACHE_SECONDS = 300;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path.length > 1 && path.endsWith('/')) return Response.redirect(`${url.origin}${path.replace(/\/+$/, '')}${url.search}`, 301);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

    for (const [re, to] of MOVED) {
      const m = path.match(re);
      if (m) return Response.redirect(`${url.origin}${to.replace('$1', m[1] ?? '')}`, 301);
    }

    // Static files (CSS, JS, images, robots.txt …).
    if (/\.[a-z0-9]{2,5}$/i.test(path) && !path.startsWith('/api/') && path !== '/sitemap.xml' && !path.startsWith('/sitemap-')) {
      const res = await env.ASSETS.fetch(req);
      if (res.status !== 404) return res;
      return notFound(path);
    }

    // Short-lived edge cache for pages and data: most visitors never touch the database.
    const cacheable = path !== '/status';
    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(url.toString(), { method: 'GET' });
    if (cacheable) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }

    const res = await route(path, url, env);
    if (cacheable && res.status === 200) {
      const copy = new Response(res.clone().body, res);
      copy.headers.set('Cache-Control', `public, max-age=${HTML_CACHE_SECONDS}`);
      ctx.waitUntil(cache.put(key, copy));
    }
    return res;
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;
    ctx.waitUntil(
      fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'madevisa-cron',
        },
        body: JSON.stringify({ event_type: 'daily-jobs' }),
      }).then(async (r) => {
        if (!r.ok) console.log('GitHub dispatch failed', r.status, await r.text());
      })
    );
  },
};

async function route(path: string, url: URL, env: Env): Promise<Response> {
  if (path === '/') return home(env);
  if (path === '/jobs') return board(env, url);
  if (path === '/jobs/visa-sponsorship') return board(env, url, { visa: true });

  let m = path.match(/^\/jobs\/in\/([a-z-]+)$/);
  if (m) {
    const code = countryBySlug.get(m[1]);
    return code ? board(env, url, { country: code }) : notFound(path);
  }
  m = path.match(/^\/jobs\/([^/]+)\/([^/]+)$/) ?? path.match(/^\/jobs\/([^/]+)$/);
  if (m) return jobPage(env, url, m[2] ?? m[1]);

  if (path === '/destinations') return destinations(env);
  m = path.match(/^\/destinations\/([a-z-]+)$/);
  if (m) return (await destination(env, m[1])) ?? notFound(path);

  if (path === '/job-market') return market(env);
  if (path === '/status') return status(env);
  if (path === '/cv-match') return cvMatch();
  if (path === '/book') return book();

  if (path === '/api/jobs.json') return blobResponse(env, 'jobs', 'application/json');
  if (path === '/api/stats.json') return blobResponse(env, 'stats', 'application/json');
  if (path === '/sitemap.xml') return sitemapIndex();
  if (path === '/sitemap-pages.xml') return sitemapPages();
  if (path === '/sitemap-jobs.xml') {
    const b = await blobText(env, 'sitemap-jobs');
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${b?.body ?? ''}\n</urlset>`);
  }

  const slug = path.slice(1);
  if (textPages[slug]) return textPage(slug)!;
  return notFound(path);
}

async function blobResponse(env: Env, key: string, type: string): Promise<Response> {
  const b = await blobText(env, key);
  if (!b) return new Response(key === 'jobs' ? '{"v":1,"updated":"","jobs":[]}' : '{}', { headers: { 'Content-Type': type } });
  return new Response(b.body, { headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=600' } });
}

const xml = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });

function sitemapIndex(): Response {
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>${SITE}/sitemap-pages.xml</loc></sitemap>
<sitemap><loc>${SITE}/sitemap-jobs.xml</loc></sitemap>
</sitemapindex>`);
}

function sitemapPages(): Response {
  const paths = ['/', '/jobs', '/jobs/visa-sponsorship', '/destinations', '/job-market', '/cv-match', '/book', ...Object.keys(textPages).map((s) => `/${s}`), ...visaGuides.map((g) => `/destinations/${g.slug}`)];
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>`);
}
