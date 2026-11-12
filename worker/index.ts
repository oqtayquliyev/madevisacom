// Cloudflare Worker entry for MadeVisa — replaces vercel.json + middleware.ts.
//
// Order is the same as on Vercel:
//   1. middleware.ts (link-preview cards for bots, one-click unsubscribe, server-rendered homepage)
//   2. redirects + no trailing slash
//   3. /api/* functions
//   4. static files from dist/
//   5. rewrites (SEO pages, sitemaps, short links, SPA fallback)
import middleware from '../middleware';
import seo from '../api/seo';
import sitemap from '../api/sitemap';
import missingAsset from '../api/missing-asset';
import { GET as facets } from '../api/facets';
import socialContent from '../api/social/content';
import ogPage from '../api/og/page';
import ogJob from '../api/og/job';
import ogCompany from '../api/og/company';
import ogPost from '../api/og/post';
import ogProfile from '../api/og/profile';
import ogSocial from '../api/og/social';

interface Env { ASSETS: { fetch(req: Request | string): Promise<Response> } }
type Ctx = { waitUntil(p: Promise<unknown>): void };
type Handler = (req: Request) => Response | Promise<Response>;

const API: Record<string, Handler> = {
  '/api/seo': seo,
  '/api/sitemap': sitemap,
  '/api/missing-asset': missingAsset,
  '/api/facets': () => facets(),
  '/api/social/content': socialContent,
  '/api/og/page': ogPage,
  '/api/og/job': ogJob,
  '/api/og/company': ogCompany,
  '/api/og/post': ogPost,
  '/api/og/profile': ogProfile,
  '/api/og/social': ogSocial,
};
// Responses worth keeping in Cloudflare's cache (Vercel did this via s-maxage).
const CACHEABLE = /^\/api\/(og\/|sitemap|facets|seo)/;

// ── middleware.ts matcher ──
const MW = [/^\/$/, /^\/jobs(\/.+)?$/, /^\/programs$/, /^\/study$/, /^\/companies(\/.+)?$/, /^\/destinations(\/.+)?$/,
  /^\/network$/, /^\/experts$/, /^\/feedback(\/.+)?$/, /^\/u\/.+$/, /^\/alerts\/unsubscribe$/];

const REDIRECTS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/feedback$/, () => '/ghostgood'],
  [/^\/feedback\/([^/]+)$/, (m) => `/ghostgood/${m[1]}`],
  [/^\/official-partners$/, () => '/official-sources'],
];

const PAGES = 'about|how-it-works|pricing|book|cv-match|job-market|contact|privacy|terms|cookies|disclaimer|advertising-policy|sponsored-listing-terms|subscription-terms|sponsorship-document-terms|editorial-policy|corrections|verification-policy|companies|destinations|ghostgood|network|programs|study|offers|official-sources';
const REWRITES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/sitemap\.xml$/, () => '/api/sitemap?f=index'],
  [/^\/sitemaps\/([^/]+)\.xml$/, (m) => `/api/sitemap?f=${m[1]}`],
  [/^\/j\/([^/]+)$/, (m) => `/api/seo?r=short&a=${m[1]}`],
  [/^\/$/, () => '/api/seo?r=home'],
  [/^\/jobs$/, () => '/api/seo?r=jobs'],
  [/^\/jobs\/([^/]+)\/([^/]+)$/, (m) => `/api/seo?r=job&a=${m[1]}&b=${m[2]}`],
  [/^\/jobs\/([^/]+)$/, (m) => `/api/seo?r=job&a=${m[1]}`],
  [/^\/companies\/([^/]+)$/, (m) => `/api/seo?r=company&s=${m[1]}`],
  [/^\/destinations\/([^/]+)$/, (m) => `/api/seo?r=destination&s=${m[1]}`],
  [/^\/blog$/, () => '/api/seo?r=blog'],
  [/^\/blog\/([^/]+)$/, (m) => `/api/seo?r=article&s=${m[1]}`],
  [new RegExp(`^/(${PAGES})$`), (m) => `/api/seo?r=page&s=${m[1]}`],
  [/^\/assets\/.*/, () => '/api/missing-asset'],
  [/^\/(?!api\/|assets\/)(.*)$/, (m) => `/api/seo?r=spa&p=${encodeURIComponent(m[1])}`],
];
const PROXIES: Record<string, string> = {
  '/favicon.ico': 'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789558197/madevisa-fav_j8ot2d.png',
  '/apple-touch-icon.png': 'https://res.cloudinary.com/dkvg0oo8c/image/upload/c_pad,w_180,h_180,b_white/v1789558197/madevisa-fav_j8ot2d.png',
};

