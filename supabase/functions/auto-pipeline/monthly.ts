// Monthly Visa Hiring Report — one global article on the 1st of each month
// about the month before ({ cron: "monthly" }, migration 20261120090000).
//
// Every number comes from visa_hiring_monthly(). Sections with too little
// data are left out rather than shown with shaky numbers, and companies
// only ever appear in positive lists.

import { companyUrlPath, slugify, type Service } from './shared.ts';

export type MonthlyData = {
  from: string;
  to: string;
  jobs: number;
  visa_jobs: number;
  companies: number;
  countries: { iso: string; name: string; jobs: number; visa_jobs: number }[];
  visa_companies: { id: string; name: string; visa_jobs: number }[];
  uk: { jobs: number; licensed_jobs: number; register_orgs: number; checked: string | null };
  plans: { created: number; opened: number; replied: number; verified: number; interested: number; enough: boolean };
  applications: { tracked: number; replied: number; enough: boolean };
  responsive: { id: string; name: string; tracked: number; rate: number }[];
};

/** Below this, the month isn't worth a report. */
export const MIN_JOBS = 50;

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number) => Math.round(x).toLocaleString('en-US');
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

export function monthName(fromIso: string): string {
  return new Date(`${fromIso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function buildMonthly(d: MonthlyData, prev: MonthlyData | null): { title: string; excerpt: string; html: string } {
  const month = monthName(d.from);
  const visaShare = pct(d.visa_jobs, d.jobs);
  const trend = (() => {
    if (!prev || prev.jobs <= 0) return '';
    const p = Math.round(((d.jobs - prev.jobs) / prev.jobs) * 100);
    return Math.abs(p) < 3 ? ', about the same as the month before' : p > 0 ? `, up ${p}% on the month before` : `, down ${Math.abs(p)}% on the month before`;
  })();
  const top = d.countries[0];

  const title = `Visa Hiring Report — ${month}: ${n(d.jobs)} new jobs, ${visaShare}% mention sponsorship`;
  const excerpt = `${n(d.jobs)} jobs from ${n(d.companies)} companies went live on MadeVisa in ${month}${trend}. ${n(d.visa_jobs)} said they offer visa sponsorship${top ? `; ${top.name} led with ${n(top.jobs)} new roles` : ''}.`;

  const parts: string[] = [];
  parts.push(`<p>${esc(excerpt)} Every figure below comes from live company career pages tracked by MadeVisa, not from job-board reposts.</p>`);

  // Countries
  if (d.countries.length) {
    parts.push(`<h2>Where the jobs were</h2>`);
    parts.push(
      `<table><thead><tr><th>Country</th><th>New jobs</th><th>Mention sponsorship</th></tr></thead><tbody>${d.countries
        .map((c) => `<tr><td>${esc(c.name)}</td><td>${n(c.jobs)}</td><td>${n(c.visa_jobs)} (${pct(c.visa_jobs, c.jobs)}%)</td></tr>`)
        .join('')}</tbody></table>`
    );
    const best = [...d.countries].filter((c) => c.jobs >= 20).sort((a, b) => b.visa_jobs / b.jobs - a.visa_jobs / a.jobs)[0];
    if (best && best.visa_jobs > 0)
      parts.push(`<p>Among countries with at least 20 new jobs, <strong>${esc(best.name)}</strong> had the highest share of ads mentioning sponsorship: ${pct(best.visa_jobs, best.jobs)}%.</p>`);
  }

  // Companies offering sponsorship
  if (d.visa_companies.length) {
    parts.push(`<h2>Companies that advertised sponsorship most</h2>`);
    parts.push(`<ol>${d.visa_companies.map((c) => `<li><a href="${companyUrlPath(c)}">${esc(c.name)}</a> — ${n(c.visa_jobs)} jobs mentioning sponsorship</li>`).join('')}</ol>`);
  }

  // UK licensed sponsors
  if (d.uk.jobs >= 10 && d.uk.register_orgs > 0) {
    parts.push(`<h2>UK: jobs at licensed sponsors</h2>`);
    parts.push(
      `<p>Of ${n(d.uk.jobs)} new UK jobs, <strong>${n(d.uk.licensed_jobs)} (${pct(d.uk.licensed_jobs, d.uk.jobs)}%)</strong> came from companies on the Home Office register of licensed sponsors, which listed ${n(d.uk.register_orgs)} organisations${
        d.uk.checked ? ` when last checked on ${new Date(d.uk.checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
      }. A licence means the company <em>can</em> sponsor a visa — not that every role is sponsored. Names are matched exactly, so the true figure may be a little higher.</p>`
    );
  }

  // Visa Plans vs ordinary applications
  const p = d.plans;
  const a = d.applications;
  if (p.enough || a.enough) {
    parts.push(`<h2>Do employers reply?</h2>`);
    if (p.enough)
      parts.push(
        `<p>Candidates sent <strong>${n(p.created)} Visa Plans</strong> — one-page proposals showing an employer the visa route, its steps and who pays what. ${pct(p.opened, p.created)}% were opened by someone other than the candidate, and <strong>${pct(p.replied, p.created)}% got a reply</strong> so far${p.verified ? ` (${n(p.verified)} from a verified company email)` : ''}.</p>`
      );
    if (a.enough)
      parts.push(`<p>Across ${n(a.tracked)} ordinary applications tracked by MadeVisa users, ${pct(a.replied, a.tracked)}% got any reply — including rejections.</p>`);
    if (p.enough && a.enough && a.replied > 0) {
      const lift = Math.round((p.replied / p.created / (a.replied / a.tracked)) * 10) / 10;
      if (lift >= 1.1) parts.push(`<p>That makes a reply <strong>${lift}× as likely</strong> with a Visa Plan attached. Plans sent late in the month have had less time to get a reply, so this number tends to rise.</p>`);
    }
  }

  // Responsive companies (positive list only)
  if (d.responsive.length) {
    parts.push(`<h2>Companies that replied most</h2>`);
    parts.push(
      `<p>Based on applications tracked by MadeVisa users over the past three months (companies with at least 10 tracked applications from 5+ people):</p><ol>${d.responsive
        .map((c) => `<li><a href="${companyUrlPath(c)}">${esc(c.name)}</a> — replied to ${c.rate}% of ${n(c.tracked)} applications</li>`)
        .join('')}</ol>`
    );
  }

  parts.push(
    `<h2>How we count</h2><p>“New jobs” are roles that went live on MadeVisa during ${month}, taken from company career pages. “Mentions sponsorship” means the ad itself says visa sponsorship is available. Reply rates only appear once they rest on at least 30 items, and companies are only ever listed for doing well. Figures are rounded.</p>`
  );
  parts.push(`<p><a href="/cv-match">Check how well your CV matches a job, free</a> · <a href="/jobs">See today’s jobs</a></p>`);

  return { title, excerpt, html: parts.join('\n') };
}

