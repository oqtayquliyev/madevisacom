// One builder per content format (programCatalog.ts). A builder takes live
// site data, picks a topic that hasn't been used lately, and returns the
// caption, the images and the links — or null when there is nothing worth
// posting (too little data, every topic used recently).
//
// Honesty rules, the same ones the site follows:
//  - Every number comes from the database or the visa guides at the moment
//    the post is written. Nothing is rounded up, nothing is invented.
//  - Visa facts carry their official source and the date they were checked.
//  - "Feedback" posts use aggregated outcomes only (never a person, never a
//    quote), and companies appear only with 3+ different people behind them.
//  - No made-up testimonials, no made-up news: news posts exist only for
//    items added in the News desk, with their source.

import type { Platform, ProgramSettings, ReelScene } from './programCatalog.ts';
import { hash } from './programSchedule.ts';
import { SITE, The, adsSay, chance, clickable, closer, dayLabel, firstSentence, flag, go, host, list, lowerFirst, mark, monthLabel, nf, noDot, pick, plural, shortName, tags, the, write } from './programVoice.ts';
// social.ts imports program.ts, which imports this file: a cycle, but these are only called at run time.
import { cleanTitle, imageUrl, isRemote, jobLink, place, type Job } from './social.ts';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type Snapshot = {
  live_jobs: number;
  companies: number;
  countries: number;
  new_7d: number;
  new_24h: number;
  visa_share: number;
  salary_share: number;
  work: { remote: number; hybrid: number; onsite: number; known: number };
  by_country: { iso: string; name: string; jobs: number; new_7d: number; visa: number; remote: number; companies: number }[];
  top_companies_7d: { id: string; name: string; logo: string | null; live: number; new_7d: number }[];
  functions: { name: string; jobs: number }[];
};
export type CountryReport = {
  iso: string;
  name: string;
  live_jobs: number;
  new_7d: number;
  companies: number;
  visa_share: number;
  visa_jobs: number;
  companies_top: { id: string; name: string; live: number; new_7d: number; visa: number }[];
  functions: { name: string; jobs: number }[];
  cities: { name: string; jobs: number }[];
};
export type LibRoute = {
  id: string;
  name: string;
  kind: 'work' | 'talent' | 'job-search' | 'remote' | 'business' | 'study' | 'residence';
  summary: string;
  validity: string;
  fee: string | null;
  leadsToPR: boolean;
  requires: string[];
  note: string | null;
  url: string;
  employer: { licenceNeeded: boolean; licenceNote: string | null; steps: { text: string; effort: string | null; optional: boolean }[]; timeline: string; candidateMayCover: string[]; employerCosts: string | null } | null;
};
export type LibCountry = {
  code: string;
  name: string;
  slug: string;
  blurb: string;
  languages: string;
  prYears: number | null;
  prNote: string;
  citizenshipYears: number | null;
  citizenshipNote: string;
  dual: 'yes' | 'limited' | 'no';
  reviewed: string;
  documents: string[];
  routes: LibRoute[];
};
export type Library = {
  countries: LibCountry[];
  thresholds: { code: string; currency: 'GBP' | 'EUR'; route: string; standard: { annual: number; who: string }; lower: { annual: number; who: string }[]; caveat: string; source: { label: string; url: string }; checkedOn: string }[];
  documents: string[];
};
export type Feedback = {
  total: number;
  people: number;
  companies: number;
  no_response: number;
  rejected: number;
  responded: number;
  interview: number;
  offer: number;
  avg_reply_days: number | null;
  most_responsive: { id: string; name: string; n: number; pct: number; avg_reply_days: number | null }[];
};
export type NewsItem = { id: string; headline: string; summary: string | null; points: string[]; country_code: string | null; source_name: string | null; source_url: string; link_path: string | null; kicker: string | null };
export type ArticleRow = { id: string; slug: string; title: string; excerpt: string; category: string; country_code: string | null; publish_at: string };
export type ProgramRow = { id: string; title: string; description: string | null; category: string; funding_text: string | null; official_url: string | null; applications_close_at: string | null; publisher: string | null; country: string | null; iso: string | null };

/** Everything a builder may read — each loaded once per run, on first use. */
export type Data = {
  snapshot(): Promise<Snapshot | null>;
  report(iso: string): Promise<CountryReport | null>;
  library(): Promise<Library | null>;
  feedback(): Promise<Feedback | null>;
  network(): Promise<{ people: number; hiring: number; recruiters: number; hiring_managers: number } | null>;
  articles(): Promise<ArticleRow[]>;
  programs(): Promise<ProgramRow[]>;
  news(): Promise<NewsItem[]>;
  /** Recruiter emails written in these jobs' ads (job id → first one found). */
  contacts(jobIds: string[]): Promise<Map<string, { email: string; name: string | null }>>;
};

export type SizeKey = 'portrait' | 'square' | 'story';

export type Ctx = {
  p: Platform;
  size: SizeKey;
  /** Picks the topic. */
  seed: number;
  /** Picks the wording — re-rolled when a caption opens like a recent one. */
  w: number;
  now: Date;
  settings: ProgramSettings;
  data: Data;
  /** Hours since this topic was last used on this network (Infinity = never). */
  age(topic: string): number;
  /** Used on any network in the last 20 hours. */
  hot(topic: string): boolean;
  /** "@madevisa" on this network, or "" when not set. */
  handle: string;
  /** A topic asked for by name in the admin panel (a News desk item's id). */
  want?: string | null;
  /** A photo for a country, when one was added in the admin panel. */
  photo(code: string | null | undefined): { url: string; credit: string | null } | null;
  /** Fresh jobs not yet posted on this network (reserved when the post is queued). */
  jobs(o: { kind: 'fresh' | 'student' | 'sponsor' | 'visa' | 'remote' | 'offer'; countries?: string[]; salaryOnly?: boolean; want: number; min: number; newCompanies?: boolean }): Promise<Job[]>;
};

export type Draft = {
  /** What it is about, e.g. "DE" or "de-blue-card" — used so a topic doesn't come back too soon. */
  topic: string;
  /** Short description for the admin panel and image alt text. */
  headline: string;
  /** How the images are laid out: image | carousel | list | cards | company. */
  format: string;
  images: string[];
  caption: string;
  links: { title: string; url: string; job_id?: string; company?: string }[];
  jobs?: Job[];
  meta?: Record<string, unknown>;
  /** A Reel instead of images: what to look for as background, and the screens. */
  reel?: { bg: { queries: string[]; cc: string | null; /** White background, no footage (fast job reels). */ plain?: boolean }; scenes: ReelScene[] };
};
export type Builder = (c: Ctx) => Promise<Draft | null>;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const IMAGE_V = '1'; // bump when a template in api/_post.ts changes, so new posts get fresh images

/** URL of an image drawn by /api/og/post. Every text is a parameter, so the admin panel can edit it. */
function og(c: Ctx, t: string, q: Record<string, string | null | undefined | false>): string {
  const sp = new URLSearchParams({ t, size: c.size });
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, String(v));
  sp.set('v', IMAGE_V);
  return `${SITE}/api/og/post?${sp.toString()}`;
}
const cell = (v: unknown) => String(v ?? '').replace(/[|~]/g, ' ').replace(/\s+/g, ' ').trim();
const rows = (r: unknown[][]) => r.map((x) => x.map(cell).join('|')).join('~');
/** Carousel position, "2/3". A single image has none. */
const pos = (i: number, n: number) => (n > 1 ? `${i}/${n}` : '');
/** Telegram gets one image; the feed networks get the carousel. */
const slides = (c: Ctx, n: number) => (c.p === 'telegram' ? 1 : n);
const bare = (path: string) => `madevisa.com${path.split('?')[0]}`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
/** Weekly posts (rankings, the recap) are about "this week" — one per network per week. */
const weekKey = (c: Ctx) => `w${Math.floor((c.now.getTime() + 3 * 86_400_000) / (7 * 86_400_000))}`;
/** Legal thresholds are shown exactly: €45,934.20, never rounded. */
const money = (n: number, cur: 'GBP' | 'EUR') => `${cur === 'GBP' ? '£' : '€'}${n % 1 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : nf(n)}`;
/** The guides use straight quotes; captions and images use typographic ones. */
const typo = (s: string) => s.replace(/(\w)'(\w)/g, '$1’$2').replace(/s' /g, 's’ ').replace(/"([^"]+)"/g, '“$1”');
/** A hashtag-sized company name: "Octopus Energy" → octopusenergy; too short or too long → none. */
const companyTag = (name: string) => {
  const t = name.replace(/\b(the|group|inc|ltd|limited|plc|llc|gmbh|ag|sa|se|corp|corporation|company|co|holding|holdings|international)\b/gi, ' ').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
  return t.length >= 3 && t.length <= 20 ? t : '';
};
const link = (c: Ctx, title: string, path: string) => ({ title, url: `${SITE}${path}${path.includes('?') ? '&' : '?'}s=${{ facebook: 'fb', instagram: 'ig', linkedin: 'li', tiktok: 'tt', telegram: 'tg' }[c.p]}` });

/**
 * A topic that hasn't been used lately: never-used ones first (focus
 * countries ahead), otherwise the one that has rested longest.
 */
function choose<T>(c: Ctx, kind: string, cands: T[], key: (t: T) => string, minHours: number): T | null {
  const k = (x: T) => `${kind}:${key(x)}`;
  const ok = cands.filter((x) => !c.hot(k(x)) && c.age(k(x)) >= minHours);
  if (!ok.length) return null;
  const never = ok.filter((x) => c.age(k(x)) === Infinity);
  if (never.length) return never[hash(`${c.seed}:${kind}`) % Math.min(never.length, 3)];
  return [...ok].sort((a, b) => c.age(k(b)) - c.age(k(a)))[0];
}
const focusFirst = <T,>(c: Ctx, items: T[], code: (t: T) => string) => {
  const f = new Set((c.settings.focus ?? []).map((x) => x.toUpperCase()));
  return f.size ? [...items.filter((x) => f.has(code(x).toUpperCase())), ...items.filter((x) => !f.has(code(x).toUpperCase()))] : items;
};

const REQ: Record<string, string> = {
  'job-offer': 'a job offer',
  degree: 'a degree',
  experience: '3+ years of experience',
  'remote-income': 'income from remote work',
  funds: 'savings to support yourself',
  admission: 'a university place',
  business: 'a business plan',
  'salary-threshold': 'a salary above the threshold',
  points: 'enough points on the points test',
  endorsement: 'an endorsement',
  'recent-graduate': 'a recent degree from an eligible university',
  'employer-transfer': 'a transfer inside your company',
};
const REQ_SHORT: Record<string, string> = {
  'job-offer': 'Job offer',
  degree: 'Degree',
  experience: '3+ years’ experience',
  'remote-income': 'Remote income',
  funds: 'Savings',
  admission: 'University place',
  business: 'Business plan',
  'salary-threshold': 'Salary above the threshold',
  points: 'Points test',
  endorsement: 'Endorsement',
  'recent-graduate': 'Recent degree',
  'employer-transfer': 'Company transfer',
};
const COVER: Record<string, string> = {
  'visa-fee': 'your own visa application fee',
  relocation: 'flights and moving costs',
  translations: 'translations and certified copies',
  recognition: 'recognition of your qualifications',
  'own-adviser': 'your own immigration adviser',
};
const sourceLine = (url: string, reviewed?: string) => `Source: ${host(url)}${reviewed ? ` · checked ${monthLabel(reviewed)}` : ''}`;
const countryTag = (name: string) => (name === 'United Kingdom' ? 'uk' : name === 'United States' ? 'usa' : name === 'United Arab Emirates' ? 'uae' : name);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

function jobBlocks(c: Ctx, jobs: Job[]): string[] {
  return jobs.map((j, i) => {
    const where = place(j);
    const mode = j.work_arrangement === 'hybrid' ? 'hybrid' : isRemote(j) && where !== 'Remote' ? 'remote' : null;
    const facts = [where ? `${flag(j.iso)} ${where}`.trim() : null, j.salary, mode, j.visa ? 'visa sponsorship in the ad' : null, j.student ? 'student / graduate role' : null].filter(Boolean);
    const url = clickable(c.p) ? jobLink(j, c.p) : `madevisa.com/j/${j.id.slice(0, 8)}`;
    return `${jobs.length > 1 ? `${i + 1}. ` : ''}${cleanTitle(j.title)} · ${j.company}\n${facts.join(' · ')}\n${url}`;
  });
}

function jobTags(c: Ctx, jobs: Job[], extra: string[]): string {
  const countries = [...new Set(jobs.map((j) => j.country).filter(Boolean) as string[])].slice(0, 2).map((n) => `${countryTag(n)}jobs`);
  const cities = [...new Set(jobs.map((j) => j.city).filter(Boolean) as string[])].slice(0, 1);
  const companies = jobs.slice(0, 2).map((j) => companyTag(j.company));
  return tags(c.p, [...extra, ...countries, 'hiring', ...companies, ...cities, 'jobs', 'workabroad']);
}

const DATE = (c: Ctx) => `Fresh · ${dayLabel(c.now, c.settings.timezone || 'UTC')}`;

type JobSpec = {
  kind: 'fresh' | 'student' | 'sponsor' | 'visa' | 'remote' | 'offer';
  layout: 'list' | 'cards' | 'company';
  countries?: string[];
  salaryOnly?: boolean;
  min: number;
  /** Text on the image (list headline / cards pill). */
  label: (n: number) => string;
  hooks: (n: number, jobs: Job[]) => string[];
  /** A line under the jobs, before the link. */
  after: string[];
  lead: string[];
  path: string;
  tags: string[];
  topic?: string;
};

async function jobsPost(c: Ctx, s: JobSpec): Promise<Draft | null> {
  const want = s.layout === 'company' ? 1 : s.layout === 'cards' ? (c.size === 'square' ? 3 : c.size === 'story' ? 5 : 4) : c.size === 'square' ? 3 : 4;
  const jobs = await c.jobs({ kind: s.kind, countries: s.countries, salaryOnly: s.salaryOnly, want, min: Math.min(s.min, want) });
  if (!jobs.length) return null;
  const n = jobs.length;
  const label = s.label(n);
  const images =
    s.layout === 'company'
      ? jobs.map((j) => imageUrl('company', c.size, [j], '', DATE(c), c.p))
      : [imageUrl(s.layout, c.size, jobs, label, DATE(c), c.p)];
  const caption = write(c.p, [
    pick(s.hooks(n, jobs), c.w, 'hook'),
    ...jobBlocks(c, jobs),
    pick(s.after, c.w, 'after'),
    go(c.p, c.w, s.lead, s.path),
    jobTags(c, jobs, s.tags),
  ]);
  return {
    topic: s.topic ?? jobs.map((j) => j.id.slice(0, 8)).join(','),
    headline: label,
    format: s.layout,
    images,
    caption,
    links: jobs.map((j) => ({ job_id: j.id, title: cleanTitle(j.title), company: j.company, url: jobLink(j, c.p) })),
    jobs,
  };
}

const two = (jobs: Job[]) => list(jobs.slice(0, 2).map((j) => j.company));

const jobs_fresh: Builder = (c) =>
  jobsPost(c, {
    kind: 'fresh',
    layout: chance(0.5, c.seed, 'layout') ? 'cards' : 'list',
    min: 3,
    label: (n) => pick([`${n} new jobs`, 'New today', 'Just posted', 'Opened in the last 24 hours'], c.seed, 'label'),
    hooks: (n, jobs) => [
      `${n} roles that opened in the last 24 hours.`,
      `New this morning from ${two(jobs)}${n > 2 ? ' and others' : ''}.`,
      `Today’s shortlist. ${n} roles, one per company, all posted in the last day.`,
      `${mark(c.p, c.w, '🗓️')}Posted today. Not “reposted today” — the employer published these in the last 24 hours.`,
      `If you check one list of jobs today, make it this one.`,
      `${n} openings we picked from this morning’s new roles.`,
    ],
    after: [
      'Each link goes to the job page, and from there to the employer’s own careers site.',
      'Every date you see on MadeVisa is the day the employer posted the job.',
      'Applying in the first days puts you in front of the recruiter before the pile grows.',
    ],
    lead: ['Everything that opened today:', 'More of today’s roles:', 'The full list, newest first:'],
    path: `/jobs?posted=${encodeURIComponent('Past 24 hours')}`,
    tags: [],
  });

const jobs_country: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const cands = focusFirst(c, (snap?.by_country ?? []).filter((x) => x.new_7d >= 15 && x.iso), (x) => x.iso).slice(0, 12);
  // Try a few countries: the first with enough fresh roles wins.
  const tried = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const co = choose(c, 'jobs_country', cands.filter((x) => !tried.has(x.iso)), (x) => x.iso, 60);
    if (!co) return null;
    tried.add(co.iso);
    const name = shortName(co.name);
    const d = await jobsPost(c, {
      kind: 'fresh',
      layout: 'cards',
      countries: [co.iso],
      min: 3,
      topic: co.iso,
      label: () => `Hiring in ${name}`,
      hooks: (n) => [
        `${flag(co.iso)} ${The(co.name)}, today: ${n} new ${plural(n, 'role', 'roles')} worth a look.`,
        `${flag(co.iso)} Looking at ${name}? These ${n} opened in the last day.`,
        `${flag(co.iso)} ${nf(co.new_7d)} new roles in ${name} this week. Here are ${n} from today.`,
        `${flag(co.iso)} New in ${name} this morning.`,
      ],
      after: [`${nf(co.jobs)} roles are open in ${name} right now, from ${nf(co.companies)} companies.`, `There are ${nf(co.jobs)} open roles in ${name} on MadeVisa today.`],
      lead: [`All roles in ${name}, and the visa routes:`, `Every open role in ${name}:`],
      path: `/jobs?country=${encodeURIComponent(co.name)}`,
      tags: [`${countryTag(co.name)}jobs`, `workin${countryTag(co.name)}`],
    });
    if (d) return d;
  }
  return null;
};

const jobs_visa: Builder = (c) =>
  jobsPost(c, {
    kind: 'visa',
    layout: 'list',
    min: 2,
    label: (n) => pick([`${n} roles offering visa sponsorship`, 'Sponsorship stated in the ad', 'Visa sponsorship available'], c.seed, 'label'),
    hooks: (n, jobs) => [
      `These ads say it in writing: visa sponsorship available.`,
      `${n} ${plural(n, 'role', 'roles')} where the company mentions sponsorship in the ad itself.`,
      `${mark(c.p, c.w, '🛂')}Sponsorship offered at ${two(jobs)}${n > 2 ? ` and ${n - 2} more` : ''}.`,
      `No guessing with these. The ad states that the employer sponsors visas.`,
      `Filtered for one thing: the words “visa sponsorship” in the job ad.`,
    ],
    after: [
      'Most ads don’t mention visas either way. These do, which is why we post them separately.',
      'We only tag a role when the ad itself says so. What an ad doesn’t say shows as “not mentioned”.',
    ],
    lead: ['Every open role that states sponsorship:', 'All roles with sponsorship in the ad:'],
    path: '/jobs?visa=1',
    tags: ['visasponsorship', 'sponsoredjobs'],
  });

