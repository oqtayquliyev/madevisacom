import { ago, dialog, esc, fmt, layout } from '../html';
import { newest, stats, type Env } from '../db';
import { countryName, countryOptions, guideByCode, jobList } from '../parts';

type Preset = { visa?: boolean; country?: string };

export async function board(env: Env, url: URL, preset: Preset = {}): Promise<Response> {
  const p = url.searchParams;
  const country = (preset.country ?? p.get('country') ?? '').toUpperCase().slice(0, 2);
  const visa = preset.visa || p.get('visa') === '1';
  const remote = p.get('remote') === '1';
  const q = (p.get('q') ?? '').slice(0, 80);
  const days = p.get('days') ?? '';
  const salary = p.get('salary') === '1';
  const company = (p.get('company') ?? '').slice(0, 80);

  const [s, rows] = await Promise.all([stats(env), newest(env, { country: country || undefined, visa, remote, limit: 50 })]);
  const cName = country ? countryName.get(country) ?? country : '';
  const heading = visa && cName ? `Jobs in ${cName} with visa sponsorship` : visa ? 'Jobs that state visa sponsorship' : cName ? `Jobs in ${cName}` : 'Jobs abroad';
  const total = country ? s.byCountry.find((c) => c[0] === country)?.[visa ? 2 : 1] ?? 0 : visa ? s.visa : s.total;
  const needsJs = Boolean(q || days || salary || company);

  const opt = (v: string, label: string) => `<option value="${v}"${days === v ? ' selected' : ''}>${label}</option>`;
  const chk = (name: string, on: boolean, label: string) =>
    `<label><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''}> ${label}</label>`;

  const player = `<section class="box board" id="board" data-country="${esc(country)}" data-visa="${visa ? 1 : 0}">
<h1 class="box-h"><span>${esc(heading)}</span></h1>
<div class="box-b">
<form class="search-row" id="filters" action="${esc(url.pathname)}" method="get" role="search">
  <label class="sr-only" for="f-q">Search</label><input id="f-q" type="search" name="q" value="${esc(q)}" placeholder="Title, company or city" autocomplete="off">
  <label class="sr-only" for="f-country">Country</label><select id="f-country" name="country"${preset.country ? ' disabled' : ''}>${countryOptions(s.byCountry, country)}</select>
  <label class="sr-only" for="f-days">Posted</label><select id="f-days" name="days">${opt('', `Any time (${s.windowDays} days)`)}${opt('1', 'Last 24 hours')}${opt('3', 'Last 3 days')}${opt('7', 'Last 7 days')}</select>
  <button type="submit" class="btn">Search</button>
  <span class="search-checks">${chk('visa', visa, 'Visa sponsorship')}${chk('remote', remote, 'Remote')}${chk('salary', salary, 'Salary shown')}</span>
  <input type="hidden" name="company" value="${esc(company)}">
</form>
${company ? `<p class="small">Company: <b>${esc(company)}</b> - <a href="${esc(url.pathname)}">[clear]</a></p>` : ''}
</div></section>
<section class="box white"><h2 class="box-h grey"><span>Results: <b id="board-count">${fmt(total)}</b> jobs</span><span class="box-h-right">${s.updated ? `updated ${esc(ago(s.updated))}` : 'first update tonight'}</span></h2>
<div class="box-b white" id="board-list" aria-live="polite">${needsJs ? '<noscript><p class="empty">Search and these filters need JavaScript. Showing the newest jobs instead.</p></noscript>' : ''}${jobList(rows)}</div>
<script type="application/json" id="country-names">${JSON.stringify(Object.fromEntries(s.byCountry.map(([c]) => [c, countryName.get(c) ?? c]))).replace(/</g, '\\u003c')}</script>
<div class="pager" id="board-pager">${rows.length < total ? `Newest ${rows.length} of ${fmt(total)}` : `${fmt(rows.length)} jobs`}</div>
</section>`;

  const guide = country ? guideByCode.get(country) : undefined;
  const side = [
    dialog(
      'Visa sponsorship',
      'info',
      `<p><b>VISA</b> means the ad itself says the company sponsors or supports a work visa. Most ads say nothing either way — that doesn’t mean no. Ask the company.</p><p class="small">MadeVisa doesn’t issue visas or guarantee a job or a visa.</p>`
    ),
    guide
      ? dialog(`Working in ${esc(guide.name)}`, 'globe', `<p>${esc(guide.blurb)}</p><p><a href="/destinations/${guide.slug}">Visa routes for ${esc(guide.name)} »</a></p>`)
      : dialog('Your CV match', 'cv', `<p>Add your CV once and every job page shows how well you fit — skills, experience, languages.</p><p><a href="/cv-match">Add my CV »</a></p>`),
  ].join('');

  const path = url.pathname;
  return layout({
    title: `${heading} — ${fmt(total)} fresh jobs | MadeVisa`,
    description: `${fmt(total)} ${heading.toLowerCase()}, posted in the last ${s.windowDays} days on company career pages. Filter by visa sponsorship, country, remote work and salary.`,
    path: path + (path === '/jobs' && country ? `?country=${country}` : ''),
    active: visa && !country ? '/jobs/visa-sponsorship' : '/jobs',
    body: `<div class="board-wrap"><div class="board-main">${player}</div><aside class="board-side">${side}</aside></div>`,
    scripts: ['/js/board.js'],
    noindex: Boolean(q || company || days || salary || remote),
  });
}
