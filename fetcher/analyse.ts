// Turns a job from a feed into a database row: cleaned description, visa / remote / salary /
// experience facts and the country. The detector, cleaner and place resolver are the same
// files the old site used (copied into fetcher/lib), so results match what users are used to.

import { detectJobFacts, cleanJobDescriptionHtml, stripPageChrome, isPlaceholderValue, splitSourceLocation } from './lib/detector.ts';
import { sanitizeJobHtml } from './lib/sanitize.ts';
import { createPlaceResolver } from './lib/placeResolver.ts';
import { allCountries } from './lib/countries.ts';
import type { SourceJob } from './sources.ts';
import { countryFromCity } from './cities.ts';

const MAX_IN = 100_000;
const MAX_OUT = 45_000; // one SQL statement may be at most 100 KB

const resolvePlace = createPlaceResolver(allCountries);

const JUNK_TITLE_RE = /^\s*(just a moment\.*|access denied|attention required.*|page not found|not found|40[134]\b.*|error|forbidden|security check|captcha|javascript is disabled)\s*$/i;
const JUNK_TEXT_RE = /javascript\s+is\s+disabled|enable\s+javascript|not\s+a\s+robot|checking\s+your\s+browser|verify\s+you\s+are\s+human|access\s+denied/i;

export function plainText(html: string | null | undefined): string {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function isJunk(j: SourceJob): boolean {
  if (JUNK_TITLE_RE.test(j.title)) return true;
  const t = plainText(j.descriptionHtml);
  return t.length > 0 && t.length < 600 && JUNK_TEXT_RE.test(t);
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^gh_src$|^source$/i.test(k)) u.searchParams.delete(k);
    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return raw.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/** Where most of a company's jobs clearly are — a hint for its unclear ones ("Austin, TX"). */
export function companyCountryOf(jobs: Pick<SourceJob, 'offices' | 'locationText'>[]): string | null {
  const n = new Map<string, number>();
  let total = 0;
  for (const j of jobs) {
    for (const raw of j.offices?.length ? j.offices : [j.locationText]) {
      if (!raw) continue;
      const d = resolvePlace.detail(raw);
      if (!d.country || d.guessed) continue;
      total++;
      n.set(d.country.code, (n.get(d.country.code) ?? 0) + 1);
    }
  }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 && top[1] / total >= 0.6 ? top[0] : null;
}

function countryOf(j: SourceJob, prefer: string | null): string | null {
  const texts = j.offices?.length ? j.offices : j.locationText ? [j.locationText] : [];
  const found = new Set<string>();
  for (const t of texts) {
    const hit = resolvePlace(t, prefer ? { prefer } : undefined)?.code ?? countryFromCity(t);
    if (hit) found.add(hit);
  }
  return found.size === 1 ? [...found][0] : null;
}

const meaningful = (t: string | null | undefined) => {
  const v = (t ?? '').trim();
  return Boolean(v) && !/^(n\/?a|none|null|undefined|tbd|-+|—|\[object Object\])$/i.test(v) && /[1-9]/.test(v);
};

function employmentOf(raw: string | null | undefined, detected: string | null): string | null {
  const s = `${raw ?? ''}`.toLowerCase();
  if (s.includes('intern')) return 'Internship';
  if (s.includes('apprentice')) return 'Apprenticeship';
  if (s.includes('contract') || s.includes('freelance') || s.includes('temp')) return 'Contract / Freelance';
  if (s.includes('part')) return 'Part time';
  if (s.includes('full') || s.includes('permanent')) return 'Full time';
  return detected;
}

export type Row = {
  title: string;
  company: string;
  country: string | null;
  city: string | null;
  location: string | null;
  remote: number;
  arrangement: string | null;
  visa: string | null;
  employment: string | null;
  experience: string | null;
  salary: string | null;
  department: string | null;
  url: string;
  description: string;
};

export function analyse(j: SourceJob, companyCountry: string | null): Row {
  const raw = j.descriptionHtml.length > MAX_IN ? j.descriptionHtml.slice(0, MAX_IN) : j.descriptionHtml;
  let html = '';
  let facts: ReturnType<typeof detectJobFacts>;
  try {
    const base = raw ? stripPageChrome(sanitizeJobHtml(raw), j.title) : '';
    facts = detectJobFacts(base || raw, j.title);
    html = base ? cleanJobDescriptionHtml(base, j.title).html : '';
  } catch {
    facts = detectJobFacts(null, j.title);
    html = '';
  }
  if (html.length > MAX_OUT) html = html.slice(0, MAX_OUT).replace(/<[^>]*$/, '') + '<p>… (the full text is on the company’s page)</p>';

  const src = splitSourceLocation(facts.location);
  const country = countryOf(j, companyCountry) ?? src?.countryCode ?? null;
  const listedCity = (j.offices?.[0] ?? j.locationText)?.split(',')[0]?.trim() || null;
  const city = listedCity && !isPlaceholderValue(listedCity) && !/remote|anywhere|worldwide/i.test(listedCity) ? listedCity : src?.city ?? null;
  const arrangement = j.workArrangement ?? facts.workArrangement ?? null;
  const salary = [j.salaryText, facts.compensation].find(meaningful) ?? null;
  const visa = j.visaFlag ? 'offered' : facts.visa ?? null;
  const location = [...new Set((j.offices?.length ? j.offices : [j.locationText]).filter(Boolean))].slice(0, 6).join(' · ') || null;

  return {
    title: j.title.replace(/\s+/g, ' ').trim().slice(0, 200),
    company: j.company.replace(/\s+/g, ' ').trim().slice(0, 120),
    country,
    city: city ? city.slice(0, 80) : null,
    location: location ? location.slice(0, 300) : null,
    remote: j.remote === true || arrangement === 'remote' ? 1 : 0,
    arrangement,
    visa,
    employment: employmentOf(j.employmentTypeRaw, facts.employmentType),
    experience: facts.experience ?? null,
    salary: salary ? salary.slice(0, 120) : null,
    department: (j.department ?? facts.department ?? null)?.slice(0, 80) ?? null,
    url: j.url,
    description: html,
  };
}