const jobs_remote: Builder = (c) =>
  jobsPost(c, {
    kind: 'remote',
    layout: 'cards',
    min: 3,
    label: () => pick(['Remote & hybrid', 'Remote-friendly roles', 'Work from anywhere'], c.seed, 'label'),
    hooks: (n, jobs) => [
      `Work for a company abroad before you move there. ${n} remote-friendly roles from this week.`,
      `${mark(c.p, c.w, '🌍')}Remote and hybrid roles, posted in the last few days.`,
      `${n} roles you can do from where you are now.`,
      `Remote first, relocation later. That’s how a lot of moves actually start.`,
      `From ${two(jobs)}${n > 2 ? ' and others' : ''}: roles that don’t need you in the office every day.`,
    ],
    after: ['Check each ad for where you need to be based: “remote” often means remote within one country.', 'A remote contract is also a way to show an employer your work before asking about a visa.'],
    lead: ['All remote roles:', 'Every remote and hybrid role:'],
    path: '/jobs?remote=1',
    tags: ['remotejobs', 'remotework', 'hybridwork'],
  });

const jobs_student: Builder = (c) =>
  jobsPost(c, {
    kind: 'student',
    layout: 'list',
    min: 2,
    label: (n) => pick([`${n} roles for students and graduates`, 'Internships and first jobs', 'For students and graduates'], c.seed, 'label'),
    hooks: (n) => [
      `First job or internship? ${n === 1 ? 'This one' : `These ${n}`} opened today.`,
      `${mark(c.p, c.w, '🎓')}For students and recent graduates: ${n} new ${plural(n, 'role', 'roles')}.`,
      `Internships, graduate programmes and junior roles from the last 24 hours.`,
      `No “5 years of experience required” in this list.`,
    ],
    after: ['Graduate and internship roles fill fast, usually in the first week.', 'Several countries also have a visa for recent graduates. The country pages list them.'],
    lead: ['All student and graduate roles:', 'More internships and first jobs:'],
    path: '/jobs?students=1',
    tags: ['internships', 'graduatejobs', 'studentjobs'],
  });

const jobs_uk_sponsors: Builder = (c) =>
  jobsPost(c, {
    kind: 'sponsor',
    layout: 'list',
    countries: ['GB'],
    min: 2,
    label: () => pick(['Licensed to sponsor, and hiring', 'UK employers with a sponsor licence', 'Already licensed to sponsor'], c.seed, 'label'),
    hooks: (n, jobs) => [
      `🇬🇧 Hiring in the UK, and already licensed to sponsor.`,
      `🇬🇧 ${two(jobs)} ${jobs.length === 1 ? 'is' : 'are'} on the Home Office register of licensed sponsors. ${jobs.length === 1 ? 'It is' : 'Both are'} hiring.`,
      `🇬🇧 Want a Skilled Worker visa? Start with employers who already hold the licence.`,
      `🇬🇧 ${n} UK ${plural(n, 'role', 'roles')} at companies that can sponsor today, checked against the official register.`,
    ],
    after: [
      'A licence means the company can sponsor. Whether it will for this role is still a question to ask, and a Visa Plan asks it well.',
      'We check company names against the Home Office register every day. A licence doesn’t promise sponsorship for every role.',
    ],
    lead: ['UK roles, with the sponsor check on each job page:', 'All UK roles:'],
    path: `/jobs?country=${encodeURIComponent('United Kingdom')}`,
    tags: ['ukjobs', 'skilledworkervisa', 'ukvisa', 'sponsorlicence'],
  });

const jobs_salary: Builder = (c) =>
  jobsPost(c, {
    kind: 'fresh',
    layout: 'cards',
    salaryOnly: true,
    min: 3,
    label: () => pick(['Salary in the ad', 'Pay shown up front', 'With the salary'], c.seed, 'label'),
    hooks: (n) => [
      `Roles that tell you the salary before you apply.`,
      `${n} new roles, and every one of them shows the pay.`,
      `${mark(c.p, c.w, '💶')}No “competitive salary” here. Actual numbers.`,
      `We filtered today’s new jobs down to the ones that state the salary.`,
    ],
    after: [
      'For the UK, Germany and the Netherlands, the job page also shows whether the pay clears the visa salary minimum.',
      'A stated salary is also how you check a visa threshold before you apply. The job page does that for you in three countries.',
    ],
    lead: ['All roles with a salary:', 'Every role that shows its pay:'],
    path: '/jobs?salary=1',
    tags: ['salarytransparency', 'paytransparency'],
  });

const job_spotlight: Builder = async (c) => {
  const jobs = await c.jobs({ kind: 'fresh', want: 1, min: 1, salaryOnly: chance(0.6, c.seed, 'sal') });
  const j = jobs[0];
  if (!j) return null;
  const where = place(j);
  const facts = [where ? `${flag(j.iso)} ${where}`.trim() : null, j.salary ? `Pay: ${j.salary}` : null, j.work_arrangement === 'hybrid' ? 'Hybrid' : isRemote(j) ? 'Remote' : null, j.visa ? 'The ad says visa sponsorship is available' : null].filter(Boolean) as string[];
  const title = cleanTitle(j.title);
  const caption = write(c.p, [
    pick(
      [
        `One role today: ${title} at ${j.company}.`,
        `${j.company} is hiring a ${title}.`,
        `Role of the day. ${title}, ${j.company}.`,
        `${j.company} posted this in the last 24 hours: ${title}.`,
      ],
      c.w,
      'hook'
    ),
    facts.join('\n'),
    j.visa
      ? 'Sponsorship is stated in the ad, so the visa conversation is already open.'
      : pick(['The ad doesn’t mention visas. That isn’t a no: attach a Visa Plan and make it an easy yes.', 'No visa line in the ad. If you’d need sponsorship, a one-page Visa Plan answers the employer’s questions before they ask.'], c.w, 'plan'),
    `${pick(['The role:', 'Read it and apply:', 'Details:'], c.w, 'lead')} ${clickable(c.p) ? jobLink(j, c.p) : `madevisa.com/j/${j.id.slice(0, 8)}${c.p === 'instagram' ? '. Link in bio.' : ''}`}`,
    jobTags(c, [j], [j.job_function ?? '']),
  ]);
  return { topic: j.id.slice(0, 8), headline: `${title} — ${j.company}`, format: 'company', images: [imageUrl('company', c.size, [j], '', DATE(c), c.p)], caption, links: [{ job_id: j.id, title, company: j.company, url: jobLink(j, c.p) }], jobs: [j] };
};

const jobs_plan: Builder = async (c) => {
  const jobs = await c.jobs({ kind: 'offer', want: c.p === 'telegram' ? 1 : 2, min: 1 });
  if (!jobs.length) return null;
  const co = jobs[0].company;
  const caption = write(c.p, [
    pick(
      [
        `The ad for ${co} doesn’t mention a visa. That isn’t a no. It’s a question nobody has asked yet.`,
        `Most companies never say no to sponsorship. They just never think about it.`,
        `You found the job at ${co}. Now remove the one reason they might skip you.`,
        `“Do you sponsor visas?” gets ignored. A one-page plan with the route and the costs gets read.`,
        `Employers skip candidates from abroad because they guess a visa is slow and expensive. Show them it isn’t.`,
      ],
      c.w,
      'hook'
    ),
    ...jobBlocks(c, jobs),
    pick(
      [
        'A Visa Plan is one page you attach to your application: the visa route for that country, the employer’s steps, and which costs you’ll cover.',
        'How it works: pick the job, choose which visa costs you’d share, attach the PDF. The employer sees the route, their steps and the real cost.',
        'Think of it as a cover letter for the visa. It takes about two minutes from a job you already found.',
      ],
      c.w,
      'explain'
    ),
    go(c.p, c.w, ['See how a Visa Plan works:', 'How it works:', 'It comes with MadeVisa Pro:'], '/offers'),
    jobTags(c, jobs, ['visasponsorship', 'visaplan']),
  ]);
  return {
    topic: jobs.map((j) => j.id.slice(0, 8)).join(','),
    headline: 'No visa line in the ad',
    format: 'company',
    images: jobs.map((j) => imageUrl('company', c.size, [j], '', DATE(c), c.p)),
    caption,
    links: jobs.map((j) => ({ job_id: j.id, title: cleanTitle(j.title), company: j.company, url: jobLink(j, c.p) })),
    jobs,
  };
};

// ---------------------------------------------------------------------------
// Who is hiring
// ---------------------------------------------------------------------------

const country_hiring: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const cands = focusFirst(c, (snap?.by_country ?? []).filter((x) => x.jobs >= 40 && x.iso), (x) => x.iso).slice(0, 15);
  const co = choose(c, 'country_hiring', cands, (x) => x.iso, 24 * 6);
  if (!co) return null;
  const r = await c.data.report(co.iso);
  const lib = await c.data.library();
  const guide = lib?.countries.find((g) => g.code === co.iso) ?? null;
  const live = r?.live_jobs || co.jobs;
  const new7 = r?.new_7d ?? co.new_7d;
  const companies = r?.companies ?? co.companies;
  const visaPct = r ? Math.round(r.visa_share) : pct(co.visa, co.jobs);
  const name = the(co.name);
  const path = guide ? `/destinations/${guide.slug}` : `/jobs?country=${encodeURIComponent(co.name)}`;
  const photo = c.photo(co.iso);
  const cities = (r?.cities ?? []).filter((x) => x.name && x.name !== 'Remote').slice(0, 5);
  const funcs = (r?.functions ?? []).slice(0, 5);
  const top = (r?.companies_top ?? []).filter((x) => x.new_7d > 0).slice(0, 5);

  const parts: string[] = [];
  const total = slides(c, 1 + (funcs.length >= 3 ? 1 : 0) + (top.length >= 3 ? 1 : 0));
  const head = `${The(co.name)} is hiring`;
  parts.push(
    og(c, 'hero', {
      k: 'Hiring now',
      h: head,
      s: `${nf(live)} open roles from ${nf(companies)} companies.`,
      cc: co.iso,
      img: photo?.url,
      cr: photo?.credit,
      rows: rows([[nf(live), 'open roles'], [nf(new7), 'new this week'], visaPct >= 1 ? [`${visaPct}%`, 'mention sponsorship'] : [nf(companies), 'companies']]),
      cta: 'See the roles',
      link: bare(path),
      p: pos(1, total),
    })
  );
  if (total > 1 && funcs.length >= 3) parts.push(og(c, 'rank', { k: co.name, h: `What ${name} is hiring for`, rows: rows(funcs.map((f) => [f.name, nf(f.jobs), Math.round((100 * f.jobs) / funcs[0].jobs)])), src: 'Open roles by job function, today', link: bare(path), p: pos(2, total) }));
  if (total > parts.length && top.length >= 3) parts.push(og(c, 'rank', { k: co.name, h: `Who added the most roles in ${name} this week`, rows: rows(top.map((t) => [t.name, `+${nf(t.new_7d)}`, '', '', t.id, `${nf(t.live)} open`])), src: 'New roles in the last 7 days', cta: 'See the roles', link: bare(path), p: pos(parts.length + 1, total) }));

  const hooks = [
    `${flag(co.iso)} ${The(co.name)} is hiring.`,
    `${flag(co.iso)} ${nf(live)} open roles in ${name} right now.`,
    `${flag(co.iso)} Thinking about ${name}? Here’s what the job market looks like this week.`,
    `${flag(co.iso)} ${nf(new7)} new roles in ${name} in the last seven days.`,
  ];
  const hi = hash(`${c.w}:hook`) % hooks.length;
  const caption = write(c.p, [
    hooks[hi],
    // Don't say the same number twice in two lines.
    hi === 1 ? `They come from ${nf(companies)} companies, and ${nf(new7)} were posted this week.` : hi === 3 ? `That brings it to ${nf(live)} open roles from ${nf(companies)} companies.` : `${nf(live)} open roles from ${nf(companies)} companies, ${nf(new7)} of them new this week.`,
    visaPct >= 3
      ? `${adsSay(visaPct)} visa sponsorship is available. Most ads don’t mention it either way, so the real share is higher.`
      : 'Few ads mention visa sponsorship either way, which usually means nobody asked yet.',
    [cities.length >= 2 ? `Where: ${list(cities.slice(0, 3).map((x) => x.name))}.` : null, funcs.length >= 2 ? `Most wanted: ${list(funcs.slice(0, 3).map((x) => x.name))}.` : null].filter(Boolean).join('\n'),
    guide ? go(c.p, c.w, [`The roles, and every visa route for ${name}:`, `Jobs and visa routes for ${name}:`], path) : go(c.p, c.w, [`Every open role in ${name}:`], path),
    chance(0.5, c.w, 'ask') && c.p !== 'telegram' ? pick([`Would you move to ${name}? Tell us why, or why not.`, `Already working in ${name}? Tell people what it’s really like.`], c.w, 'ask-text') : null,
    tags(c.p, [`${countryTag(co.name)}jobs`, `workin${countryTag(co.name)}`, 'hiring', 'workabroad', cities[0]?.name, 'visasponsorship', 'jobsabroad']),
  ]);
  return { topic: co.iso, headline: head, format: parts.length > 1 ? 'carousel' : 'image', images: parts, caption, links: [link(c, `${co.name}: jobs and visa routes`, path)] };
};

const country_ranking: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const top = [...(snap?.by_country ?? [])].filter((x) => x.iso && x.new_7d > 0).sort((a, b) => b.new_7d - a.new_7d).slice(0, 5);
  if (top.length < 4) return null;
  const topic = weekKey(c);
  if (c.age(`country_ranking:${topic}`) < 24 * 6) return null;
  const h = pick(['Where companies posted the most jobs this week', 'Five countries with the most new jobs this week', 'Where the new jobs are this week'], c.seed, 'h');
  const caption = write(c.p, [
    pick([`Where did companies post the most jobs this week?`, `${flag(top[0].iso)} ${The(top[0].name)} posted the most new jobs this week.`, `This week’s new jobs, by country.`], c.w, 'hook'),
    top.map((x, i) => `${i + 1}. ${flag(x.iso)} ${x.name}: ${nf(x.new_7d)} new roles`).join('\n'),
    `Counted from company career pages over the last seven days. ${nf(snap!.new_7d)} new roles in total, across ${nf(snap!.countries)} countries.`,
    go(c.p, c.w, ['The live numbers, updated every hour:', 'All countries, live:'], '/job-market'),
    c.p !== 'telegram' ? pick(['Is your country on the list?', 'Which of these would you move to?'], c.w, 'ask') : null,
    tags(c.p, ['jobmarket', 'hiring', `${countryTag(top[0].name)}jobs`, `${countryTag(top[1].name)}jobs`, 'workabroad', 'jobsabroad']),
  ]);
  return { topic, headline: h, format: 'image', images: [og(c, 'rank', { k: 'This week', h, rows: rows(top.map((x) => [x.name, nf(x.new_7d), Math.round((100 * x.new_7d) / top[0].new_7d), x.iso])), src: 'New roles in the last 7 days', cta: 'See the numbers', link: 'madevisa.com/job-market' })], caption, links: [link(c, 'Job market', '/job-market')] };
};

const sponsor_ranking: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const top = [...(snap?.by_country ?? [])].filter((x) => x.iso && x.jobs >= 60 && x.visa > 0).map((x) => ({ ...x, share: pct(x.visa, x.jobs) })).filter((x) => x.share >= 1).sort((a, b) => b.share - a.share).slice(0, 5);
  if (top.length < 4 || c.age(`sponsor_ranking:${weekKey(c)}`) < 24 * 6) return null;
  const h = 'Where job ads mention visa sponsorship most';
  const caption = write(c.p, [
    pick([`In which country do job ads mention visa sponsorship most often?`, `We counted how many job ads state visa sponsorship, country by country.`, `${flag(top[0].iso)} ${The(top[0].name)} leads this week: ${top[0].share}% of its ads mention sponsorship.`], c.w, 'hook'),
    top.map((x, i) => `${i + 1}. ${flag(x.iso)} ${x.name}: ${x.share}% of ads (${nf(x.visa)} roles)`).join('\n'),
    'This only counts ads that say it in writing. Most don’t mention visas at all, so read it as a floor, not the full picture.',
    go(c.p, c.w, ['Sponsorship rates and visa routes for each country:', 'Country by country:'], '/destinations'),
    tags(c.p, ['visasponsorship', 'workabroad', `${countryTag(top[0].name)}jobs`, 'sponsoredjobs', 'jobsabroad']),
  ]);
  return { topic: weekKey(c), headline: h, format: 'image', images: [og(c, 'rank', { k: 'Visa sponsorship', h, s: 'Share of open job ads that state it', rows: rows(top.map((x) => [x.name, `${x.share}%`, Math.round((100 * x.share) / top[0].share), x.iso])), src: 'Countries with 60+ open roles · counted today', cta: 'Compare countries', link: 'madevisa.com/destinations' })], caption, links: [link(c, 'Destinations', '/destinations')] };
};

const top_companies: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const top = (snap?.top_companies_7d ?? []).filter((x) => x.new_7d > 0).slice(0, 5);
  if (top.length < 4 || c.age(`top_companies:${weekKey(c)}`) < 24 * 6) return null;
  const h = pick(['Who opened the most roles this week', 'Five companies hiring the most this week'], c.seed, 'h');
  const caption = write(c.p, [
    pick([`Five companies that opened the most roles this week.`, `${top[0].name} added ${nf(top[0].new_7d)} roles in seven days. Here’s the rest of the top five.`, `Who is actually hiring right now? These five, by number of new roles.`], c.w, 'hook'),
    top.map((x, i) => `${i + 1}. ${x.name}: ${nf(x.new_7d)} new, ${nf(x.live)} open`).join('\n'),
    'Before you apply, look at the company’s reply rate. It’s built from what applicants told us happened next.',
    go(c.p, c.w, ['Reply rates and open roles for every company:', 'Company Scores:'], '/companies'),
    tags(c.p, ['hiring', ...top.slice(0, 3).map((x) => companyTag(x.name)), 'jobs', 'careers']),
  ]);
  return { topic: weekKey(c), headline: h, format: 'image', images: [og(c, 'rank', { k: 'Who’s hiring', h, rows: rows(top.map((x) => [x.name, `+${nf(x.new_7d)}`, '', '', x.id, `${nf(x.live)} open roles`])), src: 'New roles in the last 7 days', cta: 'See company scores', link: 'madevisa.com/companies' })], caption, links: [link(c, 'Company Scores', '/companies')] };
};

const roles_in_demand: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const top = (snap?.functions ?? []).filter((x) => x.name && !/^(other|unknown)$/i.test(x.name)).slice(0, 5);
  if (top.length < 4 || c.age(`roles_in_demand:${weekKey(c)}`) < 24 * 6) return null;
  const h = 'What companies are hiring for right now';
  const caption = write(c.p, [
    pick([`What are companies hiring for most right now?`, `${top[0].name} has the most open roles today: ${nf(top[0].jobs)}.`, `Open roles by field, counted this morning.`], c.w, 'hook'),
    top.map((x, i) => `${i + 1}. ${x.name}: ${nf(x.jobs)} open roles`).join('\n'),
    go(c.p, c.w, ['Filter the jobs by your field:', 'Pick your field:'], '/jobs'),
    c.p !== 'telegram' ? 'Is your field on the list?' : null,
    tags(c.p, ['hiring', 'jobmarket', ...top.slice(0, 3).map((x) => x.name), 'careers']),
  ]);
  return { topic: weekKey(c), headline: h, format: 'image', images: [og(c, 'rank', { k: 'In demand', h, rows: rows(top.map((x) => [x.name, nf(x.jobs), Math.round((100 * x.jobs) / top[0].jobs)])), src: 'Open roles by job function, today', cta: 'Browse jobs', link: 'madevisa.com/jobs' })], caption, links: [link(c, 'Jobs', '/jobs')] };
};

