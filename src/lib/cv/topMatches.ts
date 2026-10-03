// "The jobs you match most" — one search per CV.
//
// How it works
//   1. Shortlist. From the CV's job titles, roles and main skills we take a
//      few words and ask the server for the live jobs whose TITLE contains
//      them (cv_job_shortlist, migration 20261128090000). Only those words
//      are sent — never the CV. Without the migration, the full job list
//      this browser already keeps is filtered the same way.
//   2. Read. The ads of the ~48 closest jobs are downloaded; ads in another
//      language are swapped for their English translation where there is one.
//   3. Score. Each ad is compared with the CV by the same rules as "Check
//      your match" on a job page, and the list is sorted by score.
//
// The result is kept for 24 hours for that CV (localStorage), so coming
// back, opening jobs and the "recommended for you" lists cost nothing.
// A new CV starts a new search.

import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { classifyJob } from '@/lib/jobTaxonomy';
import { fetchPublishedSponsoredJobs } from '@/lib/sponsoredJobs';
import { formatSalary, type SalaryPeriod, type SalaryStatus } from '@/lib/listingCategories';
import { toUsd } from '@/lib/pricing';
import type { CvProfile } from '@/lib/cv/cvProfile';
import { parseJob } from '@/lib/cv/jobProfile';
import { labelFor, matchCv, type MatchResult } from '@/lib/cv/match';
import { skillName } from '@/lib/cv/skills';
import { TITLE_NOISE } from '@/lib/cv/text';
import { useCv, type StoredCv } from '@/lib/cv/store';
import { cvInEnglish, jobsInEnglish, type EnglishCv } from '@/lib/cv/translate';

export type TopMatch = {
  /** Job uuid — also the key "Check your match" uses for this job. */
  id: string;
  title: string;
  company: string;
  logo: string | null;
  country: string | null;
  cc: string | null;
  city: string | null;
  remote: boolean;
  score: number;
  label: MatchResult['label'];
  /** The ad was compared in its English translation. */
  translated: boolean;
  /** Pay as the ad shows it ("EUR 60,000–75,000/year"), or null. */
  salary: string | null;
  /** The lowest pay the ad shows, as US dollars a year (only for ads that give numbers). */
  payUsdYear: number | null;
  /** What the ad says about visa sponsorship. */
  visa: 'offered' | 'not_offered' | null;
  /** When the company posted it. */
  postedAt: string | null;
  /** Skills the ad names, and how many of them the CV shows. */
  asked: number;
  covered: number;
  /** Skills the ad names that the CV doesn't mention — required ones first (at most 8). */
  missing: string[];
  /** The score this job would get if the CV mentioned every skill the ad names. Never below `score`. */
  potential: number;
};
export type TopResult = {
  /** Shape of the saved result; older ones are searched again. */
  v: 3;
  cvAt: string;
  at: number;
  /** Ads read and scored. */
  read: number;
  /** Jobs whose title was close enough to consider. */
  pool: number;
  items: TopMatch[];
  /** The CV is in another language and couldn't be translated (guests). */
  cvForeign: boolean;
  /** Things to fix on the CV itself — the same for every job (no dates, few numbers, no Skills section…). */
  tips: string[];
};

export type Stage = 'jobs' | 'reading' | 'translating' | 'scoring';
export type TopState = {
  status: 'idle' | 'running' | 'done' | 'error';
  stage: Stage | null;
  /** 0–1 */
  progress: number;
  result: TopResult | null;
  error: string | null;
};

const KEY = 'mv:cvTop';
export const TOP_TTL_MS = 24 * 60 * 60 * 1000;
const READ = 48; // ads compared per search
const KEEP = 40; // results remembered
/** Below this a job isn't called a match at all. */
export const MIN_SCORE = 45;

function readSaved(cv: StoredCv | null): TopResult | null {
  if (!cv) return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as TopResult | null;
    if (v && v.v === 3 && v.cvAt === cv.at && Date.now() - v.at < TOP_TTL_MS && Array.isArray(v.items)) return v;
  } catch {
    /* ignore */
  }
  return null;
}
function writeSaved(r: TopResult) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

// --- Words for the shortlist ---------------------------------------------------

