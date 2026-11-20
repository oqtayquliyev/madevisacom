import { ago, esc, fmt, icon, layout, progress, win } from '../html';
import { runs, stats, type Env } from '../db';
import { countryName, countrySlug, lcd } from '../parts';

/** Winamp equalizer: one slider per item, height = share of the biggest. */
function equalizer(items: { label: string; value: number; title: string; href?: string }[]): string {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="eq" role="list">${items
    .map((i) => {
      const pct = Math.round((i.value / max) * 100);
      const inner = `<span class="eq-val">${fmt(i.value)}</span><span class="eq-track"><span class="eq-fill" style="height:${pct}%"></span><span class="eq-knob" style="bottom:calc(${pct}% - 5px)"></span></span><span class="eq-label">${esc(i.label)}</span>`;
      return `<div class="eq-band" role="listitem" title="${esc(i.title)}">${i.href ? `<a href="${esc(i.href)}">${inner}</a>` : inner}</div>`;
    })
    .join('')}</div>`;
}

export async function market(env: Env): Promise<Response> {
  const [s, history] = await Promise.all([stats(env), runs(env, 14)]);
  const share = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);

  const monitor = `<section class="winamp" aria-labelledby="mm"><div class="wa-title"><h1 id="mm">JOB MARKET MONITOR</h1></div>
<div class="wa-screen pad"><div class="lcd-row">${lcd(s.total, 'live jobs')}${lcd(s.visa, 'visa sponsorship stated')}${lcd(s.new24h, 'new in 24 h')}${lcd(s.remote, 'remote')}${lcd(s.companies, 'companies')}</div></div>
<div class="wa-title sub"><h2>COUNTRIES — TOP 12</h2></div>
${equalizer(s.byCountry.slice(0, 12).map(([c, n]) => ({ label: c, value: n, title: `${countryName.get(c) ?? c}: ${fmt(n)} jobs`, href: `/jobs/in/${countrySlug(c)}` })))}
<div class="wa-title sub"><h2>JOBS BY DAY POSTED</h2></div>
${equalizer(s.perDay.map(([d, n]) => ({ label: d.slice(8, 10), value: n, title: `${d}: ${fmt(n)} jobs` })))}
<div class="wa-foot"><span class="wa-info">${s.updated ? `UPDATED ${esc(ago(s.updated).toUpperCase())}` : 'FIRST UPDATE PENDING'}</span><a class="wa-btn" href="/jobs">JOBS ▶</a></div></section>`;

  const shares = win(
    'What the ads say',
    `<p>Visa sponsorship stated: <b>${share(s.visa)}%</b></p>${progress(share(s.visa), 'Visa sponsorship stated')}
<p>Right to work required (no sponsorship): <b>${share(s.notVisa)}%</b></p>${progress(share(s.notVisa), 'No sponsorship')}
<p>Remote: <b>${share(s.remote)}%</b></p>${progress(share(s.remote), 'Remote')}
<p>Salary shown: <b>${share(s.salary)}%</b></p>${progress(share(s.salary), 'Salary shown')}
<p class="small">Most ads say nothing about visas — “not stated” isn’t “no”.</p>`,
    { icon: 'chart' }
  );

  const table = (head: string[], rows: string[][]) =>
    `<div class="sunken table-wrap"><table class="grid"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;

  const countries = win(
    'Jobs by country',
    table(
      ['Country', 'Jobs', 'Visa stated'],
      s.byCountry.slice(0, 30).map(([c, n, v]) => [`<a href="/jobs/in/${countrySlug(c)}">${esc(countryName.get(c) ?? c)}</a>`, fmt(n), v ? `${fmt(v)} (${Math.round((v / n) * 100)}%)` : '—'])
    ),
    { icon: 'globe' }
  );
  const companies = win(
    'Companies hiring most',
    table(['Company', 'Jobs', 'Visa stated'], s.topCompanies.slice(0, 20).map(([c, n, v]) => [`<a href="/jobs?company=${encodeURIComponent(c)}">${esc(c)}</a>`, fmt(n), v ? fmt(v) : '—'])),
    { icon: 'jobs' }
  );
  const sponsors = win(
    'Most visa-sponsored jobs',
    s.topVisaCompanies.length
      ? table(['Company', 'Jobs stating sponsorship'], s.topVisaCompanies.map(([c, v]) => [`<a href="/jobs/visa-sponsorship?company=${encodeURIComponent(c)}">${esc(c)}</a>`, fmt(v)]))
      : '<p>None yet.</p>',
    { icon: 'visa' }
  );
  const log = win(
    'Daily updates',
    history.length
      ? table(['Finished', 'Added', 'Removed', 'Live'], history.map((r) => [esc(r.finished_at ? ago(r.finished_at) : 'running'), `+${fmt(r.added)}`, `−${fmt(r.removed)}`, fmt(r.total)]))
      : '<p>The first update hasn’t run yet.</p>',
    { icon: 'computer', inactive: true }
  );

  return layout({
    title: 'Job market, live — jobs abroad and visa sponsorship by country | MadeVisa',
    description: `${fmt(s.total)} live jobs from company career pages: which countries and companies hire most, how many state visa sponsorship (${share(s.visa)}%), remote share and salary transparency. Updated daily.`,
    path: '/job-market',
    active: '/job-market',
    body: `<div class="market">${monitor}<div class="market-grid">${shares}${sponsors}${countries}${companies}${log}</div><p class="small center">${icon('info')} Counts describe the jobs on MadeVisa (posted in the last ${s.windowDays} days), not a whole country’s job market.</p></div>`,
  });
}

