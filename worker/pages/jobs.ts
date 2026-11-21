// The jobs board — MadeVisa's landing page ("/"), plus its preset versions:
// /jobs/visa-sponsorship and /jobs/in/<country>. The browser script (client/board.ts) takes
// over the search and paging once the full list has loaded.

import { ago, esc, fmt, layout } from '../html';
import { newest, stats, type Env } from '../db';
import { countryName, countryOptions, countrySlug, guideByCode, jobList } from '../parts';
import { flag } from '../flags';
import { visaGuides } from '../../content/visa/index';

type Preset = { visa?: boolean; country?: string };

export const pane = (title: string, body: string) => `<section class="xp-pane"><h2 class="xp-pane-h">${title}</h2><div class="xp-pane-b">${body}</div></section>`;

export async function board(env: Env, url: URL, preset: Preset = {}): Promise<Response> {
  const p = url.searchParams;
  const country = (preset.country ?? p.get('country') ?? '').toUpperCase().slice(0, 2);
  const visa = preset.visa || p.get('visa') === '1';
  const remote = p.get('remote') === '1';
  const q = (p.get('q') ?? '').slice(0, 80);
  const days = p.get('days') ?? '';
  const salary = p.get('salary') === '1';
  const company = (p.get('company') ?? '').slice(0, 80);
  const isHome = url.pathname === '/';

  const [s, rows] = await Promise.all([stats(env), newest(env, { country: country || undefined, visa, remote, limit: 50 })]);
  const cName = country ? countryName.get(country) ?? country : '';
  const heading = visa && cName ? `Jobs in ${cName} with visa sponsorship` : visa ? 'Jobs that state visa sponsorship' : cName ? `Jobs in ${cName}` : 'Jobs abroad, straight from company careers pages';
  const total = country ? s.byCountry.find((c) => c[0] === country)?.[visa ? 2 : 1] ?? 0 : visa ? s.visa : s.total;
  const needsJs = Boolean(q || days || salary || company);

  const opt = (v: string, label: string) => `<option value="${v}"${days === v ? ' selected' : ''}>${label}</option>`;
  const chk = (name: string, on: boolean, label: string) =>
    `<label><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}> ${label}</label>`;

  const searchBox = `<section class="box search-hero" id="board" data-country="${esc(country)}" data-visa="${visa ? 1 : 0}">
<h1 class="box-h"><span>${esc(heading)}</span></h1>
<div class="box-b">
<p class="hero-sub"><b>${fmt(s.total)} live jobs</b> from <b>${fmt(s.companies)} companies</b>, checked every hour — straight from their own careers pages, often before they reach LinkedIn or Indeed.${s.updated ? ` Updated ${esc(ago(s.updated))}.` : ''}</p>
<form class="search-big" id="filters" action="${esc(url.pathname)}" method="get" role="search">
  <label class="sr-only" for="f-q">Job title, skill, company or city</label>
  <input id="f-q" type="search" name="q" value="${esc(q)}" placeholder="Job title, skill, company or city" autocomplete="off">
  <label class="sr-only" for="f-country">Country</label><select id="f-country" name="country"${preset.country ? ' disabled' : ''}>${countryOptions(s.byCountry, country)}</select>
  <label class="sr-only" for="f-days">Posted</label><select id="f-days" name="days">${opt('', `Any time (${s.windowDays} days)`)}${opt('1', 'Last 24 hours')}${opt('3', 'Last 3 days')}</select>
  <button type="submit" class="btn-search"><span>Search jobs</span></button>
  <span class="search-checks">${chk('visa', visa, 'Visa sponsorship')}${chk('remote', remote, 'Remote')}${chk('salary', salary, 'Salary shown')}</span>
  <input type="hidden" name="company" value="${esc(company)}">
</form>
${company ? `<p class="small">Company: <b>${esc(company)}</b> - <a href="${esc(url.pathname)}">[clear]</a></p>` : ''}
</div></section>`;

  const results = `<section class="box white results"><h2 class="box-h grey"><span>Results: <b id="board-count">${fmt(total)}</b> jobs</span><span class="box-h-right"><span class="tag tag-new">NEW</span> = posted in the last 6 hours</span></h2>
<div class="box-b white" id="board-list" aria-live="polite">${needsJs ? '<noscript><p class="empty">Search and these filters need JavaScript. Showing the newest jobs instead.</p></noscript>' : ''}${jobList(rows)}</div>
<script type="application/json" id="country-names">${JSON.stringify(Object.fromEntries(s.byCountry.map(([c]) => [c, countryName.get(c) ?? c]))).replace(/</g, '\\u003c')}</script>
<div class="pager" id="board-pager">${rows.length < total ? `Newest ${rows.length} of ${fmt(total)}` : `${fmt(rows.length)} jobs`}</div>
</section>`;

  const guide = country ? guideByCode.get(country) : undefined;
  const visaList = visaGuides
    .slice(0, 12)
    .map((g) => `<li>${flag(g.code, 21)}<a href="/destinations/${g.slug}">${esc(g.name)}</a></li>`)
    .join('');
  const side = [
    guide
      ? pane(`Working in ${esc(guide.name)}`, `<p>${flag(guide.code, 36)}</p><p>${esc(guide.blurb)}</p><p><a href="/destinations/${guide.slug}">Visa routes for ${esc(guide.name)} »</a></p>`)
      : '',
    pane('Visa sponsorship', `<p><span class="tag tag-visa">VISA</span> means the ad itself says the company sponsors or supports a work visa. Most ads say nothing either way — ask the company.</p><p><a href="/jobs/visa-sponsorship">Only visa-sponsored jobs »</a></p>`),
    pane('Your CV match', `<p>Add your CV once — every job page then shows how well you fit. It stays in your browser.</p><p><a href="/cv-match">Add my CV »</a></p>`),
    pane('Work visas by country', `<ul class="flag-list">${visaList}</ul><p><a href="/destinations">All ${visaGuides.length} countries »</a></p>`),
    pane('Busiest countries', `<ul class="flag-list">${s.byCountry
      .filter(([c]) => countryName.has(c))
      .slice(0, 8)
      .map(([c, n]) => `<li>${flag(c, 21)}<a href="/jobs/in/${countrySlug(c)}">${esc(countryName.get(c))}</a> <span class="small">${fmt(n)}</span></li>`)
      .join('')}</ul>`),
  ].join('');

  const path = url.pathname;
  return layout({
    title: isHome ? 'MadeVisa — Jobs abroad straight from company careers pages, updated hourly' : `${heading} — ${fmt(total)} fresh jobs | MadeVisa`,
    description: `${fmt(total)} ${isHome ? 'jobs abroad' : heading.toLowerCase()} from company careers pages, posted in the last ${s.windowDays} days — often before they reach LinkedIn or Indeed. Filter by visa sponsorship, country, remote work and salary.`,
    path: path + (path === '/' && country ? `?country=${country}` : ''),
    active: visa && !country ? '/jobs/visa-sponsorship' : '/',
    body: `${searchBox}<div class="board-wrap"><div class="board-main">${results}</div><aside class="board-side xp-side">${side}</aside></div>`,
    scripts: ['/js/board.js'],
    noindex: Boolean(q || company || days || salary || remote),
    jsonLd: isHome
      ? [
          { '@context': 'https://schema.org', '@type': 'WebSite', name: 'MadeVisa', url: 'https://madevisa.com/', potentialAction: { '@type': 'SearchAction', target: 'https://madevisa.com/?q={q}', 'query-input': 'required name=q' } },
          { '@context': 'https://schema.org', '@type': 'Organization', name: 'MadeVisa', url: 'https://madevisa.com/', logo: 'https://madevisa.com/og-logo.png' },
        ]
      : [],
  });
}