const market_pulse: Builder = async (c) => {
  const s = await c.data.snapshot();
  if (!s || s.new_7d < 50) return null;
  const top = [...s.by_country].sort((a, b) => b.new_7d - a.new_7d)[0];
  const co = s.top_companies_7d[0];
  const h = pick(['The week in four numbers', 'This week on MadeVisa'], c.seed, 'h');
  const remote = s.work?.known >= 100 ? Math.round(s.work.remote) : null;
  const tiles = [[nf(s.new_7d), 'new roles in 7 days'], [nf(s.companies), 'companies hiring'], [nf(s.countries), 'countries'], remote !== null ? [`${remote}%`, 'fully remote'] : [`${Math.round(s.visa_share)}%`, 'mention sponsorship']];
  const caption = write(c.p, [
    pick([`The week in numbers.`, `${nf(s.new_7d)} new roles this week. Here’s where they came from.`, `What the job market looked like this week.`], c.w, 'hook'),
    [`${nf(s.new_7d)} new roles from ${nf(s.companies)} companies`, top ? `Most new roles: ${flag(top.iso)} ${top.name} (${nf(top.new_7d)})` : null, co ? `Busiest employer: ${co.name} (+${nf(co.new_7d)})` : null, `${Math.round(s.visa_share)}% of ads mention visa sponsorship`, remote !== null ? `${remote}% of roles that state it are fully remote` : null].filter(Boolean).map((x) => `• ${x}`).join('\n'),
    go(c.p, c.w, ['The live version, updated hourly:', 'All the numbers:'], '/job-market'),
    tags(c.p, ['jobmarket', 'hiring', 'workabroad', 'visasponsorship', 'remotejobs']),
  ]);
  return { topic: weekKey(c), headline: h, format: 'image', images: [og(c, 'grid', { k: 'This week', h, rows: rows(tiles), src: 'Counted from company career pages', cta: 'See who’s hiring', link: 'madevisa.com/job-market' })], caption, links: [link(c, 'Job market', '/job-market')] };
};

const remote_share: Builder = async (c) => {
  const s = await c.data.snapshot();
  if (!s?.work || s.work.known < 200) return null;
  const r = Math.round(s.work.remote), hy = Math.round(s.work.hybrid), on = Math.round(s.work.onsite);
  const caption = write(c.p, [
    pick([`How many jobs are actually remote? We counted.`, `${r}% of job ads that say where you’ll work are fully remote.`, `“Remote” is rarer than your feed makes it look.`], c.w, 'hook'),
    `Of ${nf(s.work.known)} open roles that state it:\n• ${on}% on-site\n• ${hy}% hybrid\n• ${r}% fully remote`,
    'Plenty of ads don’t say at all, so check the original posting before you plan around it.',
    go(c.p, c.w, ['The remote roles:', 'Only the remote ones:'], '/jobs?remote=1'),
    tags(c.p, ['remotejobs', 'remotework', 'hybridwork', 'jobmarket']),
  ]);
  return { topic: `m${c.now.getUTCMonth()}`, headline: 'How much is really remote', format: 'image', images: [og(c, 'stat', { k: 'Remote work', h: 'Of the job ads that say where you work', n: `${r}%`, u: 'are fully remote', s: `${hy}% are hybrid and ${on}% are on-site. Counted from ${nf(s.work.known)} open roles.`, cta: 'See remote roles', link: 'madevisa.com/jobs' })], caption, links: [link(c, 'Remote jobs', '/jobs?remote=1')] };
};

const milestone: Builder = async (c) => {
  const s = await c.data.snapshot();
  if (!s || s.live_jobs < 500) return null;
  const caption = write(c.p, [
    pick([`Live right now: ${nf(s.live_jobs)} jobs from ${nf(s.companies)} companies.`, `${nf(s.live_jobs)} open roles on MadeVisa today, all taken from company career pages.`], c.w, 'hook'),
    `${nf(s.countries)} countries. ${nf(s.new_24h)} roles added in the last 24 hours.\nWhen a role disappears from the employer’s page, it closes here too.`,
    go(c.p, c.w, ['Search them:', 'Start here:'], '/jobs'),
    tags(c.p, ['jobs', 'hiring', 'workabroad', 'jobsearch']),
  ]);
  return { topic: `m${c.now.getUTCMonth()}`, headline: 'Live jobs today', format: 'image', images: [og(c, 'stat', { k: 'Live today', n: nf(s.live_jobs), u: 'open jobs', s: `From ${nf(s.companies)} companies in ${nf(s.countries)} countries. ${nf(s.new_24h)} added in the last 24 hours.`, cta: 'Browse jobs', link: 'madevisa.com/jobs' })], caption, links: [link(c, 'Jobs', '/jobs')] };
};

// ---------------------------------------------------------------------------
// Visa know-how
// ---------------------------------------------------------------------------

const allRoutes = (lib: Library, kinds: LibRoute['kind'][]) => lib.countries.flatMap((g) => g.routes.filter((r) => kinds.includes(r.kind)).map((r) => ({ g, r })));

const visa_route: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const cands = focusFirst(c, allRoutes(lib, ['work', 'talent', 'job-search', 'remote']), (x) => x.g.code);
  // Mix the countries: shuffle, repeatably.
  const mixed = [...cands].sort((a, b) => (hash(`${c.seed % 97}:${a.r.id}`) % 1000) - (hash(`${c.seed % 97}:${b.r.id}`) % 1000));
  const x = choose(c, 'visa_route', c.settings.focus?.length ? cands : mixed, (y) => y.r.id, 24 * 45);
  if (!x) return null;
  const { g, r } = x;
  const path = `/destinations/${g.slug}`;
  const needs = r.requires.map((k) => REQ[k]).filter(Boolean);
  const title = `${r.name}, ${g.name}`;
  const total = slides(c, 2);
  const card = og(c, 'card', {
    k: 'Visa route',
    h: title,
    s: total === 1 ? typo(firstSentence(r.summary)) : '',
    cc: g.code,
    rows: rows([
      ['Valid for', r.validity],
      r.fee ? ['Fee', r.fee] : null,
      needs.length ? ['You need', r.requires.map((k) => REQ_SHORT[k]).filter(Boolean).join(' · ')] : null,
      ['Counts toward permanent residence', r.leadsToPR ? 'Yes' : 'No'],
    ].filter(Boolean) as string[][]),
    src: sourceLine(r.url, g.reviewed),
    cta: 'All routes',
    link: bare(path),
    p: pos(total, total),
  });
  const cover = og(c, 'hero', { k: 'Visa route', h: r.name, s: typo(firstSentence(r.summary)), cc: g.code, img: c.photo(g.code)?.url, cr: c.photo(g.code)?.credit, rows: rows(([r.validity.length <= 16 ? [r.validity, 'validity'] : null, r.fee && r.fee.length <= 14 ? [r.fee, 'visa fee'] : null, [r.requires.includes('job-offer') ? 'Yes' : 'No', 'job offer needed'], [r.leadsToPR ? 'Yes' : 'No', 'counts toward PR']].filter(Boolean) as string[][]).slice(0, 3)), link: bare(path), p: pos(1, total) });
  const caption = write(c.p, [
    pick(
      [
        `${flag(g.code)} ${g.name}: the ${r.name}, in plain words.`,
        `${flag(g.code)} One visa route at a time. Today: the ${r.name} (${g.name}).`,
        `${flag(g.code)} Thinking about ${the(g.name)}? This is the ${r.name}.`,
        `${flag(g.code)} ${r.name}. Who it’s for, and what it asks.`,
      ],
      c.w,
      'hook'
    ),
    typo(r.summary),
    [`• Valid for: ${lowerFirst(r.validity)}`, r.fee ? `• Fee: ${r.fee}` : null, needs.length ? `• You need: ${list(needs)}` : null, `• ${r.leadsToPR ? 'Counts toward permanent residence' : 'Doesn’t count toward permanent residence on its own'}`].filter(Boolean).join('\n'),
    r.note ? typo(r.note) : null,
    `Official source: ${host(r.url)} (we last checked it in ${monthLabel(g.reviewed)}). Rules change, so read the source before you apply.`,
    go(c.p, c.w, [`All routes for ${the(g.name)}, side by side:`, `Every route for ${the(g.name)}:`], path),
    closer(c.p, c.w, 'save', 0.6),
    tags(c.p, [countryTag(g.name), r.name.replace(/\(.*?\)/g, ''), `${countryTag(g.name)}visa`, 'workabroad', 'workvisa', 'movingabroad', `workin${countryTag(g.name)}`]),
  ]);
  return { topic: r.id, headline: title, format: total > 1 ? 'carousel' : 'image', images: total > 1 ? [cover, card] : [card], caption, links: [link(c, `Visa routes: ${g.name}`, path), { title: 'Official source', url: r.url }] };
};

function routeList(kind: 'job-search' | 'remote', o: { key: string; k: string; h: string; hooks: string[]; body: string; tags: string[] }): Builder {
  return async (c) => {
    const lib = await c.data.library();
    if (!lib) return null;
    const items = allRoutes(lib, [kind]);
    if (items.length < 4) return null;
    // A different five each time (there are more routes than fit on one image).
    const start = hash(`${c.seed}:${kind}`) % items.length;
    const five = Array.from({ length: Math.min(5, items.length) }, (_, i) => items[(start + i) % items.length]);
    const topic = 'list';
    if (c.hot(`${o.key}:${topic}`) || c.age(`${o.key}:${topic}`) < 24 * 18) return null;
    const caption = write(c.p, [
      pick(o.hooks, c.w, 'hook'),
      five.map((x) => `${flag(x.g.code)} ${x.g.name}: ${x.r.name.replace(/\s*\(.*?\)/, '')} · ${lowerFirst(x.r.validity)}`).join('\n'),
      o.body,
      go(c.p, c.w, ['What each one asks for, with the official source:', 'The conditions for each:'], '/destinations'),
      closer(c.p, c.w, 'either', 0.7),
      tags(c.p, [...o.tags, ...five.slice(0, 2).map((x) => countryTag(x.g.name)), 'workabroad', 'movingabroad']),
    ]);
    return { topic, headline: o.h, format: 'image', images: [og(c, 'rank', { k: o.k, h: o.h, rows: rows(five.map((x) => [x.g.name, '', '', x.g.code, '', `${x.r.name.replace(/\s*\(.*?\)/, '')} · ${lowerFirst(x.r.validity)}`])), src: 'Source: MadeVisa visa guides, each with its official source', cta: 'Compare routes', link: 'madevisa.com/destinations' })], caption, links: [link(c, 'Destinations', '/destinations')] };
  };
}

const visa_jobsearch = routeList('job-search', {
  key: 'visa_jobsearch',
  k: 'No job offer needed',
  h: 'Countries that let you move first and find the job after',
  hooks: ['You don’t always need a job offer to move.', 'Countries that let you arrive first and look for work there.', 'No job offer yet? These countries have a visa for that.'],
  body: 'These are job-search visas: you live there while you look. Each has its own conditions, usually a degree and enough savings.',
  tags: ['jobseekervisa', 'jobsearchvisa'],
});

const visa_nomad = routeList('remote', {
  key: 'visa_nomad',
  k: 'Remote work',
  h: 'Keep your job. Change your country.',
  hooks: ['Keep your job, change your country.', 'Working remotely for a company somewhere else? These countries have a visa for it.', 'Remote job, new country. These visas exist for exactly that.'],
  body: 'Remote-work visas are for people paid from outside the country. Most ask for proof of a steady income.',
  tags: ['digitalnomadvisa', 'remotework', 'digitalnomad'],
});

const visa_pr: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const all = lib.countries.filter((g) => typeof g.prYears === 'number' && g.prYears! > 0).sort((a, b) => a.prYears! - b.prYears! || a.name.localeCompare(b.name));
  if (all.length < 5) return null;
  // Two versions that alternate: the fastest, and the big destinations.
  const big = ['DE', 'GB', 'NL', 'IE', 'FR', 'SE'];
  const version = chance(0.5, c.seed, 'pr') ? 'fast' : 'big';
  const five = version === 'fast' ? all.slice(0, 5) : all.filter((g) => big.includes(g.code)).slice(0, 5);
  if (five.length < 4 || c.age(`visa_pr:${version}`) < 24 * 20) return null;
  const max = Math.max(...five.map((g) => g.prYears!));
  const h = version === 'fast' ? 'Where you can stay for good soonest' : 'Years until permanent residence';
  const caption = write(c.p, [
    pick(['How long until you can stay permanently?', 'A work visa is step one. Permanent residence is the one that lets you stop renewing.', 'Years of living there before you can apply to stay for good.'], c.w, 'hook'),
    five.map((g) => `${flag(g.code)} ${g.name}: ${g.prYears} ${plural(g.prYears!, 'year', 'years')}`).join('\n'),
    `Some routes are faster than the general rule. ${five[0].name}, for example: ${typo(noDot(five[0].prNote))}.`,
    go(c.p, c.w, ['Residence and citizenship timelines for each country:', 'The details for each country:'], '/destinations'),
    closer(c.p, c.w, 'save', 0.6),
    tags(c.p, ['permanentresidence', 'movingabroad', 'workabroad', ...five.slice(0, 2).map((g) => countryTag(g.name)), 'immigration']),
  ]);
  return { topic: version, headline: h, format: 'image', images: [og(c, 'rank', { k: 'Permanent residence', h, s: 'The usual number of years living there first', rows: rows(five.map((g) => [g.name, `${g.prYears} ${plural(g.prYears!, 'year', 'years')}`, Math.round((100 * g.prYears!) / max), g.code])), src: 'Source: MadeVisa visa guides · some routes are faster', cta: 'See the routes', link: 'madevisa.com/destinations' })], caption, links: [link(c, 'Destinations', '/destinations')] };
};

const visa_salary: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib?.thresholds.length) return null;
  const t = choose(c, 'visa_salary', lib.thresholds, (x) => x.code, 24 * 12);
  if (!t) return null;
  const g = lib.countries.find((x) => x.code === t.code);
  if (!g) return null;
  const path = `/destinations/${g.slug}`;
  const lowers = t.lower.map((l) => `${money(l.annual, t.currency)} for ${l.who}`);
  const h = `The salary the ${t.route} needs`;
  const caption = write(c.p, [
    pick(
      [
        `${flag(t.code)} The salary you need for ${the(g.name) === g.name ? `${g.name}’s` : 'the'} ${t.route}: ${money(t.standard.annual, t.currency)} a year.`,
        `${flag(t.code)} ${money(t.standard.annual, t.currency)}. That’s the yearly pay the ${t.route} asks for in ${the(g.name)}.`,
        `${flag(t.code)} Before you apply in ${the(g.name)}, check one number.`,
      ],
      c.w,
      'hook'
    ),
    `${t.route}: ${money(t.standard.annual, t.currency)} a year for ${t.standard.who}.\n${lowers.map((l) => `Lower: ${l}.`).join('\n')}`,
    t.caveat,
    `Source: ${t.source.label}, checked ${new Date(`${t.checkedOn}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
    go(c.p, c.w, ['Job pages on MadeVisa compare the advertised pay with this number. Routes and thresholds:', 'On each job page we compare the advertised pay with this minimum. More on the route:'], path),
    closer(c.p, c.w, 'save', 0.5),
    tags(c.p, [`${countryTag(g.name)}visa`, t.route, 'workvisa', 'salary', `workin${countryTag(g.name)}`, 'movingabroad']),
  ]);
  return { topic: t.code, headline: h, format: 'image', images: [og(c, 'stat', { k: 'Visa salary', h, n: money(t.standard.annual, t.currency), u: `a year, for ${t.standard.who}`, s: lowers.length ? `${lowers[0][0].toUpperCase()}${lowers[0].slice(1)}.` : t.caveat, cc: t.code, src: `Source: ${t.source.label} · checked ${monthLabel(t.checkedOn)}`, link: bare(path) })], caption, links: [link(c, `Visa routes: ${g.name}`, path), { title: 'Official source', url: t.source.url }] };
};

const DUAL = { yes: 'Yes', limited: 'Limited', no: 'No' } as const;
const years = (n: number | null) => (n === null ? 'No fixed period' : n === 0 ? 'On arrival' : `${n} ${plural(n, 'year', 'years')}`);

/** Pairs people really weigh up against each other. */
const PAIRS: [string, string][] = [['DE', 'NL'], ['IE', 'GB'], ['CA', 'AU'], ['DE', 'AT'], ['ES', 'PT'], ['SE', 'DK'], ['GB', 'DE'], ['NL', 'BE'], ['FR', 'DE'], ['IE', 'NL'], ['FI', 'SE'], ['US', 'CA'], ['AE', 'SG'], ['IT', 'ES'], ['EE', 'FI'], ['GB', 'CA']];

function pairFor(c: Ctx, lib: Library, kind: string, minHours: number): [LibCountry, LibCountry] | null {
  const by = new Map(lib.countries.map((g) => [g.code, g]));
  // A pair rests on this network whichever of the two formats used it.
  const rested = (x: [string, string]) => Math.min(c.age(`visa_compare:${x.join('')}`), c.age(`this_or_that:${x.join('')}`)) >= 24 * 21;
  const p = choose(c, kind, PAIRS.filter(([a, b]) => by.has(a) && by.has(b)).filter(rested), (x) => x.join(''), minHours);
  return p ? [by.get(p[0])!, by.get(p[1])!] : null;
}

