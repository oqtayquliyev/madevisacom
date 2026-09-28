// Weekly hiring reports — one article per top country, written from live
// data every Monday (pg_cron → articles_weekly_tick → { cron: "articles" })
// and scheduled through the week. Every number comes from
// insights_country_report(); week-on-week change compares with last week's
// report for the same country.

import { companyUrlPath, jobUrl, slugify, type Service } from './shared.ts';

type Report = {
  iso: string;
  name: string;
  live_jobs: number;
  new_7d: number;
  companies: number;
  visa_share: number;
  visa_jobs: number;
  salary_share: number;
  work: { remote: number; hybrid: number; onsite: number; unknown: number };
  companies_top: { id: string; name: string; live: number; new_7d: number; visa: number }[];
  functions: { name: string; jobs: number }[];
  cities: { name: string; jobs: number }[];
  experience: { name: string; jobs: number }[];
  newest: { id: string; title: string; company: string; city: string | null }[];
};

// Countries with a visa guide on /destinations (slug = country name slug).
const GUIDES = new Set(['DE', 'NL', 'FR', 'ES', 'PT', 'GB', 'IE', 'AT', 'BE', 'DK', 'SE', 'FI', 'EE', 'CY', 'IT', 'CA', 'US', 'AU', 'JP', 'SG', 'AE']);

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number) => Math.round(x).toLocaleString('en-US');
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function isoWeek(d: Date): { key: string; prevKey: string } {
  const key = (date: Date) => {
    const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  };
  return { key: key(d), prevKey: key(new Date(d.getTime() - 7 * 86_400_000)) };
}

function weekLabel(end: Date): string {
  const start = new Date(end.getTime() - 6 * 86_400_000);
  const f = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return `${f(start, false)} – ${f(end, true)}`;
}

function change(now: number, before: number | undefined): string {
  if (before == null || before <= 0) return '';
  const p = Math.round(((now - before) / before) * 100);
  if (Math.abs(p) < 3) return ' — about the same as the week before';
  return p > 0 ? ` — up ${p}% on the week before` : ` — down ${Math.abs(p)}% on the week before`;
}

function buildReport(r: Report, prev: Report | null, label: string): { title: string; excerpt: string; html: string } {
  const top = r.companies_top[0];
  const stated = r.work.remote + r.work.hybrid + r.work.onsite;
  const remoteP = pct(r.work.remote, stated);
  const hybridP = pct(r.work.hybrid, stated);
  const onsiteP = pct(r.work.onsite, stated);
  const guideSlug = GUIDES.has(r.iso) ? slugify(r.name) : null;

  const title = `Who’s hiring in ${r.name} this week: ${n(r.new_7d)} new jobs (${label})`;
  const excerpt =
    `${n(r.new_7d)} new roles from ${n(r.companies)} companies in ${r.name}${top ? `, led by ${top.name}` : ''}. ` +
    `${Math.round(r.visa_share)}% of roles mention visa sponsorship${stated >= 10 ? `; ${remoteP}% of those stating a work set-up are fully remote` : ''}.`;

  const h: string[] = [];
  h.push(
    `<p>In the week of ${esc(label)}, employers in ${esc(r.name)} published <strong>${n(r.new_7d)} new jobs</strong> on their own career pages${esc(change(r.new_7d, prev?.new_7d))}. ` +
      `There are now ${n(r.live_jobs)} open roles from ${n(r.companies)} companies. Here is who is hiring, for what, and on what terms.</p>`
  );
  h.push(
    `<div class="stat-grid"><div class="stat"><strong>${n(r.new_7d)}</strong><small>new this week</small></div>` +
      `<div class="stat"><strong>${n(r.live_jobs)}</strong><small>open jobs</small></div>` +
      `<div class="stat"><strong>${n(r.companies)}</strong><small>companies hiring</small></div>` +
      `<div class="stat"><strong>${Math.round(r.visa_share)}%</strong><small>mention visa sponsorship</small></div></div>`
  );

  if (r.companies_top.length) {
    h.push(`<h2>Who’s hiring in ${esc(r.name)}</h2>`);
    if (top) h.push(`<p><a href="${companyUrlPath(top)}">${esc(top.name)}</a> added the most roles this week (${n(top.new_7d)}), and has ${n(top.live)} open in total.</p>`);
    h.push(
      `<table><thead><tr><th>Company</th><th>New this week</th><th>Open roles</th><th>Visa sponsorship</th></tr></thead><tbody>` +
        r.companies_top
          .map((c) => `<tr><td><a href="${companyUrlPath(c)}">${esc(c.name)}</a></td><td>${n(c.new_7d)}</td><td>${n(c.live)}</td><td>${c.visa ? `${n(c.visa)} roles` : '—'}</td></tr>`)
          .join('') +
        `</tbody></table>`
    );
  }

  if (r.functions.length) {
    h.push(`<h2>The most in-demand roles</h2><p>Open jobs in ${esc(r.name)} by function:</p><ol>`);
    for (const f of r.functions) h.push(`<li><strong>${esc(f.name)}</strong> — ${n(f.jobs)} jobs</li>`);
    h.push(`</ol>`);
  }

  if (r.cities.length > 1) {
    h.push(`<h2>Where the jobs are</h2><p>${r.cities
      .slice(0, 6)
      .map((c, i) => `${i === 0 ? '' : i === Math.min(5, r.cities.length - 1) ? ' and ' : ', '}${esc(c.name)} (${n(c.jobs)})`)
      .join('')} have the most openings.</p>`);
  }

  if (stated >= 10) {
    const lead = onsiteP >= hybridP && onsiteP >= remoteP ? 'Most roles are on-site' : hybridP >= remoteP ? 'Hybrid is the most common set-up' : 'Remote is the most common set-up';
    h.push(
      `<h2>Remote, hybrid or on-site?</h2><p>${lead}. Of the ${n(stated)} jobs that say, ${onsiteP}% are on-site, ${hybridP}% hybrid and ${remoteP}% fully remote. ` +
        `${n(r.work.unknown)} ads don’t say — check the original posting.</p>`
    );
  }

  h.push(
    `<h2>Visa sponsorship and pay</h2><p>${n(r.visa_jobs)} open roles (${Math.round(r.visa_share)}%) say they offer visa sponsorship. Most ads don’t mention it either way, so the real number is higher — ask the employer. ` +
      `${Math.round(r.salary_share)}% of jobs show a salary.</p>`
  );
  if (guideSlug) h.push(`<p>Not an EU citizen? See the <a href="/destinations/${guideSlug}">visa routes for ${esc(r.name)}</a>, what each one asks for, and how long until permanent residence.</p>`);

  if (r.experience.length) {
    h.push(`<h2>Experience asked for</h2><ul>${r.experience.map((e) => `<li>${esc(e.name)}: ${n(e.jobs)} jobs</li>`).join('')}</ul>`);
  }

  if (r.newest.length) {
    h.push(`<h2>Just posted</h2><ul>${r.newest.map((j) => `<li><a href="${jobUrl(j).replace('https://madevisa.com', '')}">${esc(j.title)}</a> — ${esc(j.company)}${j.city ? `, ${esc(j.city)}` : ''}</li>`).join('')}</ul>`);
  }

  h.push(
    `<p class="note">How this report is made: it counts live jobs on MadeVisa in ${esc(r.name)} — roles published on employers’ own career pages and by companies that post with us — on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Shares such as remote work and visa sponsorship count only jobs whose ad states it. Live numbers, updated hourly, are on the <a href="/job-market">job market page</a>.</p>`
  );

  return { title, excerpt: excerpt.slice(0, 380), html: h.join('\n') };
}

