import { ago, esc, fmt, icon, layout, win } from '../html';
import { stats, type Env } from '../db';
import { countryName, countrySlug, newToday } from '../parts';

export async function market(env: Env): Promise<Response> {
  const s = await stats(env);
  const share = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);

  const monitor = win(
    'Job Market Today',
    `${newToday(s.new24h)}
<p class="small">${s.updated ? `Updated ${esc(ago(s.updated))}.` : 'The first update has not run yet.'} Jobs posted in the last ${s.windowDays} days. <a href="/">Browse the jobs »</a></p>`,
    { heading: 'h1' }
  );

  const shares = win(
    'What the ads say',
    `<table class="grid plain"><tbody>
<tr><td>Visa sponsorship stated</td><td><b>${share(s.visa)}%</b></td></tr>
<tr><td>Right to work required (no sponsorship)</td><td><b>${share(s.notVisa)}%</b></td></tr>
<tr><td>Remote</td><td><b>${share(s.remote)}%</b></td></tr>
<tr><td>Salary shown in the ad</td><td><b>${share(s.salary)}%</b></td></tr>
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
  return layout({
    title: 'Job market, live — jobs abroad and visa sponsorship by country | MadeVisa',
    description: `Jobs from company careers pages: ${fmt(s.new24h)} new in the last 24 hours, which countries and companies hire most, how many state visa sponsorship (${share(s.visa)}%), remote share and salary transparency. Updated hourly.`,
    path: '/job-market',
    active: '/job-market',
    body: `<div class="market">${monitor}<div class="market-grid">${shares}${sponsors}${countries}${companies}${days}</div><p class="small center">${icon('info')} Counts describe the jobs on MadeVisa (posted in the last ${s.windowDays} days), not a whole country’s job market.</p></div>`,
  });
}