const visa_compare: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const pair = pairFor(c, lib, 'visa_compare', 24 * 30);
  if (!pair) return null;
  const [a, b] = pair;
  const h = `${a.name} or ${shortName(b.name)}?`;
  const caption = write(c.p, [
    pick([`${flag(a.code)} ${a.name} or ${flag(b.code)} ${shortName(b.name)}? Four facts that matter once you’ve moved.`, `${flag(a.code)} vs ${flag(b.code)}. Same question, different answers.`, `Choosing between ${the(a.name)} and ${the(b.name)}? Compare these first.`], c.w, 'hook'),
    [`Permanent residence: ${years(a.prYears).toLowerCase()} / ${years(b.prYears).toLowerCase()}`, `Citizenship: ${years(a.citizenshipYears).toLowerCase()} / ${years(b.citizenshipYears).toLowerCase()}`, `Dual citizenship: ${DUAL[a.dual].toLowerCase()} / ${DUAL[b.dual].toLowerCase()}`, `Language: ${a.languages} / ${b.languages}`].map((x) => `• ${x}`).join('\n'),
    `(${a.name} first, ${b.name} second.)`,
    go(c.p, c.w, ['Routes, fees and open jobs for both:', 'Both countries in full:'], '/destinations'),
    c.p !== 'telegram' ? pick(['Which one would you pick?', 'Where would you go?'], c.w, 'ask') : null,
    tags(c.p, [countryTag(a.name), countryTag(b.name), 'movingabroad', 'workabroad', 'permanentresidence', 'expat']),
  ]);
  return { topic: `${a.code}${b.code}`, headline: h, format: 'image', images: [og(c, 'versus', { k: 'Compare', h, cc: a.code, cc2: b.code, n: a.name, u: b.name, rows: rows([['Residence', years(a.prYears), years(b.prYears)], ['Citizenship', years(a.citizenshipYears), years(b.citizenshipYears)], ['Dual citizenship', DUAL[a.dual], DUAL[b.dual]], ['Language', a.languages.split(/[,(]/)[0].trim(), b.languages.split(/[,(]/)[0].trim()]]), src: 'Source: MadeVisa visa guides, each with its official source', link: 'madevisa.com/destinations' })], caption, links: [link(c, 'Destinations', '/destinations')] };
};

type Myth = { key: string; myth: string; fact: string; src: string; path: string; cc?: string; tags: string[] };

function myths(lib: Library): Myth[] {
  const out: Myth[] = [];
  for (const { g, r } of allRoutes(lib, ['job-search']))
    out.push({ key: `offer-${r.id}`, myth: `You need a job offer before you can move to ${the(g.name)}.`, fact: `${The(g.name)} has the ${r.name}: ${typo(lowerFirst(firstSentence(r.summary)))}`, src: sourceLine(r.url, g.reviewed), path: `/destinations/${g.slug}`, cc: g.code, tags: [countryTag(g.name), 'jobseekervisa'] });
  for (const { g, r } of allRoutes(lib, ['work']).filter((x) => x.r.employer && !x.r.employer.licenceNeeded)) {
    const n = r.employer!.steps.filter((s) => !s.optional).length;
    out.push({ key: `licence-${r.id}`, myth: `A company in ${the(g.name)} needs a special licence to hire someone from abroad.`, fact: `On the ${r.name}, the employer needs no sponsor licence. Their part is ${n} ${plural(n, 'step', 'steps')}.`, src: sourceLine(r.url, g.reviewed), path: '/offers', cc: g.code, tags: [countryTag(g.name), 'visasponsorship'] });
  }
  for (const g of lib.countries.filter((x) => typeof x.prYears === 'number' && x.prYears! > 0 && x.prYears! <= 4))
    out.push({ key: `pr-${g.code}`, myth: 'Permanent residence always takes ten years or more.', fact: `${The(g.name)}: ${typo(noDot(g.prNote))}.`, src: `Source: MadeVisa visa guide for ${g.name} · checked ${monthLabel(g.reviewed)}`, path: `/destinations/${g.slug}`, cc: g.code, tags: [countryTag(g.name), 'permanentresidence'] });
  const dual = lib.countries.filter((g) => g.dual === 'yes');
  if (dual.length >= 5) out.push({ key: 'dual', myth: 'To become a citizen somewhere new, you have to give up your passport.', fact: `${dual.length} of the ${lib.countries.length} countries in our guides allow dual citizenship, including ${list(dual.slice(0, 4).map((g) => the(g.name)))}.`, src: 'Source: MadeVisa visa guides', path: '/destinations', tags: ['dualcitizenship', 'citizenship'] });
  for (const { g, r } of allRoutes(lib, ['remote']))
    out.push({ key: `remote-${r.id}`, myth: 'With a remote job you can only live abroad as a tourist.', fact: `${The(g.name)} has a ${r.name.replace(/\s*\(.*?\)/, '')} for people who work remotely: ${lowerFirst(r.validity)}.`, src: sourceLine(r.url, g.reviewed), path: `/destinations/${g.slug}`, cc: g.code, tags: [countryTag(g.name), 'digitalnomadvisa'] });
  for (const t of lib.thresholds.filter((x) => x.lower.length)) {
    const g = lib.countries.find((x) => x.code === t.code);
    if (g) out.push({ key: `tier-${t.code}`, myth: `The salary minimum for a work visa in ${the(g.name)} is the same for everyone.`, fact: `For the ${t.route} it is ${money(t.standard.annual, t.currency)} for ${t.standard.who}, but ${money(t.lower[0].annual, t.currency)} for ${t.lower[0].who.split(/[:(]/)[0].trim()}.`, src: `Source: ${t.source.label} · checked ${monthLabel(t.checkedOn)}`, path: `/destinations/${g.slug}`, cc: t.code, tags: [countryTag(g.name), 'workvisa'] });
  }
  out.push({ key: 'no-line', myth: 'If the job ad doesn’t mention visa sponsorship, the company won’t sponsor.', fact: 'Most ads don’t mention visas either way. Often nobody has asked. A one-page Visa Plan shows the employer the route, their steps and the cost.', src: 'Visa Plan · madevisa.com/offers', path: '/offers', tags: ['visasponsorship', 'visaplan'] });
  return out;
}

const visa_myth: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const all = myths(lib);
  // Spread the kinds of myth: order by a repeatable shuffle.
  const mixed = [...all].sort((a, b) => (hash(`${c.seed % 89}:${a.key}`) % 1000) - (hash(`${c.seed % 89}:${b.key}`) % 1000));
  const m = choose(c, 'visa_myth', mixed, (x) => x.key, 24 * 60);
  if (!m) return null;
  const caption = write(c.p, [
    pick([`“${noDot(m.myth)}.” Not true.`, `Myth: ${lowerFirst(m.myth)}`, `We hear this one a lot: “${noDot(m.myth)}.”`], c.w, 'hook'),
    `What’s actually true:\n${m.fact}`,
    m.src,
    go(c.p, c.w, ['The full picture:', 'Read the details:'], m.path),
    c.p !== 'telegram' && chance(0.6, c.w, 'ask') ? 'What’s a visa “fact” you were told that turned out to be wrong?' : closer(c.p, c.w, 'share', 0.5),
    tags(c.p, [...m.tags, 'workabroad', 'movingabroad', 'mythvsfact', 'visa']),
  ]);
  return { topic: m.key, headline: m.myth, format: 'image', images: [og(c, 'myth', { k: 'Myth vs fact', m: m.myth, f: m.fact, src: m.src, cc: m.cc, link: bare(m.path) })], caption, links: [link(c, 'Read more', m.path)] };
};

const visa_checklist: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib?.documents?.length) return null;
  if (c.age('visa_checklist:docs') < 24 * 30) return null;
  const docs = lib.documents.slice(0, 6);
  const h = 'Documents almost every work visa asks for';
  const caption = write(c.p, [
    pick(['Save this before you start any visa application.', 'The documents almost every long-stay visa asks for.', 'Start collecting these early. Translations and certified copies can take weeks.'], c.w, 'hook'),
    docs.map((d) => `☐ ${d}`).join('\n'),
    'Each route adds its own on top (a recognised degree, a salary threshold, a points test). The country pages list them with the official source.',
    go(c.p, c.w, ['Pick your country:', 'By country:'], '/destinations'),
    closer(c.p, c.w, 'save', 1),
    tags(c.p, ['visachecklist', 'workvisa', 'movingabroad', 'workabroad', 'visaapplication']),
  ]);
  return { topic: 'docs', headline: h, format: 'image', images: [og(c, 'card', { k: 'Save this', h, rows: rows(docs.map((d) => ['', d])), src: 'Each route adds its own. Always check the official source.', cta: 'Pick your country', link: 'madevisa.com/destinations' })], caption, links: [link(c, 'Destinations', '/destinations')] };
};

// ---------------------------------------------------------------------------
// Visa Plan
// ---------------------------------------------------------------------------

const FLIPS: { h: string; hl: string; s: string; hooks: string[] }[] = [
  { h: 'Stop asking “do you sponsor visas?” Send the plan instead.', hl: 'the plan instead', s: 'One page: the visa route, the employer’s steps, and which costs you’ll cover.', hooks: ['“Do you sponsor visas?” is the easiest question for a recruiter to ignore.', 'Stop asking whether they sponsor. Show them how.'] },
  { h: 'Don’t wait for a company to offer sponsorship. Offer it to them.', hl: 'Offer it to them', s: 'A Visa Plan puts the route, the steps and the costs on one page.', hooks: ['Flip it. You make the sponsorship offer, not the company.', 'Everyone waits for an employer to offer sponsorship. Almost nobody makes the offer themselves.'] },
  { h: 'No visa line in the ad is not a no.', hl: 'not a no', s: 'It usually means nobody asked. A Visa Plan asks, and answers.', hooks: ['The ad doesn’t mention visas. Read that as “not asked yet”.', 'No visa line in the job ad? That’s most ads. It isn’t a rejection.'] },
  { h: 'Employers guess a visa is slow and costly. Show them the real numbers.', hl: 'the real numbers', s: 'Their steps, the timeline and who pays what, before they have to ask.', hooks: ['Recruiters don’t reject visa candidates out of malice. They can’t see the cost or the steps.', 'The real reason foreign candidates get skipped: nobody knows what sponsoring involves.'] },
  { h: 'A cover letter for the visa.', hl: 'for the visa', s: 'That’s a Visa Plan: one page you attach to your application.', hooks: ['You write a cover letter for the job. Write one for the visa too.', 'Your CV explains you. Nothing in your application explains the visa. Until now.'] },
];

const plan_flip: Builder = async (c) => {
  const f = choose(c, 'plan_flip', FLIPS.map((x, i) => ({ ...x, i })), (x) => String(x.i), 24 * 12);
  if (!f) return null;
  const caption = write(c.p, [
    pick(f.hooks, c.w, 'hook'),
    pick(
      [
        'A Visa Plan is a one-page PDF you attach when you apply. It shows the visa route for that country, what the employer has to do (often two or three steps), and which costs you’re willing to cover.',
        'Here’s the idea: you pick the job, choose which visa costs you’d share, and attach a one-page plan to your application. The employer sees the legal route, their steps and the real cost.',
      ],
      c.w,
      'explain'
    ),
    pick(['Salary is never part of it. Visa salary rules exist so nobody gets underpaid.', 'You never offer to take less pay. The plan only covers costs the law lets a candidate pay.'], c.w, 'guard'),
    go(c.p, c.w, ['See how it works:', 'How a Visa Plan works:', 'It comes with MadeVisa Pro:'], '/offers'),
    c.p !== 'telegram' && chance(0.5, c.w, 'ask') ? 'Have you ever asked an employer about sponsorship? What did they say?' : null,
    tags(c.p, ['visasponsorship', 'visaplan', 'workabroad', 'jobsearch', 'jobsabroad', 'movingabroad']),
  ]);
  return { topic: String(f.i), headline: f.h, format: 'image', images: [og(c, 'text', { k: 'Visa Plan', h: f.h, hl: f.hl, s: f.s, cta: 'See how it works', link: 'madevisa.com/offers', th: f.i % 2 ? 'ink' : 'blue' })], caption, links: [link(c, 'Visa Plan', '/offers')] };
};

const plan_steps: Builder = async (c) => {
  if (c.age('plan_steps:how') < 24 * 14) return null;
  const steps = [
    ['Check your match on the job', 'The plan is listed under “Your application” as the missing piece.'],
    ['Choose who pays what', 'Drag to decide which visa costs you’ll cover: your visa fee, flights, translations.'],
    ['Attach the one-page plan', 'A PDF next to your CV: the route, the employer’s steps and the costs.'],
  ];
  const total = slides(c, 2);
  const cover = og(c, 'text', { k: 'Visa Plan', h: 'A cover letter for the visa.', hl: 'for the visa', s: 'Three steps, about two minutes. Swipe.', link: 'madevisa.com/offers', p: pos(1, total), th: 'ink' });
  const how = og(c, 'steps', { k: 'Visa Plan', h: 'How a Visa Plan works', rows: rows(steps), cta: 'See how it works', link: 'madevisa.com/offers', p: pos(total, total) });
  const caption = write(c.p, [
    pick(['A cover letter for the visa. Here’s how it works.', 'How a Visa Plan works, in three steps.', 'You already found the job. This is the part most people skip.'], c.w, 'hook'),
    steps.map((s, i) => `${i + 1}. ${s[0]}. ${s[1]}`).join('\n'),
    'The employer gets one page that answers “can we hire this person?” before they have to look it up.',
    go(c.p, c.w, ['See how it works:', 'Make one for the job you want:'], '/offers'),
    closer(c.p, c.w, 'either', 0.6),
    tags(c.p, ['visaplan', 'visasponsorship', 'workabroad', 'jobapplication', 'jobsabroad']),
  ]);
  return { topic: 'how', headline: 'How a Visa Plan works', format: total > 1 ? 'carousel' : 'image', images: total > 1 ? [cover, how] : [how], caption, links: [link(c, 'Visa Plan', '/offers')] };
};

const ADJ: Record<string, string> = { DE: 'German', NL: 'Dutch', GB: 'UK', ES: 'Spanish', SE: 'Swedish', DK: 'Danish', FR: 'French', IE: 'Irish', AT: 'Austrian', BE: 'Belgian', PT: 'Portuguese', FI: 'Finnish', IT: 'Italian' };

const plan_employer: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const x = choose(c, 'plan_employer', focusFirst(c, allRoutes(lib, ['work', 'talent']).filter((y) => y.r.employer && y.r.employer.steps.length >= 2), (y) => y.g.code), (y) => y.r.id, 24 * 20);
  if (!x) return null;
  const { g, r } = x;
  const e = r.employer!;
  const adj = ADJ[g.code] ?? g.name;
  const h = `What a ${adj} employer has to do to hire you`;
  const routeName = /visa|card|permit|scheme|pass$/i.test(r.name) ? r.name : `${r.name} route`;
  const caption = write(c.p, [
    pick(
      [
        `${flag(g.code)} What does a ${adj} employer actually have to do to hire someone from abroad? This is the list for the ${routeName}.`,
        `${flag(g.code)} Most employers have never sponsored anyone, so they assume it’s complicated. On the ${routeName}, this is everything on their side.`,
        `${flag(g.code)} The ${routeName}, from the employer’s side of the table.`,
      ],
      c.w,
      'hook'
    ),
    `Their list:\n${e.steps.map((s, i) => `${i + 1}. ${typo(s.text)}${s.effort ? ` (${lowerFirst(s.effort)})` : ''}`).join('\n')}`,
    e.licenceNeeded ? typo(e.licenceNote ?? '') : 'No sponsor licence needed on this route.',
    typo(e.timeline),
    `A Visa Plan puts exactly this in front of the employer, on one page, with your application.`,
    go(c.p, c.w, ['Build yours:', 'See how a Visa Plan works:'], '/offers'),
    closer(c.p, c.w, 'share', 0.5),
    tags(c.p, ['visasponsorship', 'visaplan', countryTag(g.name), `workin${countryTag(g.name)}`, 'hiring', 'workabroad']),
  ]);
  return {
    topic: r.id,
    headline: h,
    format: 'image',
    images: [og(c, 'steps', { k: 'The employer’s side', h, s: `${r.name} · ${e.licenceNeeded ? 'sponsor licence needed' : 'no sponsor licence needed'}`, rows: rows(e.steps.slice(0, 4).map((s) => [typo(s.text), '', s.effort ?? ''])), src: sourceLine(r.url, g.reviewed), cta: 'Build your Visa Plan', link: 'madevisa.com/offers' })],
    caption,
    links: [link(c, 'Visa Plan', '/offers'), { title: 'Official source', url: r.url }],
  };
};

const plan_costs: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const x = choose(c, 'plan_costs', allRoutes(lib, ['work', 'talent']).filter((y) => y.r.employer && y.r.employer.candidateMayCover.length >= 2 && y.r.employer.employerCosts), (y) => y.r.id, 24 * 30);
  if (!x) return null;
  const { g, r } = x;
  const e = r.employer!;
  const mine = e.candidateMayCover.map((k) => COVER[k]).filter(Boolean);
  const h = 'Who pays what for a work visa';
  const caption = write(c.p, [
    pick([`${flag(g.code)} Which visa costs can you offer to pay yourself? In ${the(g.name)}, on the ${r.name}:`, `${flag(g.code)} “We’d love to hire you, but the visa costs…” Here’s what you can take off the employer’s plate in ${the(g.name)}.`, `${flag(g.code)} Who pays what on the ${r.name}.`], c.w, 'hook'),
    `You may cover:\n${mine.map((m) => `• ${m}`).join('\n')}`,
    `The employer’s side: ${typo(e.employerCosts ?? '')}`,
    'What you never offer: a lower salary. Visa salary minimums exist to stop exactly that.',
    go(c.p, c.w, ['Set who pays what in your Visa Plan:', 'Choose the split in a Visa Plan:'], '/offers'),
    tags(c.p, ['visasponsorship', 'visaplan', countryTag(g.name), 'workvisa', 'workabroad']),
  ]);
  return { topic: r.id, headline: h, format: 'image', images: [og(c, 'card', { k: 'Who pays what', h, s: `${r.name}, ${g.name}`, cc: g.code, rows: rows([...mine.slice(0, 4).map((m) => ['', `You may cover ${m}`]), ['The employer', typo(e.employerCosts!)]]), src: sourceLine(r.url, g.reviewed), cta: 'Build your Visa Plan', link: 'madevisa.com/offers' })], caption, links: [link(c, 'Visa Plan', '/offers')] };
};

// ---------------------------------------------------------------------------
// Real outcomes
// ---------------------------------------------------------------------------

const feedback_stats: Builder = async (c) => {
  const f = await c.data.feedback();
  if (!f || f.total < 30) return null;
  const p = (n: number) => pct(n, f.total);
  const tiles = [[`${p(f.no_response)}%`, 'heard nothing back'], [`${p(f.responded + f.interview + f.offer + f.rejected)}%`, 'got an answer'], [`${p(f.interview + f.offer)}%`, 'got an interview or offer'], f.avg_reply_days ? [`${f.avg_reply_days} days`, 'average time to a reply'] : [`${p(f.offer)}%`, 'got an offer']];
  const h = `What happened to ${nf(f.total)} applications`;
  const caption = write(c.p, [
    pick([`We asked what happened after people applied. ${nf(f.total)} applications later:`, `${p(f.no_response)}% of applications tracked on MadeVisa never got an answer.`, `What really happens after you press “apply”.`], c.w, 'hook'),
    [`${p(f.no_response)}% heard nothing`, `${p(f.rejected)}% got a rejection`, `${p(f.responded)}% got a reply but no interview`, `${p(f.interview)}% reached an interview`, `${p(f.offer)}% got an offer`].map((x) => `• ${x}`).join('\n'),
    `${f.avg_reply_days ? `When companies do reply, it takes ${f.avg_reply_days} days on average. ` : ''}This comes from ${nf(f.people)} people and ${nf(f.companies)} companies. No names, only outcomes.`,
    go(c.p, c.w, ['See which companies reply before you apply:', 'Reply rates, company by company:'], '/companies'),
    c.p !== 'telegram' ? pick(['How did your last application go?', 'Does this match your experience?'], c.w, 'ask') : null,
    tags(c.p, ['jobsearch', 'ghosting', 'hiring', 'jobapplication', 'recruitment']),
  ]);
  return { topic: `m${c.now.getUTCMonth()}`, headline: h, format: 'image', images: [og(c, 'grid', { k: 'Real outcomes', h, s: 'Tracked by applicants on MadeVisa', rows: rows(tiles), src: `${nf(f.people)} people · ${nf(f.companies)} companies · no names, only outcomes`, cta: 'See who replies', link: 'madevisa.com/companies' })], caption, links: [link(c, 'Company Scores', '/companies')] };
};

