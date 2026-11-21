import { ago, esc, fmt, icon, layout, numbers, win } from '../html';
import { runs, stats, type Env } from '../db';
import { countryName, countrySlug } from '../parts';

export async function market(env: Env): Promise<Response> {
  const [s, history] = await Promise.all([stats(env), runs(env, 14)]);
  const share = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);

  const monitor = win(
    'Job Market Today',
    `${numbers([[s.total, 'live jobs'], [s.visa, 'visa sponsorship stated'], [s.new24h, 'new in 24 h'], [s.remote, 'remote'], [s.companies, 'companies']])}
<p class="small">${s.updated ? `Updated ${esc(ago(s.updated))}.` : 'The first update has not run yet.'} Jobs posted in the last ${s.windowDays} days. <a href="/">Browse the jobs »</a></p>`,
    { heading: 'h1' }
  );

  const shares = win(
    'What the ads say',
    `<table class="grid plain"><tbody>
<tr><td>Visa sponsorship stated</td><td><b>${share(s.visa)}%</b></td><td>${fmt(s.visa)} jobs</td></tr>
<tr><td>Right to work required (no sponsorship)</td><td><b>${share(s.notVisa)}%</b></td><td>${fmt(s.notVisa)} jobs</td></tr>
<tr><td>Remote</td><td><b>${share(s.remote)}%</b></td><td>${fmt(s.remote)} jobs</td></tr>
<tr><td>Salary shown in the ad</td><td><b>${share(s.salary)}%</b></td><td>${fmt(s.salary)} jobs</td></tr>
</tbody></table><p class="small">Most ads say nothing about visas — “not stated” isn’t “no”.</p>`,
    {}
  );

  const days = win(
    'Jobs by day posted',
    `<table class="grid plain"><thead><tr><th>Day</th><th>Jobs posted</th></tr></thead><tbody>${[...s.perDay].reverse().map(([d, n]) => `<tr><td>${esc(d)}</td><td>${fmt(n)}</td></tr>`).join('')}</tbody></table>`,
    { cls: 'white' }
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
    table(['Company', 'Jobs', 'Visa stated'], s.topCompanies.slice(0, 20).map(([c, n, v]) => [`<a href="/?company=${encodeURIComponent(c)}">${esc(c)}</a>`, fmt(n), v ? fmt(v) : '—'])),
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
    body: `<div class="market">${monitor}<div class="market-grid">${shares}${sponsors}${countries}${companies}${days}${log}</div><p class="small center">${icon('info')} Counts describe the jobs on MadeVisa (posted in the last ${s.windowDays} days), not a whole country’s job market.</p></div>`,
  });
}

/** For the owner: did tonight's update work, and which company feeds failed. Not indexed. */
export async function status(env: Env): Promise<Response> {
  const [s, history] = await Promise.all([stats(env), runs(env, 30)]);
  const last = history[0];
  const failed = (last?.failed_list ?? '').split('\n').filter(Boolean);
  const body = `<div class="center-wide">${win(
    'System status',
    `${numbers([[s.total, 'live jobs'], [last?.added ?? 0, 'added last run'], [last?.removed ?? 0, 'removed last run'], [last?.sources_ok ?? 0, 'feeds OK'], [last?.sources_failed ?? 0, 'feeds failed']])}
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
