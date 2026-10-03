// English versions of job ads and CVs written in another language.
//
// MadeVisa's match rules read English best. When an ad (or the CV) is in
// another language it is translated once on the server (the `translate`
// edge function, migration 20261128090000), saved, and compared in English.
//
//   • Job ads: public text, translated once per job and reused by everyone.
//   • CVs: only for people with an account (the CV is already stored with
//     it); the English version is saved next to the CV. A guest's CV never
//     leaves the browser, so it is compared in its own language.
//
// Translation is optional. If the function isn't deployed, has no key, or
// the month's budget is used up, everything falls back to comparing the
// original texts — the same as before this file existed.

import { supabase } from '@/lib/supabase';
import { parseCv, type CvProfile } from '@/lib/cv/cvProfile';
import { stripHtml } from '@/lib/cv/text';
import type { StoredCv } from '@/lib/cv/store';

// Common words per language. A text is English when English words are at least as
// frequent as any other language's — which also works for a terse CV that is
// mostly nouns — and it isn't full of letters English doesn't use.
const WORDS: Record<string, string> = {
  en: 'the and of with for you your our are will this that from have has experience education skills languages summary present',
  de: 'und der die das mit für wir sie ist nicht eine einer sowie bei von zu den dem im auf als auch oder wird werden deine unser berufserfahrung ausbildung kenntnisse sprachen lebenslauf heute',
  fr: 'et les des pour avec vous nous une dans votre notre est sur du au aux que qui par expérience formation compétences langues',
  es: 'y los las para con una del que por nuestro el la se su al como experiencia educación habilidades idiomas actualidad',
  it: 'e il per con una del della che di nostro sono gli le nel alla dei esperienza istruzione competenze lingue',
  nl: 'en het een van voor met je wij onze bij zijn naar niet op te de aan als ook werkervaring opleiding vaardigheden talen heden',
  pt: 'e os as para com uma do da que em não nosso você ao dos das experiência formação competências idiomas',
  tr: 've bir ile için bu olarak çok gibi olan veya deneyim eğitim beceriler diller yetenekler',
  sv: 'och att som för med är du vi ett på av till inte erfarenhet utbildning',
  pl: 'i w na z do oraz się jest nie dla lub doświadczenie wykształcenie umiejętności',
};
const WORD_SETS = Object.entries(WORDS).map(([code, list]) => [code, new Set(list.split(' '))] as const);