const responsive_companies: Builder = async (c) => {
  const f = await c.data.feedback();
  const top = (f?.most_responsive ?? []).slice(0, 5);
  if (top.length < 3) return null;
  const topic = top.map((x) => x.id.slice(0, 4)).join('');
  if (c.age(`responsive_companies:${topic}`) < 24 * 14) return null;
  const h = 'Companies that actually reply';
  const caption = write(c.p, [
    pick(['Companies that actually answer applications.', 'Not every company leaves you on read. These ones reply.', `${top[0].name}: ${top[0].pct}% of applicants heard back.`], c.w, 'hook'),
    top.map((x, i) => `${i + 1}. ${x.name}: ${x.pct}% heard back${x.avg_reply_days ? `, in about ${x.avg_reply_days} days` : ''}`).join('\n'),
    'How this works: applicants mark what happened after they applied. A company is listed only when at least three different people reported, so no single person decides a score.',
    go(c.p, c.w, ['Check a company before you apply:', 'Every company’s reply rate:'], '/companies'),
    clickable(c.p) ? `Add your own outcome, it takes 20 seconds: ${SITE}/feedback` : 'You can add your own outcome too. It takes 20 seconds.',
    tags(c.p, ['hiring', 'jobsearch', 'recruitment', ...top.slice(0, 2).map((x) => companyTag(x.name)), 'candidateexperience']),
  ]);
  return { topic, headline: h, format: 'image', images: [og(c, 'rank', { k: 'Company scores', h, s: 'Share of applicants who heard back', rows: rows(top.map((x) => [x.name, `${x.pct}%`, x.pct, '', x.id])), src: 'From outcomes applicants shared · 3+ people per company', cta: 'Check a company', link: 'madevisa.com/companies' })], caption, links: [link(c, 'Company Scores', '/companies'), link(c, 'Share your outcome', '/feedback')] };
};

const ghosting_stat: Builder = async (c) => {
  const f = await c.data.feedback();
  if (!f || f.total < 30) return null;
  const g = pct(f.no_response, f.total);
  const caption = write(c.p, [
    pick([`How often does an application get no answer at all? ${g}% of the time.`, `${g}%. That’s how many tracked applications never got a reply.`, g >= 50 ? 'If you’ve been ghosted after applying, you’re in the majority.' : 'If you’ve been ghosted after applying, you’re far from alone.'], c.w, 'hook'),
    `Out of ${nf(f.total)} applications people tracked on MadeVisa, ${nf(f.no_response)} heard nothing.`,
    'It’s rarely about you. Some companies answer nearly everyone and some answer nearly no one, and you can see which is which before you spend an evening on the form.',
    go(c.p, c.w, ['Reply rates by company:', 'Check the company first:'], '/companies'),
    c.p !== 'telegram' ? 'What’s the longest you’ve waited for a reply?' : null,
    tags(c.p, ['ghosting', 'jobsearch', 'jobapplication', 'hiring', 'recruitment']),
  ]);
  return { topic: `m${c.now.getUTCMonth()}`, headline: 'The silence number', format: 'image', images: [og(c, 'stat', { k: 'Real outcomes', h: 'Applications that never got an answer', n: `${g}%`, u: `of ${nf(f.total)} tracked applications`, s: 'Some companies reply to almost everyone. You can see which before you apply.', cta: 'See who replies', link: 'madevisa.com/companies', th: 'ink' })], caption, links: [link(c, 'Company Scores', '/companies')] };
};

const PRINCIPLES: { h: string; hl: string; s: string; body: string; path: string }[] = [
  { h: 'A job posted two weeks ago says two weeks ago.', hl: 'two weeks ago', s: 'We never refresh dates to make listings look new.', body: 'Every job on MadeVisa shows the day the employer published it. If it’s been open for a month, you’ll know before you write the cover letter.', path: '/jobs' },
  { h: 'Closed means closed.', hl: 'closed', s: 'When a role leaves the employer’s careers page, it closes here too.', body: 'We check the company’s own careers page. When a role disappears there, it’s marked closed here and then removed, so you don’t apply to a ghost.', path: '/jobs' },
  { h: 'We don’t repost. We go to the source.', hl: 'the source', s: 'Jobs come from the employer’s own careers page.', body: 'Roles on MadeVisa are taken from company career pages, often before they reach the big job boards. Your application goes to the employer’s own site.', path: '/how-it-works' },
  { h: 'Scores come from outcomes, not star ratings.', hl: 'outcomes', s: 'What happened after people applied: a reply, an interview, or silence.', body: 'A company’s score is built from what applicants say happened next, and needs several people before it shows. Promoting a job never changes it.', path: '/companies' },
  { h: 'What the ad doesn’t say shows as “not mentioned”.', hl: 'not mentioned', s: 'Salary, remote work, visa sponsorship. Never guessed.', body: 'If the ad is silent on salary or visas, we say so. We don’t fill the gap with a guess that might send you to the wrong job.', path: '/how-it-works' },
  { h: 'We never pass your details to employers.', hl: 'never', s: 'You apply on the company’s own page. We’re not in the middle.', body: 'MadeVisa doesn’t sell data and doesn’t forward your details. You apply at the source, and your email, phone and nationality are never shown publicly.', path: '/how-it-works' },
  { h: 'Sponsored is always labelled.', hl: 'always labelled', s: 'A company can promote a job. It can’t buy a better score.', body: 'Promoted jobs are marked as promoted. They never get a higher place among the normal results, and never a better Company Score.', path: '/how-it-works' },
];

const principle: Builder = async (c) => {
  const x = choose(c, 'principle', PRINCIPLES.map((p, i) => ({ ...p, i })), (p) => String(p.i), 24 * 21);
  if (!x) return null;
  const caption = write(c.p, [
    x.h,
    x.body,
    go(c.p, c.w, ['How it works:', 'See for yourself:', 'More on how we work:'], x.path),
    tags(c.p, ['jobsearch', 'jobs', 'hiring', 'transparency', 'jobboard']),
  ]);
  return { topic: String(x.i), headline: x.h, format: 'image', images: [og(c, 'text', { k: 'How we work', h: x.h, hl: x.hl, s: x.s, link: bare(x.path), th: x.i % 2 ? 'blue' : 'ink' })], caption, links: [link(c, 'How it works', x.path)] };
};

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

type Theme = { key: string; what: string; chips: string[]; path: string; tags: string[]; cc?: string };

async function themes(c: Ctx): Promise<Theme[]> {
  const snap = await c.data.snapshot();
  const out: Theme[] = [
    { key: 'visa', what: 'jobs that mention visa sponsorship', chips: ['Sponsorship stated in the ad', 'New roles every day', 'Visa routes, explained'], path: '/jobs?visa=1', tags: ['visasponsorship', 'sponsoredjobs'] },
    { key: 'remote', what: 'remote jobs you can do from anywhere', chips: ['Remote and hybrid roles', 'Posted in the last days', 'Straight from career pages'], path: '/jobs?remote=1', tags: ['remotejobs', 'remotework'] },
    { key: 'student', what: 'internships and first jobs abroad', chips: ['Internships and graduate roles', 'New every day', 'Visas for recent graduates'], path: '/jobs?students=1', tags: ['internships', 'graduatejobs'] },
    { key: 'salary', what: 'jobs that show the salary', chips: ['Pay stated in the ad', 'Visa salary minimums checked', 'New roles every day'], path: '/jobs?salary=1', tags: ['salarytransparency'] },
    { key: 'fresh', what: 'jobs the day they open', chips: ['Roles the day they open', 'The real posting date', 'Which companies reply'], path: '/jobs', tags: ['jobs', 'hiring'] },
  ];
  for (const x of (snap?.by_country ?? []).filter((y) => y.iso && y.jobs >= 60).slice(0, 8))
    out.push({ key: `c-${x.iso}`, what: `jobs in ${shortName(x.name)}`, chips: [`${nf(x.jobs)} open roles today`, 'Visa routes, explained', 'Who’s hiring this week'], path: `/jobs?country=${encodeURIComponent(x.name)}`, tags: [`${countryTag(x.name)}jobs`, `workin${countryTag(x.name)}`], cc: x.iso });
  return out;
}

const follow_cta: Builder = async (c) => {
  const all = await themes(c);
  const t = choose(c, 'follow_cta', [...all].sort((a, b) => (hash(`${c.seed % 83}:${a.key}`) % 100) - (hash(`${c.seed % 83}:${b.key}`) % 100)), (x) => x.key, 24 * 25);
  if (!t) return null;
  const who = c.handle || 'MadeVisa';
  const h = `Follow ${who} for ${t.what}`;
  const caption = write(c.p, [
    pick([`Follow for ${t.what}.`, `If you’re looking for ${t.what}, this account is for you.`, `What you get if you follow us:`], c.w, 'hook'),
    t.chips.map((x) => `• ${x}`).join('\n'),
    'No reposts, no “competitive salary”, no jobs that closed last month.',
    go(c.p, c.w, ['Or go straight to the list:', 'The jobs are here:'], t.path),
    tags(c.p, [...t.tags, 'workabroad', 'jobsabroad', 'jobsearch', 'hiring']),
  ]);
  return { topic: t.key, headline: h, format: 'image', images: [og(c, 'cta', { k: 'Follow', n: 'plus', h, hl: who, s: 'Straight from company career pages. No reposts.', rows: rows(t.chips.map((x) => [x])), cc: t.cc, link: 'madevisa.com' })], caption, links: [link(c, 'Jobs', t.path)] };
};

const comment_cta: Builder = async (c) => {
  const all = (await themes(c)).filter((t) => t.key !== 'fresh');
  const t = choose(c, 'comment_cta', [...all].sort((a, b) => (hash(`${c.seed % 79}:${a.key}`) % 100) - (hash(`${c.seed % 79}:${b.key}`) % 100)), (x) => x.key, 24 * 30);
  if (!t) return null;
  const today = t.key.startsWith('c-') ? `today’s ${t.what}` : t.what;
  const h = `Comment “+” and we’ll send you ${today}`;
  const url = `${SITE}${t.path}${t.path.includes('?') ? '&' : '?'}s=${c.p === 'instagram' ? 'ig' : 'tt'}`;
  const caption = write(c.p, [
    pick([`Comment “+” and we’ll send you ${today}.`, `Want ${today}? Write “+” below and we’ll reply with the list.`, `One character is enough: comment “+” for ${today}.`], c.w, 'hook'),
    'We reply to every “+” with the link. It’s a live list, so it’s different tomorrow.',
    t.chips.map((x) => `• ${x}`).join('\n'),
    tags(c.p, [...t.tags, 'workabroad', 'jobsabroad', 'jobsearch']),
  ]);
  return {
    topic: t.key,
    headline: h,
    format: 'image',
    images: [og(c, 'cta', { k: 'Get the list', n: 'comment', h, hl: '“+”', s: 'We reply to every comment with the link.', cc: t.cc, link: 'madevisa.com', th: 'ink' })],
    caption,
    links: [{ title: 'The list', url }],
    meta: { reply: { keyword: '+', text: `Here you go: ${url.replace('https://', '')} — the list updates every day.`, url } },
  };
};

const this_or_that: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const pair = pairFor(c, lib, 'this_or_that', 24 * 30);
  if (!pair) return null;
  const [a, b] = pair;
  const snap = await c.data.snapshot();
  const jobs = (code: string) => snap?.by_country.find((x) => x.iso === code)?.jobs ?? 0;
  const h = `${a.name} or ${shortName(b.name)}: where would you go?`;
  const line = (g: LibCountry) => `${flag(g.code)} ${g.name}: ${jobs(g.code) ? `${nf(jobs(g.code))} open roles, ` : ''}${g.prYears ? `${g.prYears} ${plural(g.prYears, 'year', 'years')} to permanent residence` : 'no fixed route to permanent residence'}, ${g.languages.split(/[,(]/)[0].trim()}`;
  const caption = write(c.p, [
    pick([`${flag(a.code)} ${a.name} or ${flag(b.code)} ${shortName(b.name)}: where would you go?`, `You get one job offer in each. ${flag(a.code)} or ${flag(b.code)}?`, `Quick one: ${a.name} or ${shortName(b.name)}?`], c.w, 'hook'),
    `${line(a)}\n${line(b)}`,
    pick(['Tell us which, and why.', 'Answer below. We’re curious what decides it for you.', 'One word is enough.'], c.w, 'ask'),
    go(c.p, c.w, ['Both countries, side by side:', 'Routes and jobs for both:'], '/destinations'),
    tags(c.p, [countryTag(a.name), countryTag(b.name), 'movingabroad', 'workabroad', 'expat', 'thisorthat']),
  ]);
  return { topic: `${a.code}${b.code}`, headline: h, format: 'image', images: [og(c, 'versus', { k: 'This or that', h: 'Where would you go?', cc: a.code, cc2: b.code, n: a.name, u: b.name, s: 'Tell us in the comments.', link: 'madevisa.com/destinations' })], caption, links: [link(c, 'Destinations', '/destinations')] };
};

const QUESTIONS: { q: string; hl: string; more: string }[] = [
  { q: 'What’s the hardest part of applying for jobs abroad?', hl: 'hardest part', more: 'The visa? The silence after you apply? Not knowing which companies even consider you?' },
  { q: 'Which country is on your list, and what’s stopping you?', hl: 'what’s stopping you', more: 'Language, money, paperwork, family. We’d like to know what the real blocker is.' },
  { q: 'Have you ever asked an employer about visa sponsorship?', hl: 'asked', more: 'What did they say? Or did they just stop replying?' },
  { q: 'How many applications did your last interview take?', hl: 'How many', more: '5? 50? 200? No judgement, we’re collecting real numbers.' },
  { q: 'What would make you move: salary, safety, career or passport?', hl: 'make you move', more: 'Pick one. The answer says a lot about which country fits you.' },
  { q: 'Remote for a foreign company, or relocate?', hl: 'relocate', more: 'Same salary either way. Which would you choose?' },
  { q: 'What’s one thing you wish every job ad said?', hl: 'every job ad', more: 'Salary? Whether they sponsor? Whether anyone will read your application?' },
  { q: 'How long did the last company take to reply to you?', hl: 'How long', more: 'A day, a month, never? Your answer helps the next applicant.' },
];

const question: Builder = async (c) => {
  const x = choose(c, 'question', QUESTIONS.map((q, i) => ({ ...q, i })), (q) => String(q.i), 24 * 30);
  if (!x) return null;
  const caption = write(c.p, [x.q, x.more, pick(['We read every answer.', 'Answer below. We read all of them.', 'Tell us in the comments.'], c.w, 'ask'), tags(c.p, ['workabroad', 'jobsearch', 'movingabroad', 'jobsabroad', 'expat'])]);
  return { topic: String(x.i), headline: x.q, format: 'image', images: [og(c, 'text', { k: 'Question', h: x.q, hl: x.hl, s: 'Tell us in the comments.', link: 'madevisa.com', th: x.i % 2 ? 'ink' : 'blue' })], caption, links: [] };
};

const TIPS: { h: string; hl: string; s: string; body: string[]; lead: string; path: string; tags: string[] }[] = [
  { h: 'Check when the job was really posted.', hl: 'really posted', s: 'A role that’s been open for six weeks is a different bet from one posted yesterday.', body: ['Old listings often get a fresh date so they look new. You end up writing a cover letter for a role that was filled last month.', 'On MadeVisa every job shows the day the employer published it.'], lead: 'Newest first:', path: '/jobs', tags: ['jobsearchtips'] },
  { h: 'Look up the reply rate before you apply.', hl: 'reply rate', s: 'Some companies answer almost everyone. Some answer almost no one.', body: ['An evening on an application form is a lot to give a company that never replies.', 'Company Scores show how often applicants heard back, and how fast.'], lead: 'Check a company:', path: '/companies', tags: ['jobsearchtips', 'ghosting'] },
  { h: 'Apply on the company’s own careers page.', hl: 'own careers page', s: 'It’s the version of the ad the recruiter actually maintains.', body: ['Reposted ads go stale: the role changes or closes, and the copy stays up.', 'Every job on MadeVisa links to the employer’s own posting, and closes here when it closes there.'], lead: 'Jobs from the source:', path: '/jobs', tags: ['jobsearchtips'] },
  { h: 'Filter for sponsorship stated in the ad.', hl: 'stated in the ad', s: 'Start with employers who already said yes in writing.', body: ['If you need a visa, the fastest wins are roles where the ad itself says sponsorship is available.', 'Then go wider: for the rest, a Visa Plan does the asking for you.'], lead: 'Roles that state sponsorship:', path: '/jobs?visa=1', tags: ['visasponsorship', 'jobsearchtips'] },
  { h: 'Check the visa salary minimum before you apply.', hl: 'salary minimum', s: 'A great role below the threshold can’t get you the visa.', body: ['The UK, Germany and the Netherlands all set a minimum salary for their main skilled-work route.', 'On job pages in those countries we compare the advertised pay with that minimum.'], lead: 'Thresholds by country:', path: '/destinations', tags: ['workvisa', 'jobsearchtips'] },
  { h: 'Write down every application you send.', hl: 'every application', s: 'Date, company, what happened. You’ll want it in three weeks.', body: ['Following up at the right time is half of getting a reply, and you can’t follow up on what you’ve forgotten.', 'Mark a job as applied on MadeVisa and we’ll check in with you when it’s time.'], lead: 'Start tracking:', path: '/jobs', tags: ['jobsearchtips'] },
  { h: 'Apply in the first few days.', hl: 'first few days', s: 'Early applications get read before the pile grows.', body: ['Recruiters often start screening as soon as applications arrive, not after the closing date.', 'Sort by newest and look at what opened in the last 24 hours.'], lead: 'Opened today:', path: `/jobs?posted=${encodeURIComponent('Past 24 hours')}`, tags: ['jobsearchtips'] },
  { h: 'A remote role can be step one of a move.', hl: 'step one', s: 'Work for the company first. Talk about relocation once they know you.', body: ['An employer who already trusts your work has a reason to sort out the paperwork.', 'Check where the ad needs you to be based: “remote” often means remote within one country.'], lead: 'Remote roles:', path: '/jobs?remote=1', tags: ['remotejobs', 'jobsearchtips'] },
  { h: 'Tell us your passport once.', hl: 'passport', s: 'The visa routes open to you are different from your neighbour’s.', body: ['Visa rules depend on your citizenship, your degree and your experience.', 'Set them once and the country pages show which routes you’re likely to qualify for.'], lead: 'Check your routes:', path: '/destinations', tags: ['workvisa', 'movingabroad'] },
];

const tip: Builder = async (c) => {
  const x = choose(c, 'tip', TIPS.map((t, i) => ({ ...t, i })), (t) => String(t.i), 24 * 25);
  if (!x) return null;
  const caption = write(c.p, [pick([x.h, `Tip: ${lowerFirst(x.h)}`, x.h], c.w, 'hook'), x.s, ...x.body, go(c.p, c.w, x.lead, x.path), closer(c.p, c.w, 'either', 0.5), tags(c.p, [...x.tags, 'jobsearch', 'workabroad', 'careeradvice', 'jobsabroad'])]);
  return { topic: String(x.i), headline: x.h, format: 'image', images: [og(c, 'text', { k: 'Tip', h: x.h, hl: x.hl, s: x.s, link: bare(x.path), th: x.i % 3 === 0 ? 'ink' : 'blue' })], caption, links: [link(c, 'Read more', x.path)] };
};

