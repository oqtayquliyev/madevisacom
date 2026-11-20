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
export function badges(j: { visa: string | null; remote: number; arrangement?: string | null }): string {
  const b: string[] = [];
  if (j.visa === 'offered') b.push('<span class="tag tag-visa" title="The ad says the company sponsors visas">VISA</span>');
  if (j.remote || j.arrangement === 'remote') b.push('<span class="tag tag-remote">REMOTE</span>');
  else if (j.arrangement === 'hybrid') b.push('<span class="tag">HYBRID</span>');
  return b.join('');
}

/** Winamp playlist of jobs. Server-rendered; the board script re-renders it with filters. */
export function playlist(rows: ListRow[], start = 0, now = Date.now()): string {
  if (!rows.length) return '<p class="pl-empty">No jobs here yet. The list refreshes every day.</p>';
  return `<ol class="playlist" start="${start + 1}">${rows
    .map(
      (j, i) => `<li><a href="${esc(jobPath(j))}"><span class="pl-n">${start + i + 1}.</span><span class="pl-t"><b>${esc(j.title)}</b> <span class="pl-c">— ${esc(j.company)}</span><span class="pl-p">${esc(placeOf(j))}</span></span><span class="pl-b">${badges(j)}</span><span class="pl-time">${esc(ago(j.posted_at, now))}</span></a></li>`
    )
    .join('')}</ol>`;
}

/** The LCD number display (Winamp time counter look). */
export const lcd = (value: string | number, label: string) =>
  `<div class="lcd-box"><div class="lcd-num">${typeof value === 'number' ? fmt(value) : esc(value)}</div><div class="lcd-label">${esc(label)}</div></div>`;

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
