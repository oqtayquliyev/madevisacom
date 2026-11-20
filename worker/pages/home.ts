import { ago, esc, fmt, icon, layout, numbers, type IconName } from '../html';
import { newest, stats, type Env } from '../db';
import { countryName, countryOptions, countrySlug, guideByCode, jobList } from '../parts';

const SHORTCUTS: { href: string; label: string; icon: IconName }[] = [
  { href: '/jobs', label: 'Jobs abroad', icon: 'jobs' },
  { href: '/jobs/visa-sponsorship', label: 'Visa sponsorship', icon: 'visa' },
  { href: '/destinations', label: 'Work visas', icon: 'folder' },
  { href: '/cv-match', label: 'CV match', icon: 'cv' },
  { href: '/job-market', label: 'Job market', icon: 'chart' },
  { href: '/book', label: 'The book', icon: 'book' },
];

const TILES: { href: string; title: string; text: string; icon: IconName }[] = [
  { href: '/jobs', title: 'FIND A JOB', text: 'Fresh jobs from company career pages.', icon: 'jobs' },
  { href: '/jobs/visa-sponsorship', title: 'VISA JOBS', text: 'Ads that state visa sponsorship.', icon: 'visa' },
  { href: '/cv-match', title: 'CV MATCH', text: 'See how well your CV fits each job.', icon: 'cv' },
];

export async function home(env: Env): Promise<Response> {
  const [s, rows] = await Promise.all([stats(env), newest(env, { limit: 10 })]);

  const desktop = `<nav class="desk-icons" aria-label="Shortcuts">${SHORTCUTS.map(
    (x) => `<a class="desk-icon" href="${x.href}">${icon(x.icon, 32)}<span>${esc(x.label)}</span></a>`
  ).join('')}</nav>`;

  const welcome = `<div class="welcome"><span><b>Welcome!</b> ${s.updated ? `Jobs updated ${esc(ago(s.updated))}` : 'The first job update runs tonight'} - <a href="/how-it-works">[How it works]</a></span><a href="/cv-match">Add your CV free ${icon('cv')}</a></div>`;

  const tiles = `<div class="tiles">${TILES.map(
    (t) => `<a class="tile" href="${t.href}">${icon(t.icon, 48)}<span><b>${t.title}</b><span>${esc(t.text)}</span></span><span class="tile-go" aria-hidden="true">▶</span></a>`
  ).join('')}</div>`;

  const search = `<section class="box"><h1 class="box-h"><span>Find a job abroad. See how well you match it.</span></h1><div class="box-b">
<p>Live jobs straight from company career pages, refreshed every day, filterable by visa sponsorship, country and remote work. Add your CV once and see your match on every job — free.</p>
<form class="search-row" action="/jobs" method="get" role="search">
<label class="sr-only" for="q">Job title, skill or company</label><input id="q" name="q" type="search" placeholder="Job title, skill or company">
<label class="sr-only" for="country">Country</label><select id="country" name="country">${countryOptions(s.byCountry)}</select>
<button type="submit" class="btn">Search</button>
<span class="search-checks"><label><input type="checkbox" name="visa" value="1"> Visa sponsorship only</label> <label><input type="checkbox" name="remote" value="1"> Remote</label></span>
</form></div></section>`;

  // Like the old "Explore Neighborhoods" list: three columns of countries.
  const countries = s.byCountry.filter(([c]) => countryName.has(c)).slice(0, 15);
  const hood = countries.length
    ? `<ul class="hoods">${countries
        .map(([c, n, v]) => `<li><a href="/jobs/in/${countrySlug(c)}">${esc(countryName.get(c))}</a><br><span>(${fmt(n)} jobs${v ? `, ${fmt(v)} visa` : ''})</span></li>`)
        .join('')}</ul><p class="right"><a href="/jobs">view all...</a></p>`
    : '<p>Countries appear here after the first daily update.</p>';
  const explore = `<section class="box"><h2 class="box-h"><span>Explore Countries</span></h2><div class="box-b"><p>Find fresh jobs in one of our <b>${fmt(countries.length)}</b> busiest countries.</p>${hood}</div></section>`;

  const guides = [...guideByCode.values()].slice(0, 9);
  const visas = `<section class="box"><h2 class="box-h"><span>Work Visas by Country</span></h2><div class="box-b"><ul class="hoods">${guides
    .map((g) => `<li><a href="/destinations/${g.slug}">${esc(g.name)}</a><br><span>(${g.routes.length} routes)</span></li>`)
    .join('')}</ul><p class="right"><a href="/destinations">all ${guideByCode.size} countries...</a></p></div></section>`;

  const notable = `<section class="box green"><h2 class="box-h"><span>New and Notable</span></h2><div class="box-b white">
${numbers([[s.total, 'live jobs'], [s.visa, 'visa stated'], [s.new24h, 'new today']])}
<h3 class="side-h">Just posted</h3>${jobList(rows)}<p><a href="/jobs"><b>See all ${fmt(s.total)} jobs »</b></a></p>
<h3 class="side-h"><a href="/book">New book: How to Survive in the 2026–2027 Job Market</a></h3>
<p class="small">How AI changes 40+ industries, and how to adapt with remote work and freelancing.</p>
<p class="small"><b>Note:</b> MadeVisa does not issue visas, act as an immigration adviser or guarantee a job or a visa.</p></div></section>`;

  const body = `${welcome}${tiles}<div class="portal"><div class="portal-main">${search}${explore}${visas}</div><div class="portal-side">${notable}</div></div>`;

  return layout({
    title: 'MadeVisa — Jobs abroad with visa sponsorship, fresh every day',
    description: 'Find a job abroad: fresh jobs from company career pages every day, filter by visa sponsorship, country and remote work, and see how well your CV matches. Free.',
    path: '/',
    active: '/',
    body,
    desktop,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'MadeVisa', url: 'https://madevisa.com/', potentialAction: { '@type': 'SearchAction', target: 'https://madevisa.com/jobs?q={q}', 'query-input': 'required name=q' } },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'MadeVisa', url: 'https://madevisa.com/', logo: 'https://madevisa.com/og-logo.png' },
    ],
  });
}