const feedback_ask: Builder = async (c) => {
  if (c.age('feedback_ask:ask') < 24 * 10) return null;
  const f = await c.data.feedback();
  const caption = write(c.p, [
    pick(['How did your last application go?', 'No reply, a rejection, an interview, an offer. Which was it?', 'You applied. Then what happened?'], c.w, 'hook'),
    'Tell us in 20 seconds. It’s private: your name is never shown, only the outcome counts toward the company’s reply rate.',
    f && f.total >= 30 ? `${nf(f.total)} outcomes so far, across ${nf(f.companies)} companies. Every one makes the scores more useful for the next person.` : 'Every outcome makes the scores more useful for the next person who applies there.',
    go(c.p, c.w, ['Share yours:', 'Add your outcome:'], '/feedback'),
    tags(c.p, ['jobsearch', 'hiring', 'candidateexperience', 'jobapplication', 'ghosting']),
  ]);
  return { topic: 'ask', headline: 'How did your application go?', format: 'image', images: [og(c, 'cta', { k: 'Hiring feedback', n: 'heart', h: 'How did your last application go?', hl: 'last application', s: '20 seconds, private. It shows the next person which companies reply.', rows: rows([['No reply'], ['Rejected'], ['Interview or offer']]), cta: 'Share it', link: 'madevisa.com/feedback' })], caption, links: [link(c, 'Share feedback', '/feedback')] };
};

const invite: Builder = async (c) => {
  if (c.age('invite:invite') < 24 * 20) return null;
  const caption = write(c.p, [
    pick(['Know someone job hunting abroad? Send them your link.', 'If MadeVisa helped you, there’s a simple way to pass it on.'], c.w, 'hook'),
    'Every account has an invite link. When someone you invited starts MadeVisa Pro, you get 2 extra Visa Plans.',
    'Searching, tracking applications and the visa guides are free for them either way.',
    go(c.p, c.w, ['Your link is in your profile:', 'Find your invite link:'], '/profile'),
    tags(c.p, ['workabroad', 'jobsearch', 'jobsabroad']),
  ]);
  return { topic: 'invite', headline: 'Invite a friend', format: 'image', images: [og(c, 'cta', { k: 'Invite', n: 'plus', h: 'Know someone job hunting abroad?', hl: 'job hunting abroad', s: 'Send them your invite link. You get 2 extra Visa Plans when they start MadeVisa Pro.', cta: 'Get your link', link: 'madevisa.com/profile' })], caption, links: [link(c, 'Profile', '/profile')] };
};

// The free job alert (src/components/jobs/AlertSignup.tsx): "Email me these jobs" on the
// jobs list. One alert is free, sent once a day, one click to unsubscribe.
const job_alert: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const cands = focusFirst(c, (snap?.by_country ?? []).filter((x) => x.new_7d >= 20 && x.iso), (x) => x.iso).slice(0, 12);
  const co = choose(c, 'job_alert', cands, (x) => x.iso, 24 * 30);
  if (!co) return null;
  const name = the(co.name);
  const path = `/jobs?country=${encodeURIComponent(co.name)}`;
  const chips = ['Once a day, only when there are new roles', 'One alert is free', 'Unsubscribe in one click'];
  const caption = write(c.p, [
    pick([`${flag(co.iso)} New jobs in ${name}, in your inbox. Once a day, free.`, `${flag(co.iso)} Stop checking job boards for ${name}. Let the new roles come to you.`, `${flag(co.iso)} ${nf(co.new_7d)} roles opened in ${name} this week. Get the next ones by email.`], c.w, 'hook'),
    'Open the jobs list, pick the country (add a role if you like) and press “Email me these jobs”. That’s the whole set-up.',
    chips.map((x) => `• ${x}`).join('\n'),
    go(c.p, c.w, [`Set it up for ${name}:`, `Start with ${name}:`], path),
    tags(c.p, [`${countryTag(co.name)}jobs`, 'jobalerts', 'workabroad', 'jobsabroad', 'jobsearch']),
  ]);
  return { topic: co.iso, headline: `Job alert: ${co.name}`, format: 'image', images: [og(c, 'cta', { k: 'Free job alert', n: 'plus', h: `New jobs in ${name}, in your inbox`, hl: 'in your inbox', s: 'Straight from company career pages.', rows: rows(chips.map((x) => [x])), cc: co.iso, cta: 'Email me these jobs', link: 'madevisa.com/jobs' })], caption, links: [link(c, `Jobs in ${co.name}`, path)] };
};

// The employer inbox (/employers/inbox): a recruiter signs in with a confirmed work email
// and sees the Visa Plans candidates marked as sent to that company.
const employer_inbox: Builder = async (c) => {
  if (c.age('employer_inbox:inbox') < 24 * 14) return null;
  const caption = write(c.p, [
    pick(['Hiring internationally? Candidates may already have sent your company a Visa Plan.', 'Recruiters: there’s an inbox for the Visa Plans candidates send your company.'], c.w, 'hook'),
    'A Visa Plan is a one-page document a candidate attaches to an application: the visa route for that country, what the employer has to do, and which costs the candidate will cover.',
    'Sign in with your work email and you see every plan sent to your company, and can reply in one click. It’s free for employers. Personal email addresses don’t get access.',
    go(c.p, c.w, ['Open your inbox:', 'See what was sent to your company:'], '/employers/inbox'),
    tags(c.p, ['recruiting', 'hiring', 'talentacquisition', 'visasponsorship']),
  ]);
  return { topic: 'inbox', headline: 'Employer inbox', format: 'image', images: [og(c, 'cta', { k: 'For employers', n: 'plus', h: 'Visa Plans sent to your company, in one inbox', hl: 'in one inbox', s: 'Sign in with your work email at madevisa.com/employers/inbox. Free for employers.', cta: 'Open the inbox', link: 'madevisa.com', th: 'ink' })], caption, links: [link(c, 'Employer inbox', '/employers/inbox')] };
};

const recruiters: Builder = async (c) => {
  if (c.age('recruiters:list') < 24 * 14) return null;
  const n = await c.data.network();
  const caption = write(c.p, [
    pick(['Hiring across borders? Be found by people who can move.', 'Recruiters and hiring managers: there’s a directory for people who hire internationally.'], c.w, 'hook'),
    'List yourself on MadeVisa as a hiring manager, recruiter or visa expert. Candidates see who hires across borders. Your contact details are never shown.',
    n && n.people >= 20 ? `${nf(n.people)} people are listed so far.` : null,
    go(c.p, c.w, ['List yourself:', 'Join the directory:'], '/network'),
    tags(c.p, ['recruiting', 'hiring', 'talentacquisition']),
  ]);
  return { topic: 'list', headline: 'For recruiters', format: 'image', images: [og(c, 'cta', { k: 'For recruiters', n: 'plus', h: 'Hiring across borders? Be found.', hl: 'Be found', s: 'A directory of hiring managers, recruiters and visa experts. Contact details are never shown.', cta: 'List yourself', link: 'madevisa.com/network', th: 'ink' })], caption, links: [link(c, 'Recruiters', '/network')] };
};

const employers: Builder = async (c) => {
  if (c.age('employers:free') < 24 * 14) return null;
  const steps = [
    ['Your jobs, already here', 'If you have a careers page, your roles can appear automatically. No integration, no cost.'],
    ['Own your company page', 'Claim it with verified team access. Add your logo and direct listings.'],
    ['Be known for replying', 'Companies that reply earn higher scores. Candidates see it before they apply.'],
  ];
  const caption = write(c.p, [
    pick(['Your careers page is enough. No integration, no cost.', 'Employers: your open roles may already be on MadeVisa.'], c.w, 'hook'),
    steps.map((s, i) => `${i + 1}. ${s[0]}. ${s[1]}`).join('\n'),
    'And when a candidate from abroad applies with a Visa Plan, you get the visa route, your steps and who pays what on one page.',
    go(c.p, c.w, ['How it works for employers:', 'For employers:'], '/how-it-works'),
    tags(c.p, ['hiring', 'recruiting', 'employerbranding']),
  ]);
  return { topic: 'free', headline: 'For employers', format: 'image', images: [og(c, 'steps', { k: 'For employers', h: 'Your careers page is enough', rows: rows(steps), cta: 'How it works', link: 'madevisa.com/how-it-works' })], caption, links: [link(c, 'How it works', '/how-it-works')] };
};

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

const news: Builder = async (c) => {
  const items = await c.data.news();
  // The item asked for by name, else the newest one this network hasn't posted.
  const n = items.find((x) => x.id === c.want && c.age(`news:${x.id}`) === Infinity) ?? items.find((x) => c.age(`news:${x.id}`) === Infinity);
  if (!n) return null;
  const src = n.source_name || host(n.source_url);
  const path = n.link_path && n.link_path.startsWith('/') ? n.link_path : null;
  const photo = c.photo(n.country_code);
  const caption = write(c.p, [
    `${flag(n.country_code)} ${n.headline}`.trim(),
    n.summary,
    n.points.length ? n.points.map((x) => `• ${x}`).join('\n') : null,
    `Source: ${src}${clickable(c.p) ? ` ${n.source_url}` : ''}`,
    path ? go(c.p, c.w, ['What it means, and the routes:', 'More on MadeVisa:'], path) : null,
    tags(c.p, ['news', 'workabroad', 'visanews', 'movingabroad', 'immigration']),
  ]);
  return {
    topic: n.id,
    headline: n.headline,
    format: 'image',
    images: [og(c, 'news', { k: n.kicker || 'News', h: n.headline, s: n.summary, cc: n.country_code, img: photo?.url, cr: photo?.credit, rows: rows(n.points.slice(0, 3).map((x) => [x])), src: `Source: ${src}`, link: path ? bare(path) : 'madevisa.com' })],
    caption,
    links: [{ title: `Source: ${src}`, url: n.source_url }, ...(path ? [link(c, 'On MadeVisa', path)] : [])],
    meta: { news_id: n.id },
  };
};

const CATEGORY: Record<string, string> = { insights: 'Hiring report', visas: 'Visa guide', guides: 'Career guide', hiring: 'For employers', news: 'News' };

const article: Builder = async (c) => {
  const items = await c.data.articles();
  // The monthly Visa Hiring Report (monthly.ts) comes once a month: it goes first on a network that hasn't posted it.
  const monthly = items.find((x) => /^visa-hiring-report-/.test(x.slug) && c.age(`article:${x.id}`) === Infinity && !c.hot(`article:${x.id}`));
  const a = monthly ?? choose(c, 'article', items, (x) => x.id, 24 * 365);
  if (!a) return null;
  const path = `/blog/${a.slug}`;
  const label = monthly ? 'Monthly report' : CATEGORY[a.category] ?? 'New on the blog';
  // Report titles carry the date range in brackets — fine in a caption, too long on an image.
  const short = a.title.replace(/\s*\([^)]*\)\s*$/, '');
  const photo = c.photo(a.country_code);
  const caption = write(c.p, [
    monthly ? pick([`This month’s report is out. ${short}.`, `${short}.`, `The numbers for last month are in. ${short}.`], c.w, 'hook') : pick([`New on the blog: ${short}.`, `${flag(a.country_code)} ${short}`.trim(), `We just published this: ${short}.`], c.w, 'hook'),
    a.excerpt,
    go(c.p, c.w, ['Read it:', 'The full article:', 'Read the whole thing:'], path),
    tags(c.p, [a.category === 'insights' ? 'hiringreport' : 'visaguide', 'workabroad', 'jobmarket', 'jobsabroad']),
  ]);
  // The monthly report's title carries its two headline numbers ("… — September 2026: 18,420 new jobs, 11% mention sponsorship"): show them big.
  const m = monthly ? a.title.match(/^(.*?)\s*[—–-]\s*([A-Za-z]+ \d{4}):\s*([\d.,]+) new jobs, (\d+)% mention sponsorship/) : null;
  const image = m
    ? og(c, 'stat', { k: label, h: `${m[1]}, ${m[2]}`, n: m[3], u: 'new jobs went live on MadeVisa', s: `${m[4]}% of them mention visa sponsorship. The countries and companies behind the numbers are in the report.`, cta: 'Read the report', link: 'madevisa.com/blog' })
    : og(c, 'hero', { k: label, h: short, s: firstSentence(a.excerpt), cc: a.country_code, img: photo?.url, cr: photo?.credit, cta: 'Read it', link: 'madevisa.com/blog' });
  return { topic: a.id, headline: short, format: 'image', images: [image], caption, links: [link(c, a.title, path)] };
};

const program: Builder = async (c) => {
  const items = await c.data.programs();
  const x = choose(c, 'program', items, (y) => y.id, 24 * 120);
  if (!x) return null;
  const path = `/programs/${x.id}`;
  const closes = x.applications_close_at ? new Date(`${x.applications_close_at}T12:00:00Z`) : null;
  const open = closes && closes.getTime() > c.now.getTime();
  const closeText = closes ? closes.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const facts = [x.publisher ? ['Run by', x.publisher] : null, x.country ? ['Where', x.country] : null, x.funding_text ? ['Funding', x.funding_text] : null, open && closeText ? ['Apply by', closeText] : null].filter(Boolean) as string[][];
  const photo = c.photo(x.iso);
  const caption = write(c.p, [
    pick([`${flag(x.iso)} ${x.title}`.trim(), open ? `${flag(x.iso)} Applications are open: ${x.title}.`.trim() : `${flag(x.iso)} A program worth knowing about: ${x.title}.`.trim()], c.w, 'hook'),
    x.description ? firstSentence(x.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) : null,
    facts.map((f) => `• ${f[0]}: ${f[1]}`).join('\n'),
    x.official_url ? `Official source: ${host(x.official_url)}` : null,
    go(c.p, c.w, ['Who can apply, and how:', 'Eligibility and the official link:'], path),
    tags(c.p, [x.category, x.country ? countryTag(x.country) : '', 'scholarships', 'studyabroad', 'workabroad', 'programs']),
  ]);
  return { topic: x.id, headline: x.title, format: 'image', images: [og(c, 'news', { k: open ? 'Applications open' : 'Program', h: x.title, cc: x.iso, img: photo?.url, cr: photo?.credit, rows: rows(facts.slice(0, 3).map((f) => [`${f[0]}: ${f[1]}`])), src: x.official_url ? `Source: ${host(x.official_url)}` : '', link: 'madevisa.com/programs' })], caption, links: [link(c, x.title, path)] };
};


// ---------------------------------------------------------------------------
// Reels — the same facts as a short vertical video. A builder returns the
// screens (text layers drawn by /api/og/post?t=reel) and what footage to look
// for; program.ts times the layers and scripts/render-reels.mjs makes the MP4.
// The hooks stay inside what the data shows: "is hiring" comes with the real
// number of open roles — no "free", no "nobody is applying".
// ---------------------------------------------------------------------------

const REEL_V = '1';
/** One screen of a reel. `steps` > 1 reveals its lines or rows one by one. */
function scene(sc: 'hook' | 'list' | 'cta' | 'job' | 'follow', q: Record<string, string | null | undefined | false>, o: { steps?: number; step?: number; hold?: number } = {}): ReelScene {
  const sp = new URLSearchParams({ t: 'reel', sc });
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, String(v));
  sp.set('v', REEL_V);
  return { url: `${SITE}/api/og/post?${sp.toString()}`, steps: o.steps ?? 1, step: o.step ?? 0.85, hold: o.hold ?? 2.4 };
}
const lines = (l: (string | null | false | undefined)[]) => l.filter(Boolean).map((x) => String(x).replace(/~/g, ' ')).join('~');
/** Seconds a text needs on screen. */
const readTime = (text: string, min = 2.4) => Math.max(min, Math.min(5.5, 1.1 + text.split(/\s+/).length * 0.34));
/** A city people picture when they hear the country — what to search footage for. */
export const LANDMARK: Record<string, string> = { DE: 'Berlin', GB: 'London', NL: 'Amsterdam', US: 'New York', IE: 'Dublin', FR: 'Paris', ES: 'Madrid', PT: 'Lisbon', CA: 'Toronto', AE: 'Dubai', SE: 'Stockholm', AU: 'Sydney', AT: 'Vienna', BE: 'Brussels', DK: 'Copenhagen', FI: 'Helsinki', IT: 'Rome', JP: 'Tokyo', SG: 'Singapore', EE: 'Tallinn', CY: 'Limassol', PL: 'Warsaw', CH: 'Zurich', NO: 'Oslo', CZ: 'Prague', LU: 'Luxembourg' };
const footage = (iso: string | null | undefined, country: string | null | undefined, city?: string | null) => ({ queries: [...new Set([city ? `${city} people street` : null, iso && LANDMARK[iso.toUpperCase()] ? `${LANDMARK[iso.toUpperCase()]} people walking` : null, city ? `${city} city` : null, iso && LANDMARK[iso.toUpperCase()] ? `${LANDMARK[iso.toUpperCase()]} city` : null, country ? `${country} city` : null, country, 'city skyline'].filter((x): x is string => Boolean(x)))], cc: iso ? iso.toUpperCase() : null });
/** The address on the last screen: the page if it is short enough to read, else its section. */
const pill = (path: string) => (bare(path).length <= 38 ? bare(path) : `madevisa.com/${path.split('?')[0].split('/')[1] ?? ''}`.replace(/\/$/, ''));
/** The word people comment to get the link: "GERMANY", "UK". */
const keyword = (country: string) => (country === 'United Kingdom' ? 'UK' : country === 'United States' ? 'USA' : country === 'United Arab Emirates' ? 'UAE' : country.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 14));
/** Instagram only: the comment prompt on the last screen, and the reply the pipeline sends. */
function commentPrompt(c: Ctx, word: string, path: string): { c: string; s: string; caption: string | null; meta: Record<string, unknown> } {
  if (c.p !== 'instagram') return { c: '', s: '', caption: null, meta: {} };
  const url = `${SITE}${path}${path.includes('?') ? '&' : '?'}s=ig`;
  return { c: `Comment “${word}”`, s: 'We reply with the link. It’s in our bio too.', caption: `Comment “${word}” and we’ll reply with the link.`, meta: { reply: { keyword: word, text: `Here you go: ${url.replace('https://', '')} — it’s a live list, so check back.`, url } } };
}