const WORD = /^[a-z0-9+#.]{2,30}$/;
const GENERIC = new Set('and of the for in at to with a an specialist officer executive professional expert worker member consultant coordinator representative'.split(' '));
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^[.]+|[.]+$/g, ''))
    .filter((w) => WORD.test(w) && !TITLE_NOISE.has(w) && !GENERIC.has(w) && !/^\d+$/.test(w));

/** Title words (strong) and skill words (weaker) that describe this CV. */
export function shortlistWords(p: CvProfile): { title: string[]; skill: string[] } {
  const title = new Set<string>();
  for (const t of p.titles.slice(0, 5)) for (const w of tokens(t)) title.add(w);
  for (const r of p.roles.slice(0, 3)) for (const w of tokens(r.label.replace(/\(other\)/i, ''))) title.add(w);
  const skill = new Set<string>();
  for (const [id] of Object.entries(p.skills).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    const name = skillName(id).toLowerCase();
    // Single words only: "java", "sap", "c#". ("power bi" in a title is rare and would need both words.)
    if (WORD.test(name) && name.length >= 2 && !title.has(name)) skill.add(name);
  }
  return { title: [...title].slice(0, 24), skill: [...skill].slice(0, 24) };
}

type Light = { id: string; title: string; job_function: string | null; experience_level: string | null; city: string | null; remote: boolean; created_at: string; publisher_id: string | null; company: string | null; logo_url: string | null; country: string | null; cc: string | null; hits: number };

