import { ago, button, dialog, esc, fmt, icon, layout, win, type IconName } from '../html';
import { newest, stats, type Env } from '../db';
import { countryOptions, lcd, playlist } from '../parts';

const SHORTCUTS: { href: string; label: string; icon: IconName }[] = [
  { href: '/jobs', label: 'Jobs abroad', icon: 'jobs' },
  { href: '/jobs/visa-sponsorship', label: 'Visa sponsorship', icon: 'visa' },
  { href: '/destinations', label: 'Work visas', icon: 'folder' },
  { href: '/cv-match', label: 'CV match', icon: 'cv' },
  { href: '/job-market', label: 'Job market', icon: 'chart' },
  { href: '/jobs?remote=1', label: 'Remote jobs', icon: 'remote' },
  { href: '/book', label: 'The book', icon: 'book' },
  { href: '/about', label: 'About.txt', icon: 'doc' },
];

export async function home(env: Env): Promise<Response> {
  const [s, rows] = await Promise.all([stats(env), newest(env, { limit: 12 })]);

  const icons = `<nav class="desk-icons" aria-label="Shortcuts">${SHORTCUTS.map(
    (x) => `<a class="desk-icon" href="${x.href}">${icon(x.icon, 32)}<span>${esc(x.label)}</span></a>`
  ).join('')}</nav>`;

  const search = win(
    'MadeVisa — Find a job abroad',
    `<h1 class="hero">Find a job abroad. See how well you match it.</h1>
<p class="lead">Live jobs straight from company career pages, refreshed every day, filterable by visa sponsorship, country and remote work. Add your CV once and see your match on every job — free.</p>
<form class="search-form" action="/jobs" method="get" role="search">
  <div class="field-row-stacked"><label for="q">Job title, skill or company</label><input id="q" name="q" type="search" placeholder="e.g. product designer, nurse, Python" autocomplete="off"></div>
  <div class="field-row-stacked"><label for="country">Country</label><select id="country" name="country">${countryOptions(s.byCountry)}</select></div>
  <div class="field-row"><input type="checkbox" id="visa" name="visa" value="1"><label for="visa">Only jobs that state visa sponsorship</label></div>
  <div class="field-row"><input type="checkbox" id="remote" name="remote" value="1"><label for="remote">Remote</label></div>
  <button type="submit" class="btn btn-primary">${icon('search')} Search jobs</button>
</form>`,
    { icon: 'computer', cls: 'w-hero', heading: 'div' }
  );

  const numbers = win(
    'Job Market Monitor',
    `<div class="lcd-row">${lcd(s.total, 'live jobs')}${lcd(s.visa, 'state visa sponsorship')}${lcd(s.new24h, 'new in 24 h')}${lcd(s.companies, 'companies')}</div>
<p class="small">${s.updated ? `Last update ${esc(ago(s.updated))}. ` : 'The first update runs tonight. '}Jobs posted in the last ${s.windowDays} days. <a href="/job-market">See the market »</a></p>`,
    { icon: 'chart' }
  );

  const fresh = `<section class="winamp" aria-labelledby="new-jobs"><div class="wa-title"><h2 id="new-jobs">NEW JOBS</h2></div>
<div class="wa-screen">${playlist(rows)}</div>
<div class="wa-foot"><a class="wa-btn" href="/jobs">ALL JOBS ▶</a><a class="wa-btn" href="/jobs/visa-sponsorship">VISA ONLY</a><span class="wa-info">${fmt(s.total)} JOBS</span></div></section>`;

  const about = dialog(
    'About MadeVisa',
    'info',
    `<p>MadeVisa is a job search site for people who want to work in another country. It lists jobs taken directly from employers’ own career pages, shows which jobs state visa sponsorship, and explains the visa routes for working in each country.</p>
<p><b>MadeVisa does not issue visas, act as an immigration adviser or guarantee a job or a visa.</b></p>`,
    button('How it works', '/how-it-works') + button('OK', '/jobs', 'btn-default')
  );

  const explore = win(
    'Explore MadeVisa',
    `<ul class="tree">
<li><a href="/jobs">Jobs abroad, live from company career pages</a></li>
<li><a href="/jobs/visa-sponsorship">Jobs that state visa sponsorship</a></li>
<li><a href="/cv-match">CV match — how well your CV fits a job</a></li>
<li><a href="/job-market">Job market insights, updated daily</a></li>
<li><a href="/destinations">Work visas by country</a></li>
<li><a href="/book">Book: How to Survive in the 2026–2027 Job Market</a></li>
<li><a href="/about">About MadeVisa</a> · <a href="/how-it-works">How it works</a> · <a href="/contact">Contact</a></li>
</ul>`,
    { icon: 'folder', inactive: true }
  );

  const body = `<div class="home">${icons}<div class="home-main">${search}<div class="home-cols"><div>${fresh}</div><div>${numbers}${about}${explore}</div></div></div></div>`;

  return layout({
    title: 'MadeVisa — Jobs abroad with visa sponsorship, fresh every day',
    description: 'Find a job abroad: fresh jobs from company career pages every day, filter by visa sponsorship, country and remote work, and see how well your CV matches. Free.',
    path: '/',
    active: '/',
    body,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'MadeVisa', url: 'https://madevisa.com/', potentialAction: { '@type': 'SearchAction', target: 'https://madevisa.com/jobs?q={q}', 'query-input': 'required name=q' } },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'MadeVisa', url: 'https://madevisa.com/', logo: 'https://madevisa.com/og-logo.png' },
    ],
  });
}
