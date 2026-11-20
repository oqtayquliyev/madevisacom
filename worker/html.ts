// HTML building blocks for every page: the retro desktop layout, windows, dialogs and icons.
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
// Windows and dialogs
// ---------------------------------------------------------------------------

type WinOpts = { icon?: IconName; cls?: string; id?: string; status?: string[]; toolbar?: string; inactive?: boolean; heading?: 'h1' | 'h2' | 'div' };

/** A 98-style window. The title is the window's heading (h2 by default). */
export function win(title: string, body: string, o: WinOpts = {}): string {
  const H = o.heading ?? 'h2';
  const status = o.status?.length ? `<div class="status-bar">${o.status.map((s) => `<p class="status-bar-field">${s}</p>`).join('')}</div>` : '';
  return `<section class="window ${o.cls ?? ''}"${o.id ? ` id="${o.id}"` : ''}>
<div class="title-bar${o.inactive ? ' inactive' : ''}"><${H} class="title-bar-text">${o.icon ? icon(o.icon) : ''}<span>${title}</span></${H}><div class="title-bar-controls" aria-hidden="true"><span class="tb-btn">_</span><span class="tb-btn">□</span><span class="tb-btn">×</span></div></div>
${o.toolbar ? `<div class="toolbar">${o.toolbar}</div>` : ''}<div class="window-body">${body}</div>${status}</section>`;
}

/** A message box: icon on the left, text, buttons. */
export function dialog(title: string, ico: IconName, text: string, buttons = '', cls = ''): string {
  return `<section class="window dialog ${cls}" role="note"><div class="title-bar"><div class="title-bar-text"><span>${title}</span></div><div class="title-bar-controls" aria-hidden="true"><span class="tb-btn">×</span></div></div>
<div class="window-body"><div class="msg">${icon(ico, 32)}<div>${text}</div></div>${buttons ? `<div class="dialog-buttons">${buttons}</div>` : ''}</div></section>`;
}

export const button = (label: string, href: string, cls = '') => `<a class="btn ${cls}" href="${esc(href)}">${label}</a>`;

/** Segmented progress bar (0–100). */
export function progress(pct: number, label: string): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `<div class="progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><div class="progress-fill" style="width:${p}%"></div></div>`;
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export const NAV: { href: string; label: string; icon: IconName; short: string }[] = [
  { href: '/jobs', label: 'Browse jobs abroad', icon: 'jobs', short: 'Jobs' },
  { href: '/jobs/visa-sponsorship', label: 'Jobs that state visa sponsorship', icon: 'visa', short: 'Visa jobs' },
  { href: '/destinations', label: 'Work visas by country', icon: 'globe', short: 'Visas' },
  { href: '/cv-match', label: 'CV match', icon: 'cv', short: 'CV match' },
  { href: '/job-market', label: 'The job market, live', icon: 'chart', short: 'Market' },
  { href: '/book', label: 'Book: How to Survive in the 2026–2027 Job Market', icon: 'book', short: 'Book' },
];
const MORE: { href: string; label: string; icon: IconName }[] = [
  { href: '/about', label: 'About MadeVisa', icon: 'info' },
  { href: '/how-it-works', label: 'How MadeVisa works', icon: 'help' },
  { href: '/editorial-policy', label: 'Editorial policy', icon: 'doc' },
  { href: '/contact', label: 'Contact', icon: 'mail' },
  { href: '/privacy', label: 'Privacy', icon: 'shield' },
  { href: '/terms', label: 'Terms', icon: 'doc' },
];

export type Page = {
  title: string;
  description: string;
  path: string;
  body: string;
  /** Which taskbar button is pressed. */
  active?: string;
  noindex?: boolean;
  jsonLd?: unknown[];
  scripts?: string[];
  image?: string;
  status?: number;
};

export function layout(p: Page): Response {
  const canonical = `${SITE}${p.path}`;
  const img = p.image ?? `${SITE}/og-logo.png`;
  const ld = (p.jsonLd ?? []).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`).join('');
  const tasks = NAV.map(
    (n) => `<a class="task${p.active === n.href ? ' active' : ''}" href="${n.href}"${p.active === n.href ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.short}</span></a>`
  ).join('');
  const menu = [...NAV, ...MORE]
    .map((n, i) => `${i === NAV.length ? '<li class="sep" role="separator"></li>' : ''}<li><a href="${n.href}">${icon(n.icon, 24)}<span>${esc(n.label)}</span></a></li>`)
    .join('');
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
<meta name="theme-color" content="#008080">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/retro.css?v=${BUILD}">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="desktop"><main id="main">${p.body}</main>
<footer class="foot-note"><p>MadeVisa lists jobs from employers’ own career pages. MadeVisa does not issue visas, act as an immigration adviser or guarantee a job or a visa.</p>
<p>${MORE.map((m) => `<a href="${m.href}">${esc(m.label.replace(' MadeVisa', '').replace('MadeVisa ', ''))}</a>`).join(' · ')} · <a href="/cookies">Cookies</a> · <a href="/disclaimer">Disclaimer</a></p></footer>
</div>
<nav class="taskbar" aria-label="Main">
<details class="start"><summary class="start-btn">${icon('computer')}<span>Start</span></summary>
<div class="start-menu"><div class="start-side" aria-hidden="true">Made<b>Visa</b> 98</div><ul>${menu}</ul></div></details>
<a class="task task-home${p.active === '/' ? ' active' : ''}" href="/" aria-label="MadeVisa home"><b>MadeVisa</b></a>
<div class="tasks">${tasks}</div>
<div class="tray"><span class="tray-ico" title="Jobs refresh every day">${icon('ok')}</span><time class="clock" aria-hidden="true"></time></div>
</nav>
<script src="/js/ui.js?v=${BUILD}" defer></script>
${(p.scripts ?? []).map((s) => `<script src="${s}?v=${BUILD}" defer></script>`).join('')}
</body>
</html>`;
  return new Response(html, {
    status: p.status ?? 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': p.noindex ? 'no-store' : 'public, max-age=120' },
  });
}
