// Reads a company website and returns the email addresses it publishes.
// Pure functions + fetch; no Supabase here so it can be tested on its own.

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UA = 'MadeVisaEmailFinder/1.0 (+https://madevisa.com; hello@madevisa.com)';
const MAX_BYTES = 1_500_000;
const PAGE_TIMEOUT = 8000;
const SITE_BUDGET = 30000;
const MAX_PAGES = 7;
const MAX_EMAILS = 15;

export type Found = { email: string; page: string };
export type SiteResult = { url: string; domain: string; pages: number; emails: Found[]; error?: string; blocked?: boolean };

/** Pages that usually carry a contact address, in many languages. */
const LINK_HINT =
  /(contact|kontakt|contacto|contatti|contato|impressum|imprint|legal-notice|mentions-legales|aviso-legal|colofon|about|ueber-uns|uber-uns|über-uns|a-propos|quienes-somos|chi-siamo|team|career|karriere|carriere|carreira|jobs|join|work-with-us|vacatures|stellen|empleo|lavora|hr|recruit)/i;
const GUESSES = ['/contact', '/impressum', '/kontakt', '/contact-us', '/about', '/careers', '/jobs'];

const JUNK_LOCAL =
  /(^|[._-])(no-?reply|do-?not-?reply|donotreply|noreply|mailer-daemon|postmaster|hostmaster|abuse|privacy|gdpr|dpo|dataprotection|data-protection|datenschutz|legal|compliance|unsubscribe|security|webmaster|example|test|sentry|bounce|spam|root|nobody)([._-]|$)/;
