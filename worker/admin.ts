// /admin — the owner's dashboard, in MadeVisa's modern design (Geist, ink/brand colours, soft cards).
//
// Who can open it: only people Cloudflare Access lets through (your email + a one-time code).
// Access sits in front of /admin and adds a signed pass to every request; this page also
// checks that pass itself, so /admin stays closed even if the Access rule were ever removed.
// Settings: ACCESS_TEAM_DOMAIN and ACCESS_AUD in wrangler.jsonc.

import type { Env, RunRow } from './db';
import { blobText, runs } from './db';
import { esc, fmt, ago } from './html';
import { countryName } from './parts';
import { audIncludes, verifyRs256 } from './jwt';
import { BUILD } from './build-id';

const TZ_HOURS = 4; // Baku (UTC+4, no daylight saving) — "today" means today in Baku
const DAYS = 14;

async function allowed(req: Request, env: Env): Promise<{ email: string } | string> {
  if (env.DEV_SYNC_KEY && new URL(req.url).hostname === '127.0.0.1') return { email: 'local@dev' };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return 'Cloudflare Access is not set up for /admin yet.';
  const token = req.headers.get('Cf-Access-Jwt-Assertion') ?? '';
  if (!token) return 'Open /admin through Cloudflare Access (sign in with your email).';
  const c = await verifyRs256(token, `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`).catch((e) => `check failed: ${e}`);
  if (typeof c === 'string') return `Access pass not accepted: ${c}`;
  if (c.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return 'Access pass from another team.';
  if (!audIncludes(c, env.ACCESS_AUD)) return 'Access pass for another application.';
  return { email: String(c.email ?? 'owner') };
}

type Totals = { n: number; visa: number; novisa: number; remote: number; salary: number; companies: number; countries: number; today: number; yesterday: number; week: number; visa_today: number };
type DayRow = { d: string; n: number; v: number };
type Group = { k: string | null; n: number; v: number; c?: number; t?: number };
type Newest = { id: string; title: string; company: string; country: string | null; visa: string | null; first_seen: string };

async function data(env: Env) {
  const now = Date.now();
  const local = (ms: number) => new Date(ms + TZ_HOURS * 3600_000).toISOString().slice(0, 10);
  // Start of "today" in Baku, as a UTC timestamp string comparable with first_seen.
  const todayStart = new Date(Date.parse(`${local(now)}T00:00:00Z`) - TZ_HOURS * 3600_000).toISOString();
  const yStart = new Date(Date.parse(todayStart) - 86_400_000).toISOString();
  const wStart = new Date(Date.parse(todayStart) - 6 * 86_400_000).toISOString();
  const since = new Date(Date.parse(todayStart) - (DAYS - 1) * 86_400_000).toISOString();
  const plat = "CASE WHEN instr(source, ':') > 0 THEN substr(source, 1, instr(source, ':') - 1) ELSE source END";
  const dayOf = (col: string) => `substr(datetime(${col}, '+${TZ_HOURS} hours'), 1, 10)`;

  const q = <T>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b);
  const res = await env.DB.batch([
    q<Totals>(
      `SELECT count(*) n, coalesce(sum(visa = 'offered'),0) visa, coalesce(sum(visa = 'not_offered'),0) novisa, coalesce(sum(remote),0) remote,
       coalesce(sum(salary IS NOT NULL),0) salary, count(DISTINCT company) companies, count(DISTINCT country) countries,
       coalesce(sum(first_seen >= ?1),0) today, coalesce(sum(first_seen >= ?2 AND first_seen < ?1),0) yesterday, coalesce(sum(first_seen >= ?3),0) week,
       coalesce(sum(first_seen >= ?1 AND visa = 'offered'),0) visa_today FROM jobs`,
      todayStart, yStart, wStart
    ),
    q<DayRow>(`SELECT ${dayOf('first_seen')} d, count(*) n, sum(visa = 'offered') v FROM jobs WHERE first_seen >= ? GROUP BY d ORDER BY d`, since),
    q<DayRow>(`SELECT ${dayOf('posted_at')} d, count(*) n, sum(visa = 'offered') v FROM jobs WHERE posted_at >= ? GROUP BY d ORDER BY d`, since),
    q<Group>(`SELECT ${plat} k, count(*) n, sum(visa = 'offered') v, count(DISTINCT company) c, sum(first_seen >= ?) t FROM jobs GROUP BY k ORDER BY n DESC`, todayStart),
    q<Group>(`SELECT company k, count(*) n, sum(visa = 'offered') v, sum(first_seen >= ?) t FROM jobs GROUP BY company ORDER BY n DESC LIMIT 25`, todayStart),
    q<Group>(`SELECT country k, count(*) n, sum(visa = 'offered') v, sum(first_seen >= ?) t FROM jobs GROUP BY country ORDER BY n DESC LIMIT 20`, todayStart),
    q<Newest>(`SELECT id, title, company, country, visa, first_seen FROM jobs ORDER BY first_seen DESC, posted_at DESC LIMIT 12`),
  ]);
  const days = (rows: DayRow[]) => {
    const m = new Map(rows.map((r) => [r.d, r]));
    return Array.from({ length: DAYS }, (_, i) => {
      const d = local(now - (DAYS - 1 - i) * 86_400_000);
      return m.get(d) ?? { d, n: 0, v: 0 };
    });
  };
  const [history, blob] = await Promise.all([runs(env, 20), blobText(env, 'jobs')]);
  return {
    totals: (res[0].results[0] as Totals) ?? ({} as Totals),
    added: days(res[1].results as DayRow[]),
    posted: days(res[2].results as DayRow[]),
    platforms: res[3].results as Group[],
    companies: res[4].results as Group[],
    countries: res[5].results as Group[],
    newest: res[6].results as Newest[],
    history,
    listUpdated: blob?.updated ?? null,
  };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function bars(rows: DayRow[], label: string): string {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return `<div class="bars" role="img" aria-label="${esc(label)}">${rows
    .map((r) => {
      const h = Math.max(2, Math.round((r.n / max) * 100));
      const hv = r.n ? Math.round((r.v / r.n) * h) : 0;
      return `<div class="bar" title="${esc(r.d)}: ${fmt(r.n)} jobs, ${fmt(r.v)} with visa"><span class="bar-n">${r.n ? fmt(r.n) : ''}</span><div class="bar-track"><div class="bar-fill" style="height:${h}%"><div class="bar-visa" style="height:${hv ? Math.round((r.v / r.n) * 100) : 0}%"></div></div></div><span class="bar-d">${r.d.slice(8)}<small>${new Date(r.d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short' })}</small></span></div>`;
    })
    .join('')}</div>`;
}

function table(head: string[], rows: string[][], cls = ''): string {
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

const kpi = (label: string, value: string, sub = '', tone = '') =>
  `<div class="kpi ${tone}"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p>${sub ? `<p class="kpi-sub">${sub}</p>` : ''}</div>`;

const PLATFORM: Record<string, string> = {
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', recruitee: 'Recruitee',
  personio: 'Personio', smartrecruiters: 'SmartRecruiters', arbeitnow: 'Arbeitnow (job board)', remotive: 'Remotive (job board)',
};

function runStatus(r: RunRow | undefined): { text: string; tone: string } {
  if (!r) return { text: 'No run yet', tone: 'warn' };
  if (!r.finished_at) return { text: 'Running now', tone: 'info' };
  const hours = (Date.now() - Date.parse(r.finished_at)) / 3600_000;
  if (hours > 30) return { text: `Last run ${ago(r.finished_at)} — overdue`, tone: 'bad' };
  if (r.sources_failed) return { text: `OK · ${r.sources_failed} feed${r.sources_failed > 1 ? 's' : ''} failed`, tone: 'warn' };
  return { text: 'All feeds OK', tone: 'good' };
}

export async function admin(req: Request, env: Env): Promise<Response> {
  const who = await allowed(req, env);
  if (typeof who === 'string') return page('Admin — locked', `<div class="locked card"><h1>Admin is locked</h1><p>${esc(who)}</p><p><a href="/">← Back to MadeVisa</a></p></div>`, 403);

  const d = await data(env);
  const t = d.totals;
  const last = d.history[0];
  const st = runStatus(last);
  const failed = (last?.failed_list ?? '').split('\n').filter(Boolean);
  const repo = env.GITHUB_REPO ?? 'oqtayquliyev/madevisacom';

  const body = `
<header class="top"><div class="top-l"><a href="/" class="brand"><img src="https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789479857/madevisa-logo-header_fqdylj.svg" alt="MadeVisa" height="24"></a><span class="pill">Admin</span></div>
<div class="top-r"><span class="who">${esc(who.email)}</span><a class="btn ghost" href="/" target="_blank" rel="noopener">View site ↗</a><a class="btn primary" href="https://github.com/${esc(repo)}/actions/workflows/daily-jobs.yml" target="_blank" rel="noopener">Run job fetch ↗</a></div></header>

<main class="wrap">
<section class="head"><div><h1>Overview</h1><p class="muted">Live numbers from the database · ${esc(new Date(Date.now() + TZ_HOURS * 3600_000).toISOString().slice(0, 16).replace('T', ' '))} Baku time</p></div>
<span class="status ${st.tone}"><span class="dot"></span>${esc(st.text)}</span></section>

<section class="kpis">
${kpi('Live jobs', fmt(t.n ?? 0), `${t.week ? `+${fmt(t.week)} in the last 7 days` : 'posted in the last 14 days'}`)}
${kpi('New today', fmt(t.today ?? 0), `${fmt(t.yesterday ?? 0)} yesterday`, (t.today ?? 0) > 0 ? 'up' : '')}
${kpi('Visa sponsorship', fmt(t.visa ?? 0), `${pct(t.visa, t.n)}% of live jobs · ${fmt(t.visa_today ?? 0)} new today`)}
${kpi('Companies', fmt(t.companies ?? 0), `${fmt(t.countries ?? 0)} countries`)}
${kpi('Remote', fmt(t.remote ?? 0), `${pct(t.remote, t.n)}% of live jobs`)}
${kpi('Salary shown', fmt(t.salary ?? 0), `${pct(t.salary, t.n)}% of live jobs`)}
</section>

<section class="grid2">
<div class="card"><div class="card-h"><h2>New jobs added per day</h2><span class="legend"><i class="lg-all"></i>all <i class="lg-visa"></i>visa</span></div>${bars(d.added, 'New jobs added per day')}</div>
<div class="card"><div class="card-h"><h2>Jobs by day posted (live)</h2><span class="legend"><i class="lg-all"></i>all <i class="lg-visa"></i>visa</span></div>${bars(d.posted, 'Live jobs by day posted')}</div>
</section>

<section class="grid3">
<div class="card"><div class="card-h"><h2>Daily job fetch</h2><a href="https://github.com/${esc(repo)}/actions" target="_blank" rel="noopener">GitHub Actions ↗</a></div>
${last ? `<dl class="facts"><div><dt>Last run</dt><dd>${esc(ago(last.started_at))}</dd></div><div><dt>Added</dt><dd>+${fmt(last.added)}</dd></div><div><dt>Removed (closed / old)</dt><dd>−${fmt(last.removed)}</dd></div><div><dt>Feeds OK / failed</dt><dd>${last.sources_ok} / ${last.sources_failed}</dd></div><div><dt>Site list rebuilt</dt><dd>${d.listUpdated ? esc(ago(d.listUpdated)) : '—'}</dd></div><div><dt>Next run</dt><dd>Daily 06:23 Baku</dd></div></dl>${last.note ? `<p class="note">${esc(last.note)}</p>` : ''}` : '<p class="muted">No run yet.</p>'}
${failed.length ? `<h3>Failed feeds (${failed.length})</h3><ul class="fails">${failed.slice(0, 6).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>${failed.length > 6 ? `<details><summary class="small">Show ${failed.length - 6} more</summary><ul class="fails">${failed.slice(6).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}<p class="muted small">Fix or remove them in <a href="https://github.com/${esc(repo)}/edit/main/fetcher/companies.json" target="_blank" rel="noopener">companies.json ↗</a></p>` : ''}
</div>
<div class="card"><div class="card-h"><h2>Sources</h2><a href="https://github.com/${esc(repo)}/edit/main/fetcher/companies.json" target="_blank" rel="noopener">Edit companies ↗</a></div>
${table(['Platform', 'Jobs', 'Companies', 'Visa', 'Today'], d.platforms.map((p) => [esc(PLATFORM[p.k ?? ''] ?? p.k ?? '—'), fmt(p.n), fmt(p.c ?? 0), fmt(p.v ?? 0), p.t ? `+${fmt(p.t)}` : '—']))}</div>
<div class="card"><div class="card-h"><h2>Newest jobs</h2><a href="/" target="_blank" rel="noopener">Board ↗</a></div>
<ul class="newest">${d.newest
    .map((j) => `<li><a href="/jobs/x/x-${esc(j.id)}" target="_blank" rel="noopener">${esc(j.title)}</a><span>${esc(j.company)}${j.country ? ` · ${esc(countryName.get(j.country) ?? j.country)}` : ''}${j.visa === 'offered' ? ' · <b class="visa">visa</b>' : ''} · ${esc(ago(j.first_seen))}</span></li>`)
    .join('')}</ul></div>
</section>

<section class="grid2">
<div class="card"><div class="card-h"><h2>Top companies</h2></div>${table(['Company', 'Jobs', 'Visa', 'Today'], d.companies.map((c) => [`<a href="/?company=${encodeURIComponent(c.k ?? '')}" target="_blank" rel="noopener">${esc(c.k)}</a>`, fmt(c.n), c.v ? fmt(c.v) : '—', c.t ? `+${fmt(c.t)}` : '—']))}</div>
<div class="card"><div class="card-h"><h2>Countries</h2></div>${table(['Country', 'Jobs', 'Visa', 'Today'], d.countries.map((c) => [esc(c.k ? countryName.get(c.k) ?? c.k : 'Unclear / several'), fmt(c.n), c.v ? `${fmt(c.v)} <span class="muted">(${pct(c.v, c.n)}%)</span>` : '—', c.t ? `+${fmt(c.t)}` : '—']))}</div>
</section>

<section class="card"><div class="card-h"><h2>Run history</h2><span class="muted small">last ${d.history.length} runs</span></div>
${table(['Started (UTC)', 'Added', 'Removed', 'Live after', 'Feeds OK / failed', 'Took'], d.history.map((r) => [esc(r.started_at.slice(0, 16).replace('T', ' ')), `+${fmt(r.added)}`, `−${fmt(r.removed)}`, fmt(r.total), `${r.sources_ok} / ${r.sources_failed}`, r.finished_at ? `${Math.max(1, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000))} s` : 'running']))}</section>
</main>`;
  return page('Admin · MadeVisa', body);
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title><link rel="icon" href="https://res.cloudinary.com/dkvg0oo8c/image/upload/v1789558197/madevisa-fav_j8ot2d.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/admin.css?v=${BUILD}"></head><body>${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
  );
}