const reel_country: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const cands = focusFirst(c, (snap?.by_country ?? []).filter((x) => x.jobs >= 40 && x.iso), (x) => x.iso).slice(0, 15);
  const co = choose(c, 'reel_country', cands, (x) => x.iso, 24 * 8);
  if (!co) return null;
  const [r, lib] = await Promise.all([c.data.report(co.iso), c.data.library()]);
  const guide = lib?.countries.find((g) => g.code === co.iso) ?? null;
  const live = r?.live_jobs || co.jobs;
  const new7 = r?.new_7d ?? co.new_7d;
  const companies = r?.companies ?? co.companies;
  const visaPct = r ? Math.round(r.visa_share) : pct(co.visa, co.jobs);
  const cities = (r?.cities ?? []).filter((x) => x.name && x.name !== 'Remote').slice(0, 3).map((x) => x.name);
  const top = (r?.functions ?? [])[0];
  const path = guide ? `/destinations/${guide.slug}` : `/jobs?country=${encodeURIComponent(co.name)}`;
  const name = the(co.name);
  const ask = commentPrompt(c, keyword(co.name), path);
  const facts = [
    [`${nf(new7)} new roles`, 'posted in the last 7 days'],
    [`${nf(companies)} companies hiring`, cities.length ? cities.join(', ') : 'on their own career pages'],
    visaPct >= 1 ? [`${visaPct}% of ads state visa sponsorship`, 'most ads don’t say either way'] : top ? [`Most wanted: ${top.name}`, `${nf(top.jobs)} open roles`] : null,
  ].filter(Boolean) as string[][];
  const caption = write(c.p, [
    pick([`${flag(co.iso)} ${The(co.name)} is hiring: ${nf(live)} open roles right now.`, `${flag(co.iso)} ${nf(live)} open roles in ${name}, counted today.`, `${flag(co.iso)} Looking at ${name}? This is the job market this week.`], c.w, 'hook'),
    [`${nf(new7)} new roles this week from ${nf(companies)} companies.`, visaPct >= 3 ? `${adsSay(visaPct)} visa sponsorship is available.` : null, cities.length >= 2 ? `Most roles: ${list(cities)}.` : null].filter(Boolean).join('\n'),
    ask.caption,
    go(c.p, c.w, guide ? [`The roles and every visa route for ${name}:`, `Jobs and visa routes for ${name}:`] : [`Every open role in ${name}:`], path),
    tags(c.p, [`${countryTag(co.name)}jobs`, `workin${countryTag(co.name)}`, 'visasponsorship', 'workabroad', cities[0], 'jobsabroad', 'hiring']),
  ]);
  return {
    topic: co.iso,
    headline: `${The(co.name)} is hiring`,
    format: 'reel',
    images: [],
    caption,
    links: [link(c, `${co.name}: jobs and visa routes`, path)],
    meta: ask.meta,
    reel: {
      bg: footage(co.iso, co.name, cities[0]),
      scenes: [
        scene('hook', { k: 'Hiring now', cc: co.iso, l: lines([The(co.name), '*is hiring']), s: `${nf(live)} open roles right now` }, { steps: 3, step: 0.8, hold: 2.1 }),
        scene('list', { l: `This week in ${shortName(co.name)}`, rows: rows(facts) }, { steps: facts.length, step: 1.25, hold: 2.5 }),
        scene('cta', { l: lines(['The roles and', '*every visa route']), link: pill(path), c: ask.c, s: ask.s }, { hold: 3.2 }),
      ],
    },
  };
};

const reel_city: Builder = async (c) => {
  const snap = await c.data.snapshot();
  const cands = focusFirst(c, (snap?.by_country ?? []).filter((x) => x.new_7d >= 15 && x.iso), (x) => x.iso).slice(0, 10);
  const tried = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const co = choose(c, 'reel_city', cands.filter((x) => !tried.has(x.iso)), (x) => x.iso, 48);
    if (!co) return null;
    tried.add(co.iso);
    const pool = await c.jobs({ kind: 'fresh', countries: [co.iso], want: 12, min: 3 });
    // The city with the most fresh roles (three or more), one per company.
    const byCity = new Map<string, Job[]>();
    for (const j of pool) if (j.city) byCity.set(j.city, [...(byCity.get(j.city) ?? []), j]);
    const best = [...byCity.entries()].filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length)[0];
    // Not a city this network showed in the last five days.
    if (!best || c.hot(`reel_city:${co.iso}:${best[0]}`) || c.age(`reel_city:${co.iso}:${best[0]}`) < 24 * 5) continue;
    const [city, all] = best;
    const jobs = all.slice(0, 3);
    const path = `/jobs?country=${encodeURIComponent(co.name)}`;
    const word = city.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase();
    const ask = commentPrompt(c, word.length >= 3 && word.length <= 14 ? word : keyword(co.name), path);
    const caption = write(c.p, [
      pick([`${flag(co.iso)} ${city} is hiring. Three roles that opened in the last 24 hours:`, `${flag(co.iso)} New in ${city} today.`, `${flag(co.iso)} ${city}, today: three roles worth a look.`], c.w, 'hook'),
      ...jobBlocks(c, jobs),
      'Each link goes to the job page, and from there to the employer’s own careers site.',
      ask.caption,
      go(c.p, c.w, [`Every open role in ${shortName(co.name)}:`, `All roles in ${shortName(co.name)}, and the visa routes:`], path),
      jobTags(c, jobs, [`${tagOf(city)}jobs`, `${countryTag(co.name)}jobs`]),
    ]);
    return {
      topic: `${co.iso}:${city}`,
      headline: `${city} is hiring`,
      format: 'reel',
      images: [],
      caption,
      links: jobs.map((j) => ({ job_id: j.id, title: cleanTitle(j.title), company: j.company, url: jobLink(j, c.p) })),
      jobs,
      meta: ask.meta,
      reel: {
        bg: footage(co.iso, co.name, city),
        scenes: [
          scene('hook', { k: 'New today', cc: co.iso, l: lines([city, '*is hiring']), s: 'New roles, posted in the last 24 hours' }, { steps: 3, step: 0.8, hold: 2.1 }),
          scene('list', { l: 'Opened today', rows: rows(jobs.map((j) => [cleanTitle(j.title), [j.company, j.salary].filter(Boolean).join(' · ')])) }, { steps: jobs.length, step: 1.3, hold: 2.6 }),
          scene('cta', { l: lines(['Apply on the', '*company’s own page']), link: 'madevisa.com/jobs', c: ask.c, s: ask.c ? ask.s : c.p === 'tiktok' ? 'All three are on madevisa.com/jobs. The link is in our bio.' : 'The three links are in the caption.' }, { hold: 3 }),
        ],
      },
    };
  }
  return null;
};
const tagOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

const reel_route: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const cands = focusFirst(c, allRoutes(lib, ['work', 'talent', 'job-search', 'remote']), (x) => x.g.code);
  const mixed = [...cands].sort((a, b) => (hash(`${c.seed % 97}:r:${a.r.id}`) % 1000) - (hash(`${c.seed % 97}:r:${b.r.id}`) % 1000));
  // Not the route the image format featured lately either.
  const x = choose(c, 'reel_route', (c.settings.focus?.length ? cands : mixed).filter((y) => c.age(`visa_route:${y.r.id}`) >= 24 * 10), (y) => y.r.id, 24 * 45);
  if (!x) return null;
  const { g, r } = x;
  const path = `/destinations/${g.slug}`;
  const short = r.name.replace(/\s*\(.*?\)/, '');
  const needs = r.requires.map((k) => REQ_SHORT[k]).filter(Boolean);
  const facts = [[r.validity, 'how long it lasts'], needs.length ? [needs.slice(0, 3).join(' · '), 'what you need'] : null, r.fee ? [r.fee, 'visa fee'] : null, [r.leadsToPR ? 'Counts toward permanent residence' : 'Doesn’t count toward permanent residence', 'worth knowing if you plan to stay']].filter(Boolean).slice(0, 4) as string[][];
  const summary = typo(firstSentence(r.summary));
  const ask = commentPrompt(c, keyword(g.name), path);
  const caption = write(c.p, [
    pick([`${flag(g.code)} The ${short}, ${g.name}, in 15 seconds.`, `${flag(g.code)} Thinking about ${the(g.name)}? This is the ${short}.`, `${flag(g.code)} One visa route at a time: the ${short}.`], c.w, 'hook'),
    typo(r.summary),
    [`• Valid for: ${lowerFirst(r.validity)}`, r.fee ? `• Fee: ${r.fee}` : null, needs.length ? `• You need: ${list(r.requires.map((k) => REQ[k]).filter(Boolean))}` : null].filter(Boolean).join('\n'),
    `Official source: ${host(r.url)} (checked ${monthLabel(g.reviewed)}). Rules change, so read the source before you apply.`,
    ask.caption,
    go(c.p, c.w, [`All routes for ${the(g.name)}, side by side:`, `Every route for ${the(g.name)}:`], path),
    ask.caption ? null : closer(c.p, c.w, 'save', 0.6),
    tags(c.p, [countryTag(g.name), short, `${countryTag(g.name)}visa`, 'workabroad', 'workvisa', 'movingabroad', `workin${countryTag(g.name)}`]),
  ]);
  return {
    topic: r.id,
    headline: `${short}, ${g.name}`,
    meta: ask.meta,
    format: 'reel',
    images: [],
    caption,
    links: [link(c, `Visa routes: ${g.name}`, path), { title: 'Official source', url: r.url }],
    reel: {
      bg: footage(g.code, g.name),
      scenes: [
        scene('hook', { k: 'Visa route', cc: g.code, l: lines([short, `*${g.name}`]), s: summary.length <= 150 ? summary : '' }, { steps: 3, step: 0.8, hold: Math.min(4, readTime(summary, 2.2)) }),
        scene('list', { l: 'What it asks for', rows: rows(facts) }, { steps: facts.length, step: 1.1, hold: 2.3 }),
        scene('cta', { l: lines(['All routes for', `*${shortName(g.name).replace(/^the /, 'the ')}`]), link: pill(path), c: ask.c, s: `Official source: ${host(r.url)}` }, { hold: 3 }),
      ],
    },
  };
};

const reel_myth: Builder = async (c) => {
  const lib = await c.data.library();
  if (!lib) return null;
  const mixed = [...myths(lib)].sort((a, b) => (hash(`${c.seed % 89}:r:${a.key}`) % 1000) - (hash(`${c.seed % 89}:r:${b.key}`) % 1000));
  const m = choose(c, 'reel_myth', mixed.filter((x) => x.fact.length <= 190 && c.age(`visa_myth:${x.key}`) >= 24 * 14), (x) => x.key, 24 * 60);
  if (!m) return null;
  const country = m.cc ? lib.countries.find((g) => g.code === m.cc)?.name ?? null : null;
  const caption = write(c.p, [
    pick([`“${noDot(m.myth)}.” Not true.`, `Myth: ${lowerFirst(m.myth)}`, `We hear this one a lot: “${noDot(m.myth)}.”`], c.w, 'hook'),
    `What’s actually true:\n${m.fact}`,
    m.src,
    go(c.p, c.w, ['The full picture:', 'Read the details:'], m.path),
    c.p !== 'telegram' ? 'What’s a visa “fact” you were told that turned out to be wrong?' : null,
    tags(c.p, [...m.tags, 'workabroad', 'movingabroad', 'mythvsfact', 'visa']),
  ]);
  return {
    topic: m.key,
    headline: m.myth,
    format: 'reel',
    images: [],
    caption,
    links: [link(c, 'Read more', m.path)],
    reel: {
      bg: footage(m.cc, country),
      scenes: [
        scene('hook', { k: 'Myth', kc: 'red', l: `-${m.myth.replace(/~/g, ' ')}` }, { hold: readTime(m.myth, 2.8) }),
        scene('hook', { k: 'Fact', kc: 'green', cc: m.cc, l: m.fact.replace(/~/g, ' ') }, { hold: readTime(m.fact, 3.4) }),
        scene('cta', { l: lines(['The full', '*picture']), link: pill(m.path), s: m.src }, { hold: 3 }),
      ],
    },
  };
};

const reel_plan: Builder = async (c) => {
  const f = choose(c, 'reel_plan', FLIPS.map((x, i) => ({ ...x, i })).filter((x) => c.age(`plan_flip:${x.i}`) >= 24 * 5), (x) => String(x.i), 24 * 20);
  if (!f) return null;
  // The statement, one sentence per box; the last sentence in blue.
  const parts = f.h.split(/(?<=[.?!”])\s+/).filter(Boolean);
  const steps = [
    ['Pick the job', 'Any role in a country with a checked work route'],
    ['Choose who pays what', 'Your visa fee, flights, translations'],
    ['Attach the one-page plan', 'The route, the employer’s steps, the costs'],
  ];
  const caption = write(c.p, [
    pick(f.hooks, c.w, 'hook'),
    'A Visa Plan is a one-page PDF you attach when you apply. It shows the visa route for that country, what the employer has to do, and which costs you’re willing to cover.',
    steps.map((s, i) => `${i + 1}. ${s[0]}`).join('\n'),
    'Salary is never part of it. Visa salary rules exist so nobody gets underpaid.',
    go(c.p, c.w, ['See how it works:', 'How a Visa Plan works:'], '/offers'),
    tags(c.p, ['visasponsorship', 'visaplan', 'workabroad', 'jobsearch', 'jobsabroad', 'movingabroad']),
  ]);
  return {
    topic: String(f.i),
    headline: f.h,
    format: 'reel',
    images: [],
    caption,
    links: [link(c, 'Visa Plan', '/offers')],
    reel: {
      bg: { queries: ['job interview handshake', 'people working office', 'office city', 'business district'], cc: null },
      scenes: [
        scene('hook', { k: 'Visa Plan', l: lines(parts.map((p, i) => (parts.length > 1 && i === parts.length - 1 ? `*${p}` : p))) }, { steps: parts.length, step: 1.1, hold: readTime(f.h, 2.6) }),
        scene('list', { l: 'How it works', rows: rows(steps) }, { steps: 3, step: 1.3, hold: 2.6 }),
        scene('cta', { l: lines(['See how', '*it works']), link: 'madevisa.com/offers' }, { hold: 3 }),
      ],
    },
  };
};

const reel_news: Builder = async (c) => {
  const items = await c.data.news();
  const n = items.find((x) => x.id === c.want && c.age(`reel_news:${x.id}`) === Infinity) ?? items.find((x) => c.age(`reel_news:${x.id}`) === Infinity);
  if (!n) return null;
  const src = n.source_name || host(n.source_url);
  const path = n.link_path && n.link_path.startsWith('/') ? n.link_path : null;
  const lib = await c.data.library();
  const country = n.country_code ? lib?.countries.find((g) => g.code === n.country_code!.toUpperCase())?.name ?? null : null;
  const caption = write(c.p, [
    `${flag(n.country_code)} ${n.headline}`.trim(),
    n.summary,
    n.points.length ? n.points.map((x) => `• ${x}`).join('\n') : null,
    `Source: ${src}${clickable(c.p) ? ` ${n.source_url}` : ''}`,
    path ? go(c.p, c.w, ['What it means, and the routes:', 'More on MadeVisa:'], path) : null,
    tags(c.p, ['news', 'workabroad', 'visanews', 'movingabroad', 'immigration']),
  ]);
  const points = n.points.slice(0, 3);
  return {
    topic: n.id,
    headline: n.headline,
    format: 'reel',
    images: [],
    caption,
    links: [{ title: `Source: ${src}`, url: n.source_url }, ...(path ? [link(c, 'On MadeVisa', path)] : [])],
    meta: { news_id: n.id },
    reel: {
      bg: footage(n.country_code, country),
      scenes: [
        scene('hook', { k: n.kicker || 'News', kc: 'red', cc: n.country_code, l: n.headline.replace(/~/g, ' ') }, { hold: readTime(n.headline, 3) }),
        ...(points.length ? [scene('list', { l: 'What we know', rows: rows(points.map((x) => [x])) }, { steps: points.length, step: 1.3, hold: 2.6 })] : n.summary ? [scene('hook', { l: `-${n.summary.replace(/~/g, ' ')}` }, { hold: readTime(n.summary, 3) })] : []),
        scene('cta', { l: lines(['Read the', '*official source']), link: path ? pill(path) : 'madevisa.com', s: `Source: ${src}. The link is in the caption.` }, { hold: 3 }),
      ],
    },
  };
};

// ---------------------------------------------------------------------------
// Your application: the CV match
// ---------------------------------------------------------------------------
// Everything said here is how the feature works — no made-up numbers, no
// "users say". CV match (score, missing skills, report) is part of Starter and Pro.

const MATCH_TAGS = ['cv', 'resume', 'cvtips', 'jobsearch', 'workabroad', 'jobsabroad', 'jobapplication'];
/** Footage with people in it: someone working, an interview, a desk — never presented as a named person. */
export const PEOPLE_FOOTAGE = ['woman working on laptop', 'job interview', 'young professional office', 'man typing laptop cafe', 'people working office'];

const MATCHES: { h: string; hl: string; s: string; hooks: string[] }[] = [
  { h: 'How well does your CV match the job?', hl: 'match the job', s: 'One press next to Apply. A score in a second, on every job.', hooks: ['Before you apply: how well does your CV actually match this ad?', 'Most people apply and hope. There’s a quicker way to know where you stand.'] },
  { h: 'Your CV gets read against the ad. Read it that way first.', hl: 'that way first', s: 'Skills, role, years, languages, education: compared in one press.', hooks: ['A recruiter reads your CV with the ad open next to it. You can do the same before you send it.', 'The ad is a checklist. Your CV is the answer sheet. Compare them first.'] },
  { h: 'Apply to fewer jobs. Match them better.', hl: 'Match them better', s: 'See your score on each one, and what’s missing, before you spend an evening on it.', hooks: ['Sending the same CV to fifty ads feels productive. Matching five of them properly works better.', 'Fewer applications, each one checked against the ad.'] },
  { h: 'A strong match and a weak one look the same from your side of the screen.', hl: 'look the same', s: 'Until you check. The button is next to Apply.', hooks: ['You can’t tell a 90% match from a 40% one by reading the ad once. Now you can check.', 'Which of the jobs you saved are you actually a match for?'] },
];

const match_check: Builder = async (c) => {
  const f = choose(c, 'match_check', MATCHES.map((x, i) => ({ ...x, i })), (x) => String(x.i), 24 * 10);
  if (!f) return null;
  const caption = write(c.p, [
    pick(f.hooks, c.w, 'hook'),
    pick(
      [
        'On every job on MadeVisa there’s a button next to Apply: Check your match. It compares your CV with the ad — skills, role, years of experience, languages, education — and gives you a score.',
        'Upload your CV once. Then, on any job, one press compares it with what the ad asks for and shows a score out of 100.',
      ],
      c.w,
      'explain'
    ),
    'CV match is part of MadeVisa Starter and Pro: your score on every job, the skills the ad asks for that your CV doesn’t show, and what to change.',
    go(c.p, c.w, ['Upload your CV and try it:', 'Try it on a job you like:', 'Check yours:'], '/cv-match'),
    c.p !== 'telegram' && chance(0.45, c.w, 'ask') ? 'What’s the lowest match you’d still apply with?' : null,
    tags(c.p, MATCH_TAGS),
  ]);
  return { topic: String(f.i), headline: f.h, format: 'image', images: [og(c, 'text', { k: 'CV match', h: f.h, hl: f.hl, s: f.s, cta: 'Check your match', link: 'madevisa.com/cv-match', th: f.i % 2 ? 'ink' : 'blue' })], caption, links: [link(c, 'CV match', '/cv-match')] };
};

const PARTS: [string, string, string][] = [
  ['Skills', 'Every skill the ad names. Must-haves count in full, nice-to-haves for less.', '40 points'],
  ['Role fit', 'Have you done this kind of job, or one in the same field?', '20 points'],
  ['Experience', 'The years the ad asks for, against the dates on your CV.', '15 points'],
  ['Wording', 'The words the ad repeats, and whether your CV uses them.', '10 points'],
  ['Languages', 'What the ad requires, and the level.', '8 points'],
  ['Education', 'The degree it asks for, if it asks.', '7 points'],
];