// The API code fetches its own site (`${origin}/index.html`, `/og-logo.png`). Inside a Worker that would loop back
// through the internet, so same-host requests are answered straight from the static files instead.
let ASSETS: Env['ASSETS'] | null = null;
const selfHosts = new Set<string>();
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input as RequestInfo, init);
  const u = new URL(req.url);
  if (ASSETS && selfHosts.has(u.host)) {
    if (u.pathname.startsWith('/api/')) return route(req);
    return ASSETS.fetch(req);
  }
  return realFetch(req);
}) as typeof fetch;

const withQuery = (dest: string, original: URL) => {
  const u = new URL(dest, original);
  original.searchParams.forEach((v, k) => { if (!u.searchParams.has(k)) u.searchParams.set(k, v); });
  return u;
};

async function api(request: Request, ctx?: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const h = API[url.pathname.replace(/\/+$/, '')];
  if (!h) return new Response('Not found', { status: 404 });
  const cacheable = ctx && request.method === 'GET' && CACHEABLE.test(url.pathname);
  const cache = (globalThis as unknown as { caches: { default: Cache } }).caches?.default;
  if (cacheable && cache) {
    const hit = await cache.match(request.url);
    if (hit) return hit;
  }
  const res = await h(request);
  if (cacheable && cache && res.ok && /s-maxage|max-age=[1-9]/.test(res.headers.get('cache-control') ?? '')) {
    ctx!.waitUntil(cache.put(request.url, res.clone()));
  }
  return res;
}

async function route(request: Request, ctx?: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/api/')) return api(request, ctx);
  if (PROXIES[path]) return realFetch(PROXIES[path]);

  // static file?
  if (path !== '/') {
    const res = await ASSETS!.fetch(request);
    if (res.status !== 404) return res;
  }
  for (const [re, to] of REWRITES) {
    const m = path.match(re);
    if (m) return api(new Request(withQuery(to(m), url), request), ctx);
  }
  return new Response('Not found', { status: 404 });
}

// public/_headers only covers static files; the same security headers go on Worker-made pages.
const SECURITY: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
};
function secure(res: Response): Response {
  if (res.status >= 300 && res.status < 400) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    return secure(await handle(request, env, ctx));
  },
};

async function handle(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  {
    ASSETS = env.ASSETS;
    const url = new URL(request.url);
    selfHosts.add(url.host);
    const path = url.pathname;

    // trailingSlash: false
    if (path.length > 1 && path.endsWith('/')) {
      url.pathname = path.replace(/\/+$/, '');
      return Response.redirect(url.toString(), 308);
    }
    for (const [re, to] of REDIRECTS) {
      const m = path.match(re);
      if (m) return Response.redirect(new URL(to(m) + url.search, url).toString(), 308);
    }

    // middleware.ts
    if (MW.some((re) => re.test(path))) {
      const r = await middleware(request);
      const rewriteTo = r.headers.get('x-middleware-rewrite');
      if (rewriteTo) return api(new Request(rewriteTo, request), ctx);
      if (!r.headers.get('x-middleware-next')) return r;
    }
    return route(request, ctx);
  }
}