export async function runArticles(service: Service): Promise<void> {
  let ok = true;
  let summary = '';
  try {
    const { data: cfg } = await service.from('seo_settings').select('reports_per_week, reports_spread_hours, min_jobs_for_report').eq('id', true).maybeSingle();
    const perWeek = Number(cfg?.reports_per_week ?? 6);
    const spread = Number(cfg?.reports_spread_hours ?? 24);
    const minJobs = Number(cfg?.min_jobs_for_report ?? 40);

    const { data: snap } = await service.from('insights_snapshot').select('data').eq('id', true).maybeSingle();
    const countries = ((snap?.data?.by_country ?? []) as { iso: string; name: string; jobs: number }[]).filter((c) => c.jobs >= minJobs).slice(0, perWeek);
    if (!countries.length) throw new Error(`No country has ${minJobs}+ live jobs yet (the hourly snapshot may not have run).`);

    const now = new Date();
    const { key: week, prevKey } = isoWeek(now);
    const label = weekLabel(now);
    const written: string[] = [];
    let skipped = 0;

    for (let i = 0; i < countries.length; i++) {
      const c = countries[i];
      const autoKey = `report:${c.iso}:${week}`;
      const { data: exists } = await service.from('articles').select('id').eq('auto_key', autoKey).maybeSingle();
      if (exists) {
        skipped++;
        continue;
      }
      const { data: report, error } = await service.rpc('insights_country_report', { p_iso: c.iso });
      if (error || !report || !report.live_jobs) continue;
      const { data: prevRow } = await service.from('articles').select('data').eq('auto_key', `report:${c.iso}:${prevKey}`).maybeSingle();
      const built = buildReport(report as Report, (prevRow?.data as Report) ?? null, label);
      const { error: insErr } = await service.from('articles').insert({
        slug: `${slugify(c.name)}-jobs-report-${week.toLowerCase()}`,
        title: built.title,
        excerpt: built.excerpt,
        body_html: built.html,
        category: 'insights',
        tags: ['hiring report', slugify(c.name)],
        country_code: c.iso,
        source: 'auto-report',
        auto_key: autoKey,
        data: report,
        status: 'published',
        publish_at: new Date(now.getTime() + i * spread * 3_600_000).toISOString(),
        author_name: 'MadeVisa Insights',
      });
      if (insErr) throw new Error(insErr.message);
      written.push(c.name);
    }
    await service.from('seo_settings').update({ last_reports_at: new Date().toISOString() }).eq('id', true);
    summary = written.length ? `Wrote ${written.length} hiring reports (${written.join(', ')}), one every ${spread} h` : `No new reports — ${skipped} already written this week`;
  } catch (e) {
    ok = false;
    summary = `Reports failed: ${e instanceof Error ? e.message : 'unknown error'}`;
  }
  await service.rpc('pipeline_finished', { p_kind: 'articles', p_ok: ok, p_summary: summary, p_detail: null });
}