const match_parts: Builder = async (c) => {
  if (c.age('match_parts:how') < 24 * 21) return null;
  const total = slides(c, 2);
  const h = 'Where your match score comes from';
  const first = og(c, 'steps', { k: 'CV match', h, hl: 'match score', s: '100 points, six parts.', rows: rows(PARTS.slice(0, 3)), link: 'madevisa.com/cv-match', p: pos(1, total) });
  const second = og(c, 'steps', { k: 'CV match', h: 'And the other 25 points', rows: rows(PARTS.slice(3)), cta: 'Check your match', link: 'madevisa.com/cv-match', p: pos(total, total) });
  const caption = write(c.p, [
    pick(['What does a match score actually measure? Six things.', 'Your CV against the ad, in six parts.', 'Where the points come from when you check your match.'], c.w, 'hook'),
    PARTS.map((x) => `${x[0]} — ${x[2]}. ${x[1]}`).join('\n'),
    'Anything the ad doesn’t ask for is left out, so an ad can’t lower your score with something it never mentioned. Same rules for every job.',
    go(c.p, c.w, ['See your own score:', 'Check a job:'], '/cv-match'),
    closer(c.p, c.w, 'save', 0.6),
    tags(c.p, MATCH_TAGS),
  ]);
  return { topic: 'how', headline: h, format: total > 1 ? 'carousel' : 'image', images: total > 1 ? [first, second] : [first], caption, links: [link(c, 'CV match', '/cv-match')] };
};

const MISSING: { h: string; hl: string; s: string; hooks: string[] }[] = [
  { h: 'You know Excel. Your CV doesn’t say so.', hl: 'doesn’t say so', s: 'To a recruiter’s search, a skill you didn’t write down is a skill you don’t have.', hooks: ['The most common thing missing from a CV isn’t experience. It’s a word.', 'You have the skill. The ad asks for it. Your CV never mentions it.'] },
  { h: 'The ad says Kubernetes. Your CV says “container tools”.', hl: '“container tools”', s: 'Searches match words, not meanings. Use the ad’s own word where it’s true.', hooks: ['Recruiters search for the exact word in the ad. So does screening software.', 'Close isn’t found. The ad’s word is.'] },
  { h: 'The skill is in the job title. It’s on your CV once, in 2019.', hl: 'once, in 2019', s: 'If the ad leads with it, your summary should too.', hooks: ['Where a skill sits on your CV matters almost as much as whether it’s there.', 'One mention in an old bullet point is easy to miss.'] },
  { h: 'Missing from your CV isn’t missing from you.', hl: 'isn’t missing from you', s: 'But only the CV gets read. See what yours leaves out, job by job.', hooks: ['A low match usually means the CV left something out, not that you can’t do the job.', 'The CV is the only part of you the employer has seen.'] },
];

const match_missing: Builder = async (c) => {
  const f = choose(c, 'match_missing', MISSING.map((x, i) => ({ ...x, i })), (x) => String(x.i), 24 * 12);
  if (!f) return null;
  const caption = write(c.p, [
    pick(f.hooks, c.w, 'hook'),
    'When you check your match on MadeVisa, it lists the skills the ad asks for that your CV doesn’t show — the required ones first, then the nice-to-haves.',
    pick(['Add the ones you really have, in the ad’s own words. Leave out the ones you don’t: interviews check, and a visa application repeats what your CV says.', 'Then it’s simple: if you’ve used it, write it down, the way the ad spells it. If you haven’t, don’t.'], c.w, 'guard'),
    'Part of MadeVisa Starter and Pro.',
    go(c.p, c.w, ['See what yours is missing:', 'Check a job:'], '/cv-match'),
    closer(c.p, c.w, 'share', 0.4),
    tags(c.p, MATCH_TAGS),
  ]);
  return { topic: String(f.i), headline: f.h, format: 'image', images: [og(c, 'text', { k: 'CV match', h: f.h, hl: f.hl, s: f.s, cta: 'See what’s missing', link: 'madevisa.com/cv-match', th: f.i % 2 ? 'blue' : 'ink' })], caption, links: [link(c, 'CV match', '/cv-match')] };
};

const CV_FIXES: { id: string; h: string; hl: string; why: string; rows: [string, string][] }[] = [
  { id: 'dates', h: 'No dates on your roles? Nobody can count your experience.', hl: 'count your experience', why: 'An ad that asks for “5+ years” is checked against your dates. No dates, no years.', rows: [['Month and year', '“Mar 2021 – Present”, on every role'], ['One format', 'Not “2021–now” here and “03/21” there'], ['Short roles too', 'Internships and freelance work add up']] },
  { id: 'numbers', h: 'Duties say what you were given. Numbers say what you did.', hl: 'what you did', why: 'A line with a number in it is the one a reader remembers.', rows: [['How many', 'People, customers, stores, tickets'], ['How much', 'Budget, revenue, cost saved'], ['How fast', 'Time cut, deadlines met']] },
  { id: 'skills', h: 'Put your skills where a search can find them.', hl: 'a search can find them', why: 'Recruiters search by skill name. A Skills section is where those names live.', rows: [['One Skills section', 'Tools and methods, by name'], ['The ad’s spelling', '“Power BI”, not “BI tools”'], ['Only what’s true', 'Interviews check it']] },
  { id: 'words', h: 'Use the ad’s words. Where they’re true.', hl: 'Where they’re true', why: 'The words an ad repeats are the ones it will be searched and screened by.', rows: [['Read the requirements', 'Mark the words that come up twice'], ['Find them in your CV', 'Missing? Add them if you’ve done it'], ['The title too', 'A one-line headline under your name']] },
  { id: 'language', h: '“English: good” tells an employer nothing.', hl: 'nothing', why: 'An ad that asks for C1 can only be matched by a CV that states a level.', rows: [['Name the level', 'B2, C1 or native'], ['Add the certificate', 'IELTS, Goethe, DELF, if you have one'], ['List every language', 'Also the ones this ad doesn’t ask for']] },
  { id: 'length', h: 'Two pages. 400 to 800 words.', hl: '400 to 800 words', why: 'Short enough to read, long enough that each role says what you did.', rows: [['Too short', 'Under 250 words leaves no room for results'], ['Too long', 'Over 1,100 and the best lines get lost'], ['Newest first', 'Most detail on your last two roles']] },
  { id: 'scan', h: 'A scanned CV is a picture. Nobody can search a picture.', hl: 'search a picture', why: 'If the text can’t be selected, software and searches see an empty page.', rows: [['Export, don’t scan', 'Save as PDF from Word or Google Docs'], ['Test it', 'Can you select and copy the text?'], ['Keep it simple', 'Plain headings: Experience, Education, Skills']] },
];

const cv_fix: Builder = async (c) => {
  const f = choose(c, 'cv_fix', CV_FIXES, (x) => x.id, 24 * 18);
  if (!f) return null;
  const caption = write(c.p, [
    f.h,
    f.why,
    f.rows.map((r, i) => `${i + 1}. ${r[0]}: ${lowerFirst(r[1])}.`).join('\n'),
    pick(['MadeVisa checks this on your own CV when you check your match (the full report is part of Pro).', 'This is one of the checks MadeVisa runs on your CV when you check your match (Starter and Pro).'], c.w, 'where'),
    go(c.p, c.w, ['Check your CV against a job:', 'Try it:'], '/cv-match'),
    closer(c.p, c.w, 'save', 0.6),
    tags(c.p, MATCH_TAGS),
  ]);
  return { topic: f.id, headline: f.h, format: 'image', images: [og(c, 'steps', { k: 'CV fix', h: f.h, hl: f.hl, rows: rows(f.rows), cta: 'Check your CV', link: 'madevisa.com/cv-match' })], caption, links: [link(c, 'CV match', '/cv-match')] };
};

const match_free: Builder = async (c) => {
  if (c.age('match_free:levels') < 24 * 30) return null;
  const levels: [string, string][] = [
    ['Every job + 1 sponsorship document a month', 'Free, with an account.'],
    ['CV match on every job', 'MadeVisa Starter.'],
    ['Auto Apply + 50 documents a month', 'MadeVisa Pro.'],
  ];
  const h = 'What’s free, and what the plan adds';
  const caption = write(c.p, [
    pick(['What you get on MadeVisa without paying, and what Pro adds.', 'Free, free with an account, and Pro. Here’s the split.'], c.w, 'hook'),
    levels.map((l) => `${l[0]} — ${lowerFirst(l[1])}`).join('\n'),
    'Starter and Pro are monthly plans in US dollars, the same price in every country. Cancel any time.',
    go(c.p, c.w, ['The price for your country:', 'See it here:'], '/pricing'),
    tags(c.p, ['cv', 'jobsearch', 'workabroad', 'jobsabroad', 'visasponsorship']),
  ]);
  return { topic: 'levels', headline: h, format: 'image', images: [og(c, 'steps', { k: 'CV match', h, hl: 'free', rows: rows(levels), cta: 'See pricing', link: 'madevisa.com/pricing' })], caption, links: [link(c, 'Pricing', '/pricing')] };
};

const reel_match: Builder = async (c) => {
  const f = choose(c, 'reel_match', MATCHES.map((x, i) => ({ ...x, i })).filter((x) => c.age(`match_check:${x.i}`) >= 24 * 4), (x) => String(x.i), 24 * 16);
  if (!f) return null;
  const parts = f.h.split(/(?<=[.?!”])\s+/).filter(Boolean);
  const gets: [string, string][] = [
    ['A score', 'On every job'],
    ['What’s missing', 'Skills the ad asks for'],
    ['What to change', 'Before you send it'],
  ];
  const caption = write(c.p, [
    pick(f.hooks, c.w, 'hook'),
    'Upload your CV once on MadeVisa. On any job, press Check your match next to Apply: your CV is compared with the ad and you get a score out of 100.',
    gets.map((g, i) => `${i + 1}. ${g[0]}: ${lowerFirst(g[1])}`).join('\n'),
    'Part of MadeVisa Starter and Pro.',
    go(c.p, c.w, ['Try it:', 'Check yours:'], '/cv-match'),
    tags(c.p, MATCH_TAGS),
  ]);
  return {
    topic: String(f.i),
    headline: f.h,
    format: 'reel',
    images: [],
    caption,
    links: [link(c, 'CV match', '/cv-match')],
    reel: {
      bg: { queries: PEOPLE_FOOTAGE, cc: null },
      scenes: [
        scene('hook', { k: 'CV match', l: lines(parts.map((p, i) => (parts.length > 1 && i === parts.length - 1 ? `*${p}` : p))) }, { steps: parts.length, step: 1.1, hold: readTime(f.h, 2.6) }),
        scene('list', { l: 'One press next to Apply', rows: rows(gets) }, { steps: 3, step: 1.2, hold: 2.6 }),
        scene('cta', { l: lines(['Check your', '*match']), link: 'madevisa.com/cv-match', s: 'Free on every job.' }, { hold: 3 }),
      ],
    },
  };
};

const reel_cvfix: Builder = async (c) => {
  const f = choose(c, 'reel_cvfix', CV_FIXES.filter((x) => c.age(`cv_fix:${x.id}`) >= 24 * 4), (x) => x.id, 24 * 20);
  if (!f) return null;
  const parts = f.h.split(/(?<=[.?!”])\s+/).filter(Boolean);
  const caption = write(c.p, [
    f.h,
    f.why,
    f.rows.map((r, i) => `${i + 1}. ${r[0]}: ${lowerFirst(r[1])}.`).join('\n'),
    go(c.p, c.w, ['Check your CV against a job:', 'Try it on your own CV:'], '/cv-match'),
    closer(c.p, c.w, 'save', 0.5),
    tags(c.p, MATCH_TAGS),
  ]);
  return {
    topic: f.id,
    headline: f.h,
    format: 'reel',
    images: [],
    caption,
    links: [link(c, 'CV match', '/cv-match')],
    reel: {
      bg: { queries: ['writing resume laptop', ...PEOPLE_FOOTAGE], cc: null },
      scenes: [
        scene('hook', { k: 'CV fix', l: lines(parts.map((p, i) => (parts.length > 1 && i === parts.length - 1 ? `*${p}` : p))) }, { steps: parts.length, step: 1.1, hold: readTime(f.h, 2.6) }),
        scene('list', { l: 'The fix', rows: rows(f.rows) }, { steps: f.rows.length, step: 1.3, hold: 2.6 }),
        scene('cta', { l: lines(['Check your', '*CV']), link: 'madevisa.com/cv-match' }, { hold: 3 }),
      ],
    },
  };
};

// --- Channel-style job links (Telegram, Facebook) ---------------------------------
// The way job channels post: no intro, no image, one line per role.
//   💼 Senior Backend Engineer (Blockchain/Crypto): Link
// On Telegram "Link" is the tappable word (HTML); Facebook can't hide a URL behind a
// word, so the link is written out. One company per line, never a job posted here before.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const jobs_links: Builder = async (c) => {
  const jobs = await c.jobs({ kind: 'fresh', want: c.p === 'telegram' ? 5 : 4, min: 2 });
  if (jobs.length < 2) return null;
  const lines = jobs.map((j) => {
    const title = cleanTitle(j.title).replace(/\s+/g, ' ').slice(0, 110);
    return c.p === 'telegram' ? `💼 ${esc(title)}: <a href="${esc(jobLink(j, c.p))}">Link</a>` : `💼 ${title}: ${jobLink(j, c.p)}`;
  });
  return {
    topic: jobs.map((j) => j.id.slice(0, 8)).join(','),
    headline: `${jobs.length} job links`,
    format: 'text',
    images: [],
    caption: lines.join('\n'),
    links: jobs.map((j) => ({ job_id: j.id, title: cleanTitle(j.title), company: j.company, url: jobLink(j, c.p) })),
    jobs,
    meta: { parse_mode: c.p === 'telegram' ? 'HTML' : null },
  };
};

// --- "We are hiring" card (Instagram) -----------------------------------------------
// One role from a company that has never been on the account, drawn as a clean hiring
// poster by /api/og/social?layout=hiring. "Send your CV to" only when the ad itself
// gives an email; otherwise the job's short link.

const hiring_card: Builder = async (c) => {
  const pool = await c.jobs({ kind: 'fresh', want: 6, min: 1, newCompanies: true });
  if (!pool.length) return null;
  // A logo makes the card; a job without one goes only when nothing else is there.
  const j = pool.find((x) => x.logo) ?? pool[0];
  const contact = (await c.data.contacts([j.id])).get(j.id) ?? null;
  const title = cleanTitle(j.title);
  const where = place(j);
  const mode = j.work_arrangement === 'hybrid' ? 'Hybrid' : isRemote(j) ? 'Remote' : 'Onsite';
  const handle = (c.handle || '@madevisacom').replace(/^@/, '');
  const q = new URLSearchParams({ layout: 'hiring', size: c.size, ids: j.id.slice(0, 8), s: c.p.slice(0, 2), fh: handle, v: '2' });
  if (contact?.email) q.set('em', contact.email);
  const short = `madevisa.com/j/${j.id.slice(0, 8)}`;
  const linkWord = c.p === 'instagram' || c.p === 'tiktok' ? ' Link in bio.' : '';
  const caption = write(c.p, [
    `${flag(j.iso)} ${j.company} is hiring: ${title}${where ? ` in ${where}` : ''}`.trim(),
    [`🏢 ${mode}`, j.employment_type ? `🕒 ${j.employment_type}` : null, j.salary ? `💰 ${j.salary}` : null, j.visa ? '🛂 Visa sponsorship stated in the ad' : null].filter(Boolean).join('\n'),
    contact?.email ? `📩 Send your CV to ${contact.email} or apply on ${short}.${linkWord}` : `📩 Apply: ${short}.${linkWord}`,
    '📊 See your CV match score for this job on MadeVisa.',
    `🔔 Follow @${handle} for new job opportunities every day.`,
    jobTags(c, [j], ['hiring', 'jobopportunity', j.job_function ?? '']),
  ]);
  return {
    topic: j.id.slice(0, 8),
    headline: `${j.company} is hiring: ${title}`,
    format: 'image',
    images: [`${SITE}/api/og/social?${q.toString()}`],
    caption,
    links: [{ job_id: j.id, title, company: j.company, url: jobLink(j, c.p) }],
    jobs: [j],
    meta: { company: j.company, contact: contact?.email ?? null },
  };
};

// --- Fast job reel: one white screen per opportunity --------------------------------
// "<Company> is hiring · Role · flag Place", 1.7 seconds each, three roles from three
// different kinds of work, then "Follow @madevisacom". No line-by-line text animation;
// the first screen (a real job) is the thumbnail.

const reel_hiring: Builder = async (c) => {
  const jobs = await c.jobs({ kind: 'fresh', want: 3, min: 2 });
  if (jobs.length < 2) return null;
  const handle = (c.handle || '@madevisacom').replace(/^@/, '');
  const jobScreen = (j: Job) => {
    const where = place(j);
    const extra = j.visa ? 'Visa sponsorship in the ad' : j.salary ? j.salary : isRemote(j) ? 'Remote' : j.work_arrangement === 'hybrid' ? 'Hybrid' : '';
    return scene('job', { l: cleanTitle(j.title), co: j.company, pl: where, cc: j.iso ?? '', logo: j.logo && /^https:\/\//.test(j.logo) ? j.logo : '', s: extra, fh: handle }, { hold: 1.7 });
  };
  const first = jobs[0];
  const caption = write(c.p, [
    `${flag(first.iso)} ${first.company} is hiring: ${cleanTitle(first.title)}${place(first) ? ` in ${place(first)}` : ''}`.trim(),
    jobs
      .slice(1)
      .map((j) => `${flag(j.iso)} ${j.company} is hiring: ${cleanTitle(j.title)}${place(j) ? ` in ${place(j)}` : ''}`.trim())
      .join('\n'),
    jobs.map((j) => `👉 ${cleanTitle(j.title)}: ${jobLink(j, c.p)}`).join('\n'),
    '📊 Check your CV match score for each one on MadeVisa.',
    `🔔 Follow @${handle} for new job opportunities every day.`,
    jobTags(c, jobs, ['hiring', 'jobopportunity']),
  ]);
  return {
    topic: jobs.map((j) => j.id.slice(0, 8)).join(','),
    headline: `${first.company} is hiring: ${cleanTitle(first.title)}`,
    format: 'reel',
    images: [],
    caption,
    links: jobs.map((j) => ({ job_id: j.id, title: cleanTitle(j.title), company: j.company, url: jobLink(j, c.p) })),
    jobs,
    reel: {
      bg: { queries: [], cc: null, plain: true },
      scenes: [...jobs.map(jobScreen), scene('follow', { fh: handle }, { hold: 1.6 })],
    },
  };
};

export const BUILDERS: Record<string, Builder> = {
  jobs_fresh, jobs_country, jobs_visa, jobs_remote, jobs_student, jobs_uk_sponsors, jobs_salary, job_spotlight, jobs_plan, jobs_links, hiring_card,
  country_hiring, country_ranking, sponsor_ranking, top_companies, roles_in_demand, market_pulse, remote_share, milestone,
  visa_route, visa_jobsearch, visa_nomad, visa_pr, visa_salary, visa_compare, visa_myth, visa_checklist,
  match_check, match_parts, match_missing, cv_fix, match_free,
  plan_flip, plan_steps, plan_employer, plan_costs,
  feedback_stats, responsive_companies, ghosting_stat, principle,
  follow_cta, comment_cta, this_or_that, question, tip, feedback_ask, invite, recruiters, employers, job_alert, employer_inbox,
  news, article, program,
  reel_country, reel_city, reel_route, reel_myth, reel_plan, reel_news, reel_match, reel_cvfix, reel_hiring,
};