const JUNK_DOMAIN =
  /(^|\.)(madevisa\.com|example\.(com|org|net)|sentry\.io|wixpress\.com|domain\.(com|tld)|email\.com|yourcompany\.com|company\.com|yourdomain\.com|mysite\.com|test\.com|godaddy\.com|wordpress\.(com|org)|w3\.org|schema\.org|localhost)$/;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (!/\./.test(u.hostname) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isJunk(email: string): boolean {
  const e = email.toLowerCase();
  const [local, domain] = e.split('@');
  if (!local || !domain || local.length > 48) return true;
  if (!/^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(e)) return true;
  if (/\.(png|jpe?g|gif|svg|webp|avif|css|js|ico|pdf)$/.test(e)) return true;
  if (/^[0-9a-f]{20,}$/.test(local)) return true;
  return JUNK_LOCAL.test(local) || JUNK_DOMAIN.test(domain);
}

/** Cloudflare "email protection": <a data-cfemail="hex"> → the real address. */
export function decodeCf(hex: string): string {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch {
    return '';
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(commat|#64);/gi, '@')
    .replace(/&(period|#46);/gi, '.')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');

/** Every address on a page: mailto links, Cloudflare-protected ones, plain text,
 *  and the usual disguises ("name [at] firm [dot] com", "name(at)firm.com"). */
export function emailsIn(html: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const e = decodeURIComponent(raw.replace(/%(?![0-9a-f]{2})/gi, '%25'))
      .trim()
      .toLowerCase()
      .replace(/^mailto:/, '')
      .split('?')[0]
      .replace(/[.,;:)\]>'"]+$/, '');
    if (e.includes('@') && !isJunk(e)) found.add(e);
  };
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) add(m[1]);
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) add(decodeCf(m[1]));
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s*[[({]\s*(at|ät|@)\s*[\])}]\s*/gi, '@')
    .replace(/\s*[[({]\s*(dot|punkt|point)\s*[\])}]\s*/gi, '.');
  for (const m of text.matchAll(/[a-z0-9][a-z0-9._%+'-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi)) add(m[0]);
  return [...found];
}

/** Same-site links that look like contact / imprint / careers pages, best first. */
export function contactLinks(html: string, base: string, domain: string): string[] {
  const out: { url: string; score: number }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = m[1].trim();
    const label = m[2].replace(/<[^>]+>/g, ' ');
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || hostOf(u.toString()) !== domain) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const key = u.origin + u.pathname.replace(/\/$/, '');
    if (seen.has(key) || key === new URL(base).origin) continue;
    const hay = `${u.pathname} ${label}`;
    if (!LINK_HINT.test(hay)) continue;
    seen.add(key);
    const score = /contact|kontakt|impressum|imprint/i.test(hay) ? 3 : /career|karriere|jobs|hr|recruit/i.test(hay) ? 2 : 1;
    out.push({ url: u.origin + u.pathname, score });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.url);
}

async function fetchPage(url: string, deadline: number): Promise<{ html: string; finalUrl: string } | null> {
  const left = deadline - Date.now();
  if (left < 1500) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.min(PAGE_TIMEOUT, left));
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok || !/html|text\/plain/i.test(res.headers.get('content-type') ?? 'text/html')) {
      await res.body?.cancel();
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    const buf = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.length, size - o)), o);
      o += c.length;
      if (o >= size) break;
    }
    return { html: new TextDecoder().decode(buf), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** robots.txt: respect "Disallow: /" (or the page's path) for every robot. */
async function robotsAllows(origin: string, deadline: number): Promise<(path: string) => boolean> {
  const r = await fetchPage(origin + '/robots.txt', Math.min(deadline, Date.now() + 4000));
  if (!r) return () => true;
  const rules: string[] = [];
  let applies = false;
  for (const line of r.html.split(/\r?\n/)) {
    const [k, ...rest] = line.split(':');
    const v = rest.join(':').trim();
    const key = k.trim().toLowerCase();
    if (key === 'user-agent') applies = v === '*' || /madevisa/i.test(v);
    else if (key === 'disallow' && applies && v) rules.push(v);
  }
  return (path: string) => !rules.some((rule) => path.startsWith(rule.replace(/\*.*$/, '')));
}

/** Homepage + up to 6 contact-like pages of one site. */
export async function scanSite(rawUrl: string): Promise<SiteResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { url: rawUrl, domain: '', pages: 0, emails: [], error: 'Not a website address' };
  const domain = hostOf(url);
  const deadline = Date.now() + SITE_BUDGET;
  const origin = new URL(url).origin;
  const allowed = await robotsAllows(origin, deadline);
  if (!allowed('/')) return { url, domain, pages: 0, emails: [], blocked: true, error: 'The site asks robots not to read it (robots.txt)' };

  const found = new Map<string, string>();
  const take = (html: string, page: string) => {
    for (const e of emailsIn(html)) if (!found.has(e)) found.set(e, page);
  };

  let home = await fetchPage(url, deadline);
  if (!home && !/\/\/www\./.test(url)) home = await fetchPage(url.replace('://', '://www.'), deadline);
  if (!home) return { url, domain, pages: 0, emails: [], error: 'The website didn’t answer' };
  let pages = 1;
  take(home.html, home.finalUrl);

  const finalDomain = hostOf(home.finalUrl) || domain;
  const queue = contactLinks(home.html, home.finalUrl, finalDomain);
  const base = new URL(home.finalUrl).origin;
  for (const g of GUESSES) if (!queue.some((q) => new URL(q).pathname.replace(/\/$/, '') === g)) queue.push(base + g);

  for (const next of queue) {
    if (pages >= MAX_PAGES || found.size >= MAX_EMAILS * 2 || Date.now() > deadline - 1500) break;
    if (!allowed(new URL(next).pathname)) continue;
    const p = await fetchPage(next, deadline);
    if (!p) continue;
    pages++;
    take(p.html, p.finalUrl);
  }

  // The company's own addresses first, then others it lists (e.g. a recruiting agency).
  const emails = [...found.entries()]
    .map(([email, page]) => ({ email, page }))
    .sort((a, b) => Number(b.email.endsWith('@' + finalDomain) || b.email.endsWith('.' + finalDomain)) - Number(a.email.endsWith('@' + finalDomain) || a.email.endsWith('.' + finalDomain)))
    .slice(0, MAX_EMAILS);
  return { url, domain, pages, emails, ...(emails.length ? {} : { error: 'No email address published on the pages read' }) };
}

/** A few sites at once (each has its own time budget). */
export async function scanSites(urls: string[]): Promise<SiteResult[]> {
  return await Promise.all(urls.map((u) => scanSite(u).catch((e) => ({ url: u, domain: hostOf(u), pages: 0, emails: [], error: e instanceof Error ? e.message : 'Failed' }))));
}