const wordRe = (w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.+#]/g, '\\$&')}${w.length < 5 ? '($|[^a-z0-9+#])' : ''}`);

/** The same shortlist, made in the browser from the job list it already keeps (used until the migration is run). */
async function localShortlist(words: { title: string[]; skill: string[] }, limit: number): Promise<Light[]> {
  const jobs = await fetchPublishedSponsoredJobs();
  const tw = words.title.map(wordRe);
  const sw = words.skill.map(wordRe);
  const out: Light[] = [];
  for (const j of jobs) {
    if (j.status !== 'published') continue;
    const t = j.title.toLowerCase();
    const hits = 3 * tw.filter((re) => re.test(t)).length + sw.filter((re) => re.test(t)).length;
    if (!hits) continue;
    out.push({ id: j.id, title: j.title, job_function: j.job_function, experience_level: j.experience_level, city: j.city, remote: j.remote, created_at: j.created_at, publisher_id: j.publisher_id, company: j.publisher?.name ?? null, logo_url: j.publisher?.logo_url ?? null, country: j.country?.name ?? null, cc: j.country?.iso_code ?? null, hits });
  }
  return out.sort((a, b) => b.hits - a.hits || b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

type AdRow = {
  id: string;
  html: string | null;
  exp: string | null;
  salary_status?: SalaryStatus;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  salary_period?: SalaryPeriod;
  compensation_text?: string | null;
  visa_sponsorship?: boolean | null;
  visa_status?: 'offered' | 'not_offered' | null;
  source_posted_at?: string | null;
  created_at?: string | null;
};

const PER_YEAR: Record<SalaryPeriod, number> = { hour: 2000, day: 230, week: 48, month: 12, year: 1 };
/** The lowest pay an ad states, as US dollars a year. Only for ads with real numbers. */
function payUsdYear(x: AdRow): number | null {
  if (x.salary_status !== 'disclosed') return null;
  const low = x.salary_min || x.salary_max;
  if (!low) return null;
  const usd = toUsd(low * PER_YEAR[x.salary_period ?? 'year'], x.salary_currency ?? 'USD');
  // Outside any plausible yearly pay: a typo or the wrong period in the ad — leave it out.
  return usd && usd >= 3_000 && usd <= 1_500_000 ? Math.round(usd) : null;
}

/** Which of the shortlisted jobs to actually read: same role first, then same field, at most 3 per company. */
function choose(rows: Light[], p: CvProfile, n: number): Light[] {
  const ranked = rows
    .map((r) => {
      const c = classifyJob(r.title, r.job_function);
      const role = c && p.roles.some((x) => x.label === c.label) ? 4 : c && p.roles.some((x) => x.group === c.group) ? 2 : 0;
      return { r, rank: r.hits + role };
    })
    .sort((a, b) => b.rank - a.rank || b.r.created_at.localeCompare(a.r.created_at));
  const perCompany = new Map<string, number>();
  const out: Light[] = [];
  const titles = new Set<string>();
  for (const { r } of ranked) {
    const company = r.publisher_id ?? r.company ?? '';
    const seen = perCompany.get(company) ?? 0;
    // The same title at the same company in five cities is one job as far as matching goes.
    const twin = `${company}:${r.title.toLowerCase()}`;
    if (seen >= 3 || titles.has(twin)) continue;
    perCompany.set(company, seen + 1);
    titles.add(twin);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

// --- The search ------------------------------------------------------------------

let state: TopState = { status: 'idle', stage: null, progress: 0, result: null, error: null };
const listeners = new Set<() => void>();
const set = (next: Partial<TopState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
let runningFor: string | null = null;
/** No shortlist function on the server (migration not run): use the browser's job list. */
let rpcMissing = false;

async function search(cv: StoredCv, userId: string | null, light = false): Promise<void> {
  if (runningFor === cv.at) return;
  // A job page only searches the light way (the server's shortlist); the full job list is too much to load there.
  if (light && rpcMissing) return;
  runningFor = cv.at;
  set({ status: 'running', stage: 'jobs', progress: 0.05, error: null });
  try {
    // The CV in English (translated for accounts when it is in another language).
    const me: EnglishCv = await cvInEnglish(cv, userId);
    const words = shortlistWords(me.profile);
    if (!words.title.length && !words.skill.length) {
      const empty: TopResult = { v: 3, cvAt: cv.at, at: Date.now(), read: 0, pool: 0, items: [], cvForeign: me.state === 'foreign', tips: [] };
      writeSaved(empty);
      return set({ status: 'done', stage: null, progress: 1, result: empty });
    }

    let pool: Light[] | null = null;
    if (!rpcMissing) {
      const { data, error } = await supabase.rpc('cv_job_shortlist', { p_title_words: words.title, p_skill_words: words.skill, p_limit: 160 });
      if (error) rpcMissing = /function|schema cache|does not exist|not find/i.test(error.message);
      else pool = (data ?? []) as Light[];
      if (error && !rpcMissing) throw new Error(error.message);
    }
    if (!pool && light) return set({ status: 'idle', stage: null, progress: 0 });
    if (!pool) pool = await localShortlist(words, 160);
    if (runningFor !== cv.at) return;
    const chosen = choose(pool, me.profile, READ);
    set({ stage: 'reading', progress: 0.2 });

    // The ads themselves, twelve at a time — as the job page shows them (the cleaned
    // text saved by the job-facts detector), so the score here and there is the same.
    const texts = new Map<string, string>();
    const expHint = new Map<string, string>();
    const extra = new Map<string, AdRow>();
    const FULL = 'id, html:facts->>html, exp:facts->facts->>experience, salary_status, salary_min, salary_max, salary_currency, salary_period, compensation_text, visa_sponsorship, visa_status, source_posted_at, created_at';
    let cols = FULL;
    for (let i = 0; i < chosen.length; i += 12) {
      const ids = chosen.slice(i, i + 12).map((r) => r.id);
      let res = await supabase.from('sponsored_jobs').select(cols).in('id', ids);
      // An older database without one of the extra columns: the ad text alone is enough.
      if (res.error && cols === FULL && /column|schema cache/i.test(res.error.message)) {
        cols = 'id, html:facts->>html, exp:facts->facts->>experience';
        res = await supabase.from('sponsored_jobs').select(cols).in('id', ids);
      }
      if (res.error) throw new Error(res.error.message);
      const rows = (res.data ?? []) as unknown as AdRow[];
      for (const row of rows) {
        if (row.html) texts.set(row.id, row.html);
        if (row.exp) expHint.set(row.id, row.exp);
        extra.set(row.id, row);
      }
      // Not analysed yet (rare): the ad as it was imported.
      const bare = ids.filter((id) => !texts.has(id));
      if (bare.length) {
        const raw = await supabase.from('sponsored_jobs').select('id, description').in('id', bare);
        for (const row of (raw.data ?? []) as { id: string; description: string | null }[]) if (row.description) texts.set(row.id, row.description);
      }
      if (runningFor !== cv.at) return;
      set({ progress: 0.2 + 0.5 * Math.min(1, (i + 12) / Math.max(1, chosen.length)) });
    }

    // Ads in another language → English, where possible.
    const readable = chosen.filter((r) => texts.has(r.id));
    const english = await jobsInEnglish(
      readable.map((r) => ({ id: r.id, title: r.title, description: texts.get(r.id)! })),
      (done, total) => set({ stage: 'translating', progress: 0.7 + 0.2 * (done / Math.max(1, total)) }),
    );
    if (runningFor !== cv.at) return;
    set({ stage: 'scoring', progress: 0.92 });

    const items: TopMatch[] = [];
    let tips: string[] = [];
    for (const r of readable) {
      const ad = english.get(r.id)!;
      const job = parseJob({ title: ad.title, description: ad.description, department: r.job_function, experienceHint: r.experience_level || expHint.get(r.id) || null });
      const m = matchCv(me.profile, me.text, job);
      if (!items.length) tips = m.health.filter((h) => !h.ok).map((h) => h.text);
      // The same job, scored as if the CV mentioned every skill the ad names: how far the CV's wording alone can move it.
      const full = m.skills.covered < m.skills.asked ? matchCv({ ...me.profile, skills: { ...me.profile.skills, ...Object.fromEntries(job.skills.map((s) => [s.id, Math.max(2, me.profile.skills[s.id] ?? 0)])) } }, me.text, job).score : m.score;
      const x = extra.get(r.id);
      items.push({
        id: r.id, title: r.title, company: r.company ?? 'Company', logo: r.logo_url, country: r.country, cc: r.cc, city: r.city, remote: r.remote,
        score: m.score, label: labelFor(m.score), translated: ad.translated,
        salary: x ? formatSalary(x) : null,
        payUsdYear: x ? payUsdYear(x) : null,
        visa: x?.visa_status ?? (x?.visa_sponsorship ? 'offered' : null),
        postedAt: x?.source_posted_at ?? x?.created_at ?? r.created_at ?? null,
        asked: m.skills.asked, covered: m.skills.covered,
        missing: m.skills.missing.slice(0, 8).map((k) => k.name),
        potential: Math.max(m.score, full),
      });
    }
    items.sort((a, b) => b.score - a.score);
    const result: TopResult = { v: 3, cvAt: cv.at, at: Date.now(), read: readable.length, pool: pool.length, items: items.filter((x) => x.score >= MIN_SCORE).slice(0, KEEP), cvForeign: me.state === 'foreign', tips };
    writeSaved(result);
    set({ status: 'done', stage: null, progress: 1, result });
  } catch (e) {
    set({ status: 'error', stage: null, error: e instanceof Error ? e.message : 'The search could not be finished.' });
  } finally {
    if (runningFor === cv.at) runningFor = null;
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

/**
 * The best matches for the visitor's CV.
 * `auto`: start a search by itself when there is a CV and no result from the
 * last 24 hours (the /cv-match page). Without it only a saved result is
 * shown — job pages wait `autoDelayMs` so the page itself loads first, and
 * pass `light` so only the server-side shortlist is used.
 */
export function useTopMatches(opts: { auto?: boolean; autoDelayMs?: number; light?: boolean } = {}): TopState & { cv: StoredCv | null; cvReady: boolean; start: () => void } {
  const { user, loading: authLoading } = useAuth();
  const { cv, ready } = useCv();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!ready || authLoading) return;
    if (!cv) {
      if (state.result || state.status !== 'idle') set({ status: 'idle', stage: null, progress: 0, result: null, error: null });
      return;
    }
    if (state.result?.cvAt === cv.at && state.status !== 'error') return;
    const saved = readSaved(cv);
    if (saved) return set({ status: 'done', stage: null, progress: 1, result: saved, error: null });
    if (state.result) set({ result: null, status: 'idle' });
    if (!opts.auto || runningFor === cv.at) return;
    const t = window.setTimeout(() => void search(cv, userId, opts.light), opts.autoDelayMs ?? 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, ready, authLoading, userId, opts.auto]);

  // A result for an earlier CV is never shown for the current one.
  const mine = s.result && cv && s.result.cvAt === cv.at ? s.result : null;
  return { ...s, result: mine, cv, cvReady: ready && !authLoading, start: () => cv && void search(cv, userId) };
}

/** Score from the last search for one job (for lists and buttons), or null. */
export function topScore(cv: StoredCv | null, jobId: string): number | null {
  const r = state.result?.cvAt === cv?.at ? state.result : readSaved(cv);
  return r?.items.find((x) => x.id === jobId)?.score ?? null;
}