/** Is this text English already? (The browser and the server use the same test before a translation is paid for.) */
export function isEnglish(text: string): boolean {
  const words = text.slice(0, 5000).toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  if (words.length < 25) return true; // too short to tell, and too short to matter
  const latin = words.filter((w) => /^[a-z'À-ɏ]+$/.test(w)).length / words.length;
  if (latin < 0.85) return false; // Cyrillic, Arabic, Chinese…
  const accented = words.filter((w) => /[^a-z']/.test(w)).length / words.length;
  if (accented > 0.06) return false; // ı ş ğ ä ö ü é ç ñ ø ə … in more than a word in twenty
  let en = 0;
  let other = 0;
  for (const [code, set] of WORD_SETS) {
    const n = words.filter((w) => set.has(w)).length;
    if (code === 'en') en = n;
    else other = Math.max(other, n);
  }
  return en >= other;
}

/** null = not known yet; false = translation isn't available in this session. */
let available: boolean | null = null;
const off = (message?: string | null) => Boolean(message && /does not exist|schema cache|not found|failed to send|failed to fetch|non-2xx|404/i.test(message));

export type JobText = { id: string; title: string; description: string };
export type EnglishJob = JobText & { translated: boolean };

/** At most this many ads are newly translated for one search; the rest are compared as they are. */
const MAX_NEW_PER_SEARCH = 24;

/**
 * The same jobs, in English where a translation exists or can be made.
 * `onProgress(done, total)` reports ads being translated for the first time.
 */
export async function jobsInEnglish(rows: JobText[], onProgress?: (done: number, total: number) => void): Promise<Map<string, EnglishJob>> {
  const out = new Map<string, EnglishJob>(rows.map((r) => [r.id, { ...r, translated: false }]));
  if (available === false) return out;
  const foreign = rows.filter((r) => r.description && !isEnglish(stripHtml(r.description)));
  if (!foreign.length) return out;

  // 1. Already translated for someone else?
  const saved = await supabase.from('job_translations').select('job_id, title, html').in('job_id', foreign.map((r) => r.id));
  if (saved.error) {
    if (off(saved.error.message)) available = false;
    return out;
  }
  const have = new Set<string>();
  for (const t of (saved.data ?? []) as { job_id: string; title: string | null; html: string }[]) {
    const src = out.get(t.job_id);
    if (!src || !t.html) continue;
    out.set(t.job_id, { id: t.job_id, title: t.title || src.title, description: t.html, translated: true });
    have.add(t.job_id);
  }

  // 2. The rest: ask the server, twelve at a time.
  const todo = foreign.filter((r) => !have.has(r.id)).slice(0, MAX_NEW_PER_SEARCH);
  let done = 0;
  if (todo.length) onProgress?.(0, todo.length);
  for (let i = 0; i < todo.length; i += 12) {
    const chunk = todo.slice(i, i + 12);
    const { data, error } = await supabase.functions.invoke('translate', { body: { jobs: chunk.map((r) => r.id) } });
    if (error || !data || (data as { off?: boolean }).off) {
      available = false;
      break;
    }
    available = true;
    const res = data as { translations?: Record<string, { title: string; html: string }>; skipped?: Record<string, string> };
    for (const [id, t] of Object.entries(res.translations ?? {})) {
      const src = out.get(id);
      if (src && t.html) out.set(id, { id, title: t.title || src.title, description: t.html, translated: true });
    }
    done += chunk.length;
    onProgress?.(done, todo.length);
    // The month's budget is used up: no point asking for the next chunk.
    if (Object.values(res.skipped ?? {}).includes('budget')) break;
  }
  return out;
}

export type EnglishCv = {
  text: string;
  profile: CvProfile;
  /** 'same' already English · 'translated' · 'foreign' another language, compared as it is. */
  state: 'same' | 'translated' | 'foreign';
};

const CV_KEY = 'mv:cvEn';
function readSaved(cv: StoredCv): string | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(CV_KEY) ?? 'null') as { at: string; text: string } | null;
    return v && v.at === cv.at && v.text ? v.text : null;
  } catch {
    return null;
  }
}
function writeSaved(cv: StoredCv, text: string) {
  try {
    window.localStorage.setItem(CV_KEY, JSON.stringify({ at: cv.at, text }));
  } catch {
    /* ignore */
  }
}

const cvMemo = new Map<string, Promise<EnglishCv>>();

/** The CV in English: as it is, or its saved translation, or (accounts only) a new translation. */
export function cvInEnglish(cv: StoredCv, userId: string | null): Promise<EnglishCv> {
  const key = `${cv.at}:${userId ?? ''}`;
  const hit = cvMemo.get(key);
  if (hit) return hit;
  // Read from the translation — except the CV's own checks (contact details are removed
  // before translating, so "has an email" must come from the original).
  const english = (text: string): CvProfile => ({ ...parseCv(text), has: cv.profile.has, numbers: cv.profile.numbers });
  const run = (async (): Promise<EnglishCv> => {
    const asIs = (state: EnglishCv['state']): EnglishCv => ({ text: cv.text, profile: cv.profile, state });
    if (isEnglish(cv.text)) return asIs('same');
    const local = readSaved(cv);
    if (local) return { text: local, profile: english(local), state: 'translated' };
    // A guest's CV stays in the browser; an account's CV is on the server already.
    if (!userId || cv.owner !== userId || available === false) return asIs('foreign');
    const { data, error } = await supabase.functions.invoke('translate', { body: { cv: true } });
    if (error || !data || (data as { off?: boolean }).off) {
      available = false;
      return asIs('foreign');
    }
    const text = (data as { text_en?: string }).text_en;
    if (!text) return asIs((data as { same?: boolean }).same ? 'same' : 'foreign');
    writeSaved(cv, text);
    return { text, profile: english(text), state: 'translated' };
  })();
  cvMemo.set(key, run);
  // A failed attempt may be retried later (e.g. after signing in).
  void run.then((r) => r.state === 'foreign' && cvMemo.delete(key));
  return run;
}
