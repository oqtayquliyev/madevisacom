// HTML building blocks for every page: layout, boxes, buttons and icons in the old-web style kit.
// Styles: public/retro.css. Small browser scripts: client/*.ts (built into public/js/).

export const SITE = 'https://madevisa.com';
import { BUILD } from './build-id';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const fmt = (n: number) => n.toLocaleString('en-US');

export function ago(iso: string | number, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---------------------------------------------------------------------------
// Pixel icons (16×16 grid, drawn with rectangles so they stay crisp)
// ---------------------------------------------------------------------------

type IconName = 'jobs' | 'visa' | 'globe' | 'folder' | 'cv' | 'chart' | 'book' | 'info' | 'mail' | 'shield' | 'computer' | 'search' | 'warn' | 'error' | 'ok' | 'doc' | 'help' | 'remote';

const PIX: Record<IconName, string> = {
  jobs: '<rect x="5" y="2" width="6" height="2" fill="#6b4a1e"/><rect x="5" y="2" width="1" height="3" fill="#6b4a1e"/><rect x="10" y="2" width="1" height="3" fill="#6b4a1e"/><rect x="1" y="5" width="14" height="9" fill="#a0702a"/><rect x="1" y="5" width="14" height="1" fill="#d9a35a"/><rect x="1" y="13" width="14" height="1" fill="#5a3b12"/><rect x="7" y="8" width="2" height="2" fill="#ffd400"/><rect x="1" y="9" width="14" height="1" fill="#6b4a1e"/>',
  visa: '<rect x="3" y="1" width="10" height="14" fill="#0b3d91"/><rect x="3" y="1" width="1" height="14" fill="#2457b5"/><rect x="6" y="4" width="4" height="4" fill="#ffd400"/><rect x="7" y="5" width="2" height="2" fill="#0b3d91"/><rect x="5" y="10" width="6" height="1" fill="#ffd400"/><rect x="5" y="12" width="6" height="1" fill="#ffd400"/>',
  globe: '<rect x="5" y="1" width="6" height="1" fill="#0050c8"/><rect x="3" y="2" width="10" height="2" fill="#0a64e6"/><rect x="2" y="4" width="12" height="8" fill="#1e7bff"/><rect x="3" y="12" width="10" height="2" fill="#0a64e6"/><rect x="5" y="14" width="6" height="1" fill="#0050c8"/><rect x="4" y="4" width="4" height="3" fill="#2fbf3a"/><rect x="9" y="8" width="3" height="4" fill="#2fbf3a"/><rect x="5" y="3" width="2" height="1" fill="#2fbf3a"/>',
  folder: '<rect x="1" y="3" width="6" height="2" fill="#e8c34a"/><rect x="1" y="5" width="14" height="9" fill="#ffd95a"/><rect x="1" y="5" width="14" height="1" fill="#fff2a8"/><rect x="1" y="13" width="14" height="1" fill="#b38b1d"/><rect x="14" y="5" width="1" height="9" fill="#b38b1d"/>',
  cv: '<rect x="3" y="1" width="10" height="14" fill="#fff"/><rect x="3" y="1" width="10" height="1" fill="#888"/><rect x="3" y="14" width="10" height="1" fill="#555"/><rect x="12" y="1" width="1" height="14" fill="#555"/><rect x="5" y="3" width="3" height="3" fill="#0a64e6"/><rect x="9" y="3" width="2" height="1" fill="#333"/><rect x="9" y="5" width="2" height="1" fill="#333"/><rect x="5" y="8" width="6" height="1" fill="#333"/><rect x="5" y="10" width="6" height="1" fill="#333"/><rect x="5" y="12" width="4" height="1" fill="#333"/>',
  chart: '<rect x="1" y="1" width="14" height="14" fill="#000"/><rect x="3" y="9" width="2" height="5" fill="#2cff2c"/><rect x="6" y="5" width="2" height="9" fill="#2cff2c"/><rect x="9" y="7" width="2" height="7" fill="#ffd400"/><rect x="12" y="3" width="2" height="11" fill="#ff4d4d"/>',
  book: '<rect x="2" y="2" width="12" height="12" fill="#c0c0c0"/><rect x="3" y="3" width="10" height="10" fill="#9aa"/><rect x="5" y="5" width="6" height="6" fill="#e0e0e0"/><rect x="7" y="7" width="2" height="2" fill="#333"/><rect x="3" y="3" width="3" height="1" fill="#f0f"/><rect x="10" y="12" width="3" height="1" fill="#0ff"/>',
  info: '<rect x="4" y="1" width="8" height="1" fill="#0050c8"/><rect x="2" y="2" width="12" height="12" fill="#1e7bff"/><rect x="4" y="14" width="8" height="1" fill="#0050c8"/><rect x="7" y="4" width="2" height="2" fill="#fff"/><rect x="7" y="7" width="2" height="5" fill="#fff"/><rect x="6" y="11" width="4" height="1" fill="#fff"/>',
  mail: '<rect x="1" y="3" width="14" height="10" fill="#fff"/><rect x="1" y="3" width="14" height="1" fill="#555"/><rect x="1" y="12" width="14" height="1" fill="#555"/><rect x="2" y="4" width="2" height="1" fill="#555"/><rect x="4" y="5" width="2" height="1" fill="#555"/><rect x="6" y="6" width="4" height="1" fill="#555"/><rect x="10" y="5" width="2" height="1" fill="#555"/><rect x="12" y="4" width="2" height="1" fill="#555"/>',
  shield: '<rect x="3" y="1" width="10" height="8" fill="#2a8a2a"/><rect x="4" y="9" width="8" height="2" fill="#2a8a2a"/><rect x="6" y="11" width="4" height="2" fill="#2a8a2a"/><rect x="7" y="13" width="2" height="1" fill="#2a8a2a"/><rect x="5" y="5" width="2" height="2" fill="#fff"/><rect x="7" y="6" width="2" height="2" fill="#fff"/><rect x="9" y="4" width="2" height="2" fill="#fff"/>',
  computer: '<rect x="2" y="1" width="12" height="9" fill="#c0c0c0"/><rect x="3" y="2" width="10" height="7" fill="#008080"/><rect x="5" y="10" width="6" height="2" fill="#808080"/><rect x="1" y="12" width="14" height="3" fill="#c0c0c0"/><rect x="2" y="13" width="6" height="1" fill="#555"/>',
  search: '<rect x="3" y="2" width="6" height="1" fill="#333"/><rect x="2" y="3" width="1" height="6" fill="#333"/><rect x="9" y="3" width="1" height="6" fill="#333"/><rect x="3" y="9" width="6" height="1" fill="#333"/><rect x="3" y="3" width="6" height="6" fill="#bfe3ff"/><rect x="9" y="9" width="2" height="2" fill="#333"/><rect x="11" y="11" width="3" height="3" fill="#7a4a12"/>',
  warn: '<rect x="7" y="1" width="2" height="2" fill="#000"/><rect x="6" y="3" width="4" height="2" fill="#ffd400"/><rect x="5" y="5" width="6" height="3" fill="#ffd400"/><rect x="3" y="8" width="10" height="4" fill="#ffd400"/><rect x="2" y="12" width="12" height="2" fill="#ffd400"/><rect x="2" y="14" width="12" height="1" fill="#000"/><rect x="7" y="5" width="2" height="5" fill="#000"/><rect x="7" y="11" width="2" height="2" fill="#000"/>',
  error: '<rect x="4" y="1" width="8" height="1" fill="#a00"/><rect x="2" y="2" width="12" height="12" fill="#e01b1b"/><rect x="4" y="14" width="8" height="1" fill="#a00"/><rect x="5" y="5" width="2" height="2" fill="#fff"/><rect x="9" y="5" width="2" height="2" fill="#fff"/><rect x="7" y="7" width="2" height="2" fill="#fff"/><rect x="5" y="9" width="2" height="2" fill="#fff"/><rect x="9" y="9" width="2" height="2" fill="#fff"/>',
  ok: '<rect x="4" y="1" width="8" height="1" fill="#1a7a1a"/><rect x="2" y="2" width="12" height="12" fill="#2fbf3a"/><rect x="4" y="14" width="8" height="1" fill="#1a7a1a"/><rect x="4" y="8" width="2" height="2" fill="#fff"/><rect x="6" y="10" width="2" height="2" fill="#fff"/><rect x="8" y="8" width="2" height="2" fill="#fff"/><rect x="10" y="5" width="2" height="3" fill="#fff"/>',
  doc: '<rect x="3" y="1" width="8" height="14" fill="#fff"/><rect x="11" y="4" width="2" height="11" fill="#fff"/><rect x="11" y="1" width="1" height="3" fill="#999"/><rect x="3" y="14" width="10" height="1" fill="#555"/><rect x="13" y="4" width="1" height="11" fill="#555"/><rect x="5" y="5" width="6" height="1" fill="#555"/><rect x="5" y="7" width="6" height="1" fill="#555"/><rect x="5" y="9" width="6" height="1" fill="#555"/><rect x="5" y="11" width="4" height="1" fill="#555"/>',
  help: '<rect x="4" y="1" width="8" height="1" fill="#6a2c91"/><rect x="2" y="2" width="12" height="12" fill="#8e44c9"/><rect x="4" y="14" width="8" height="1" fill="#6a2c91"/><rect x="6" y="4" width="4" height="1" fill="#fff"/><rect x="10" y="5" width="1" height="2" fill="#fff"/><rect x="8" y="7" width="2" height="2" fill="#fff"/><rect x="7" y="11" width="2" height="2" fill="#fff"/>',
  remote: '<rect x="1" y="2" width="14" height="9" fill="#c0c0c0"/><rect x="2" y="3" width="12" height="7" fill="#1e7bff"/><rect x="0" y="11" width="16" height="2" fill="#808080"/><rect x="6" y="5" width="4" height="3" fill="#ffd95a"/><rect x="5" y="4" width="6" height="1" fill="#ffd95a"/>',
};

export function icon(name: IconName, size = 16, label = ''): string {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${PIX[name]}</svg>`;
}
export type { IconName };

// ---------------------------------------------------------------------------
// Portal boxes (blue title strip + light-yellow body, like an old 1999 home page portal)
// ---------------------------------------------------------------------------

type WinOpts = { icon?: IconName; cls?: string; id?: string; status?: string[]; toolbar?: string; inactive?: boolean; heading?: 'h1' | 'h2' | 'div' };

/** A portal section: coloured title strip, then the content. `inactive` = grey strip, cls "green" = green strip, cls "white" = white body. */
export function win(title: string, body: string, o: WinOpts = {}): string {
  const H = o.heading ?? 'h2';
  const tone = o.inactive ? ' grey' : '';
  const status = o.status?.length ? `<p class="box-foot">${o.status.join(' &nbsp;|&nbsp; ')}</p>` : '';
  return `<section class="box${tone} ${o.cls ?? ''}"${o.id ? ` id="${o.id}"` : ''}><${H} class="box-h"><span>${title}</span></${H}>
${o.toolbar ? `<div class="box-bar">${o.toolbar}</div>` : ''}<div class="box-b">${body}</div>${status}</section>`;
}

/** A small note box with an icon on the left. */
export function dialog(title: string, ico: IconName, text: string, buttons = '', cls = ''): string {
  return `<section class="box note ${cls}"><h2 class="box-h"><span>${title}</span></h2><div class="box-b"><div class="msg">${icon(ico, 32)}<div>${text}</div></div>${buttons ? `<div class="dialog-buttons">${buttons}</div>` : ''}</div></section>`;
}

export const button = (label: string, href: string, cls = '') => `<a class="btn ${cls}" href="${esc(href)}">${label}</a>`;

/** A row of big numbers (no charts). */
export function numbers(items: [value: number | string, label: string][]): string {
  return `<table class="numbers"><tr>${items
    .map(([v, l]) => `<td><b>${typeof v === 'number' ? fmt(v) : esc(v)}</b><span>${esc(l)}</span></td>`)
    .join('')}</tr></table>`;
}

// ---------------------------------------------------------------------------
// Page shell: header (logo + navigation), full-width content, footer
// ---------------------------------------------------------------------------

export const NAV: { href: string; label: string; icon: IconName; short: string }[] = [
  { href: '/', label: 'Browse jobs abroad', icon: 'jobs', short: 'Jobs' },
  { href: '/jobs/visa-sponsorship', label: 'Jobs that state visa sponsorship', icon: 'visa', short: 'Visa jobs' },
  { href: '/destinations', label: 'Work visas by country', icon: 'globe', short: 'Work visas' },
  { href: '/cv-match', label: 'CV match', icon: 'cv', short: 'CV match' },
  { href: '/job-market', label: 'The job market, live', icon: 'chart', short: 'Job market' },
  { href: '/book', label: 'Book: How to Survive in the 2026–2027 Job Market', icon: 'book', short: 'Book' },
];
const MORE: { href: string; label: string }[] = [
  { href: '/about', label: 'About' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/editorial-policy', label: 'Editorial policy' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/disclaimer', label: 'Disclaimer' },
];

export type Page = {
  title: string;
  description: string;
  path: string;
  body: string;
  /** Which navigation item is current. */
  active?: string;
  noindex?: boolean;
  jsonLd?: unknown[];
  scripts?: string[];
  image?: string;
  status?: number;
};

const LOGO = 'https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789479857/madevisa-logo-header_fqdylj.svg';

/** The book on Gumroad (free, pay what you want). ?wanted=true opens the checkout straight away. */
export const BOOK_URL = 'https://madevisa.gumroad.com/l/book?wanted=true';
export const BOOK_TITLE = 'How to Survive in the 2026–2027 Job Market';

export function layout(p: Page): Response {
  const canonical = `${SITE}${p.path}`;
  const img = p.image ?? `${SITE}/og-logo.png`;
  const ld = (p.jsonLd ?? []).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`).join('');
  const nav = NAV.map(
    (n, i) => `<a class="xp-btn${i === 0 ? ' xp-start' : ''}${p.active === n.href ? ' on' : ''}" href="${n.href}"${p.active === n.href ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.short}</span></a>`
  ).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(canonical)}">
