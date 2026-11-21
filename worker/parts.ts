// Pieces several pages share: country names, the Winamp-style job "playlist", job facts.

import { allCountries } from '../fetcher/lib/countries';
import { visaGuides } from '../content/visa/index';
import { jobPath, slugify } from '../shared/jobs';
import { ago, esc, fmt, icon } from './html';
import type { ListRow } from './db';

export const countryName = new Map(allCountries.map((c) => [c.code, c.name]));
countryName.set('GB', 'United Kingdom');
countryName.set('US', 'United States');
export const countryBySlug = new Map(allCountries.map((c) => [slugify(c.name), c.code]));
countryBySlug.set('united-kingdom', 'GB');
countryBySlug.set('uk', 'GB');
countryBySlug.set('united-states', 'US');
countryBySlug.set('usa', 'US');
export const countrySlug = (code: string) => slugify(countryName.get(code) ?? code);
export const guideByCode = new Map(visaGuides.map((g) => [g.code, g]));

export function placeOf(j: { city: string | null; country: string | null; remote: number }): string {
  const c = j.country ? countryName.get(j.country) ?? j.country : '';
  const parts = [j.city && j.city !== c ? j.city : '', c].filter(Boolean);
  if (!parts.length) return j.remote ? 'Remote' : 'Several locations';
  return parts.join(', ') + (j.remote ? ' · remote' : '');
}

/** Badges after a job title. */
export const NEW_HOURS = 6;

export function badges(j: { visa: string | null; remote: number; arrangement?: string | null; posted_at?: string }, now = Date.now()): string {
  const b: string[] = [];
  if (j.posted_at && now - Date.parse(j.posted_at) < NEW_HOURS * 3600_000) b.push('<span class="tag tag-new" title="Posted in the last 6 hours">NEW</span>');
  if (j.visa === 'offered') b.push('<span class="tag tag-visa" title="The ad says the company sponsors visas">VISA</span>');
  if (j.remote || j.arrangement === 'remote') b.push('<span class="tag tag-remote">REMOTE</span>');
  else if (j.arrangement === 'hybrid') b.push('<span class="tag">HYBRID</span>');
  return b.join('');
}

/** Classic list of jobs: underlined blue title, then company · place · when. The board script renders the same markup. */
export function jobList(rows: ListRow[], start = 0, now = Date.now()): string {
  if (!rows.length) return '<p class="empty">No jobs here yet. The list refreshes every day.</p>';
  return `<ol class="joblist" start="${start + 1}" style="counter-reset: job ${start}">${rows
    .map(
      (j) => `<li><a class="jl-t" href="${esc(jobPath(j))}">${esc(j.title)}</a>${badges(j, now)}<br><span class="jl-m"><b>${esc(j.company)}</b> · ${esc(placeOf(j))} · ${esc(ago(j.posted_at, now))}</span></li>`
    )
    .join('')}</ol>`;
}

export function countryOptions(byCountry: [string, number, number][], selected = ''): string {
  return [
    '<option value="">All countries</option>',
    ...byCountry
      .filter(([c]) => countryName.has(c))
      .sort((a, b) => countryName.get(a[0])!.localeCompare(countryName.get(b[0])!))
      .map(([c, n]) => `<option value="${c}"${c === selected ? ' selected' : ''}>${esc(countryName.get(c))} (${fmt(n)})</option>`),
  ].join('');
}

export const visaWord = (v: string | null) =>
  v === 'offered'
    ? `${icon('ok')} <span><b>Offered</b> — the ad says the company sponsors or supports visas.</span>`
    : v === 'not_offered'
      ? `${icon('error')} <span><b>Not offered</b> — the ad asks for an existing right to work.</span>`
      : `${icon('help')} <span><b>Not stated</b> — the ad doesn’t say. Ask the company before applying.</span>`;

/**
 * The highlighted "new in the last 24 hours" box (the site shows this instead of a total).
 * The rising-bars arrow is a decorative icon, not a chart of real numbers.
 */
export function newToday(n: number, label = 'new jobs in the last 24 hours'): string {
  return `<div class="new24"><svg class="new24-ico" viewBox="0 0 48 40" width="58" height="48" aria-hidden="true" shape-rendering="crispEdges">
<rect x="2" y="30" width="7" height="8" fill="#7fd36f"/><rect x="12" y="24" width="7" height="14" fill="#5cc24a"/><rect x="22" y="17" width="7" height="21" fill="#3faa2e"/><rect x="32" y="10" width="7" height="28" fill="#2b8a24"/>
<path d="M3 26 L15 19 L25 12 L37 5" stroke="#e00000" stroke-width="3" fill="none" shape-rendering="geometricPrecision"/><path d="M33 2 L44 2 L41 12 Z" fill="#e00000" shape-rendering="geometricPrecision"/></svg>
<div><b class="new24-n">+${fmt(n)}</b><span class="new24-l">${esc(label)}</span></div></div>`;
}