/** First day of the previous month and of this month (UTC), as YYYY-MM-DD. */
export function lastMonth(now = new Date()): { from: string; to: string; key: string; prevFrom: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), key: iso(from).slice(0, 7), prevFrom: iso(prevFrom) };
}

export async function runMonthly(service: Service): Promise<void> {
  let ok = true;
  let summary = '';
  try {
    const { from, to, key, prevFrom } = lastMonth();
    const autoKey = `visa-report:${key}`;
    const { data: exists } = await service.from('articles').select('id').eq('auto_key', autoKey).maybeSingle();
    if (exists) {
      summary = `Visa Hiring Report for ${key} already exists`;
    } else {
      const { data, error } = await service.rpc('visa_hiring_monthly', { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      const d = data as MonthlyData;
      if (!d || d.jobs < MIN_JOBS) {
        summary = `Skipped ${key}: only ${d?.jobs ?? 0} new jobs (minimum ${MIN_JOBS})`;
      } else {
        const { data: prevRow } = await service.from('articles').select('data').eq('auto_key', `visa-report:${prevFrom.slice(0, 7)}`).maybeSingle();
        const built = buildMonthly(d, (prevRow?.data as MonthlyData) ?? null);
        const { error: insErr } = await service.from('articles').insert({
          slug: `visa-hiring-report-${slugify(monthName(from))}`,
          title: built.title,
          excerpt: built.excerpt,
          body_html: built.html,
          category: 'insights',
          tags: ['visa hiring report', 'visa sponsorship'],
          country_code: null,
          source: 'auto-report',
          auto_key: autoKey,
          data: d,
          status: 'published',
          publish_at: new Date().toISOString(),
          author_name: 'MadeVisa Insights',
        });
        if (insErr) throw new Error(insErr.message);
        summary = `Published the Visa Hiring Report for ${monthName(from)}: ${d.jobs} jobs`;
      }
    }
  } catch (e) {
    ok = false;
    summary = `Monthly report failed: ${e instanceof Error ? e.message : 'unknown error'}`;
  }
  await service.rpc('pipeline_finished', { p_kind: 'monthly', p_ok: ok, p_summary: summary, p_detail: null });
}