${p.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="MadeVisa">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#003399">
<link rel="icon" href="https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789558197/madevisa-fav_j8ot2d.png" type="image/png">
<link rel="apple-touch-icon" href="https://res.cloudinary.com/dkvg0oo8c/image/upload/c_pad,w_180,h_180,b_white/v1789558197/madevisa-fav_j8ot2d.png">
<link rel="stylesheet" href="/retro.css?v=${BUILD}">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="head-row">
    <a class="logo" href="/" aria-label="MadeVisa home"><img src="${LOGO}" alt="MadeVisa" width="147" height="32"></a>
    <span class="head-tag">Jobs abroad, straight from company careers pages</span>
    <span class="head-links"><a href="/how-it-works">Help</a> <a href="/contact">Contact</a></span>
  </div>
  <nav class="xp-bar" aria-label="Main">${nav}</nav>
</header>
<main id="main" class="page">${p.body}</main>
<footer class="site-foot">
<div class="foot-main">
<p class="foot-links">${MORE.map((m) => `<a href="${m.href}">${esc(m.label)}</a>`).join('')}</p>
<p>MadeVisa lists jobs from employers’ own careers pages. MadeVisa does not issue visas, act as an immigration adviser or guarantee a job or a visa.</p>
</div>
<p class="foot-tray"><span>${icon('ok')} Jobs checked every hour</span><span>© 2026 MadeVisa</span></p>
</footer>
${p.path === '/book' ? '' : bookPopup()}
<script src="/js/ui.js?v=${BUILD}" defer></script>
${(p.scripts ?? []).map((s) => `<script src="${s}?v=${BUILD}" defer></script>`).join('')}
</body>
</html>`;
  return new Response(html, {
    status: p.status ?? 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': p.noindex ? 'no-store' : 'public, max-age=120' },
  });
}

/** Small corner box offering the free book (shown after a few seconds; closing hides it for a week). */
function bookPopup(): string {
  return `<aside class="book-pop" id="book-pop" hidden aria-label="Free book">
<section class="box"><h2 class="box-h"><span>${icon('book')} Free PDF book</span><button type="button" class="pop-x" aria-label="Close" data-pop-close>×</button></h2>
<div class="box-b"><a href="/book" class="pop-cover"><img src="/book-cover.webp" alt="" width="74" height="104" loading="lazy"></a><div>
<p class="pop-title">${esc(BOOK_TITLE)}</p>
<p class="small">How AI is changing 40+ industries — and how to adapt with remote work, freelancing and your own product.</p>
<a class="btn-apply btn-pop" href="${BOOK_URL}" target="_blank" rel="noopener" data-pop-done><span>Download free PDF</span></a>
<p class="tiny">Free on Gumroad. If it helps you, you can pay what you want to support MadeVisa.</p>
</div></div></section></aside>`;
}