/** For the owner: did tonight's update work, and which company feeds failed. Not indexed. */
export async function status(env: Env): Promise<Response> {
  const [s, history] = await Promise.all([stats(env), runs(env, 30)]);
  const last = history[0];
  const failed = (last?.failed_list ?? '').split('\n').filter(Boolean);
  const body = `<div class="center-wide">${win(
    'System status',
    `<div class="lcd-row">${lcd(s.total, 'live jobs')}${lcd(last?.added ?? 0, 'added last run')}${lcd(last?.removed ?? 0, 'removed last run')}${lcd(last?.sources_ok ?? 0, 'feeds OK')}${lcd(last?.sources_failed ?? 0, 'feeds failed')}</div>
<p>${last ? `Last run started ${esc(ago(last.started_at))}${last.finished_at ? `, finished ${esc(ago(last.finished_at))}` : ' and has not finished'}.` : 'No run yet — start one on GitHub: Actions → Daily jobs → Run workflow.'}</p>
${last?.note ? `<p>${icon('info')} ${esc(last.note)}</p>` : ''}
<fieldset><legend>Feeds that failed in the last run (${failed.length})</legend>${failed.length ? `<ul class="mono">${failed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="small">Fix the id or remove the company in <code>fetcher/companies.json</code>.</p>` : '<p>None.</p>'}</fieldset>
<fieldset><legend>Run history</legend><div class="sunken table-wrap"><table class="grid"><thead><tr><th>Started (UTC)</th><th>Added</th><th>Removed</th><th>Live</th><th>Feeds OK / failed</th></tr></thead><tbody>${history
      .map((r) => `<tr><td>${esc(r.started_at.slice(0, 16).replace('T', ' '))}</td><td>${fmt(r.added)}</td><td>${fmt(r.removed)}</td><td>${fmt(r.total)}</td><td>${r.sources_ok} / ${r.sources_failed}</td></tr>`)
      .join('')}</tbody></table></div></fieldset>`,
    { icon: 'computer', heading: 'h1' }
  )}</div>`;
  return layout({ title: 'Status | MadeVisa', description: 'Daily job update status.', path: '/status', body, noindex: true });
}
