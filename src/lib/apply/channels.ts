// How an application can reach an employer, and what we can learn about
// the employer's form without touching it.
//
// MadeVisa never fills in or submits a form on an employer's site: those
// forms sit behind a human check or a login, and getting round either is
// not something MadeVisa does. So there are two channels:
//   madevisa       the employer switched on "receive applications through
//                  MadeVisa" for the job — MadeVisa sends it (by email, with
//                  the tailored CV attached) and keeps the confirmation;
//   employer_site  everything else — MadeVisa prepares the application and
//                  the person sends it on the employer's site.
// `SUBMITTERS` is where a further channel would be added (an employer's
// own API with the employer's key, a browser helper the person runs).

import type { Channel, Question } from '@/lib/apply/types';

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'personio' | 'recruitee' | 'teamtailor' | 'workable' | 'icims' | 'successfactors' | 'oracle' | 'eightfold' | 'phenom' | 'other';

const ATS_HOST: [Ats, RegExp][] = [
  ['greenhouse', /(^|\.)greenhouse\.io$/],
  ['lever', /(^|\.)lever\.co$/],
  ['ashby', /(^|\.)ashbyhq\.com$/],
  ['workday', /\.(myworkdayjobs|myworkdaysite)\.com$/],
  ['smartrecruiters', /(^|\.)smartrecruiters\.com$/],
  ['personio', /\.jobs\.personio\.(de|com)$|(^|\.)personio\.(de|com)$/],
  ['recruitee', /(^|\.)recruitee\.com$/],
  ['teamtailor', /(^|\.)teamtailor\.com$/],
  ['workable', /(^|\.)workable\.com$/],
  ['icims', /(^|\.)icims\.com$/],
  ['successfactors', /(^|\.)successfactors\.(com|eu)$/],
  ['oracle', /(^|\.)oraclecloud\.com$/],
  ['eightfold', /(^|\.)eightfold\.ai$/],
];

/** Which hiring system an application link belongs to. */
export function atsOf(url: string | null | undefined): Ats | null {
  if (!url) return null;
  let host: string;
  let search: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    search = u.search;
  } catch {
    return null;
  }
  for (const [ats, re] of ATS_HOST) if (re.test(host)) return ats;
  // A company's own careers page that embeds a Greenhouse form.
  if (/[?&]gh_jid=\d+/.test(search)) return 'greenhouse';
  return 'other';
}

export const ATS_NAME: Record<Ats, string> = {
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workday: 'Workday', smartrecruiters: 'SmartRecruiters', personio: 'Personio', recruitee: 'Recruitee', teamtailor: 'Teamtailor', workable: 'Workable', icims: 'iCIMS', successfactors: 'SuccessFactors', oracle: 'Oracle', eightfold: 'Eightfold', phenom: 'Phenom', other: 'the employer’s site',
};

/** Why MadeVisa hands this one to the person instead of sending it. Plain words, no jargon. */
export function handoverReason(url: string | null): string {
  const ats = atsOf(url);
  if (!url) return 'This employer has no application link on MadeVisa. Your application is prepared — send it the way the ad describes.';
  if (ats === 'workday' || ats === 'icims' || ats === 'successfactors' || ats === 'oracle') return 'This employer asks you to sign in to its own careers site to apply, and MadeVisa doesn’t sign in as you. Your application is ready to send there.';
  return 'This employer only takes applications on its own site, with a check that a person is sending them. Your application is ready to send there.';
}

/** board token and job id from a Greenhouse link, when the link carries both. */
export function greenhouseRef(url: string | null | undefined): { board: string; job: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)greenhouse\.io$/.test(u.hostname.toLowerCase())) return null;
    const embed = u.searchParams.get('for');
    const token = u.searchParams.get('token');
    if (embed && token && /^\d+$/.test(token)) return { board: embed, job: token };
    const m = u.pathname.match(/^\/(?:embed\/job_app\/)?([A-Za-z0-9_-]+)\/jobs\/(\d+)/);
    return m ? { board: m[1], job: m[2] } : null;
  } catch {
    return null;
  }
}

type GhField = { name?: string; type?: string; values?: { label?: string; value?: unknown }[] };
type GhQuestion = { label?: string; required?: boolean | null; fields?: GhField[] };

/**
 * A Greenhouse job's public question list (…/jobs/{id}?questions=true) → our
 * questions. Read-only: this is the same list the public form is drawn
 * from. Anything not understood is left out rather than guessed at.
 */
export function parseGreenhouseQuestions(json: unknown): Question[] {
  const qs = (json as { questions?: GhQuestion[] } | null)?.questions;
  if (!Array.isArray(qs)) return [];
  const out: Question[] = [];
  for (const q of qs) {
    const field = q.fields?.[0];
    const label = String(q.label ?? '').replace(/\s+/g, ' ').trim();
    if (!field?.name || !label) continue;
    const type = String(field.type ?? '');
    const options = (field.values ?? []).map((v) => String(v.label ?? '').trim()).filter(Boolean);
    const kind: Question['kind'] = type === 'input_file' ? 'file' : type === 'textarea' ? 'long' : type === 'multi_value_multi_select' ? 'multi' : type === 'multi_value_single_select' ? (options.length === 2 && options.every((o) => /^(yes|no)$/i.test(o)) ? 'yesno' : 'select') : 'text';
    out.push({ id: `gh:${field.name}`, label, required: Boolean(q.required), kind, ...(options.length ? { options } : {}) });
  }
  return out;
}

// --- Sending -----------------------------------------------------------------------

export type Pack = {
  applicationId: string;
  jobId: string;
  cv: { name: string; base64: string };
  letter: string | null;
  answers: { label: string; value: string }[];
};

export type SubmitResult =
  | { ok: true; confirmation: { kind: 'email' | 'site'; id: string } }
  /** Not sent, and it can't be by MadeVisa: the person finishes it. */
  | { ok: false; handover: true; reason: string; code: string }
  /** Not sent; trying again later may work. */
  | { ok: false; handover: false; reason: string; code: string };

export type Submitter = (pack: Pack, url: string | null) => Promise<SubmitResult>;

export const channelLabel: Record<Channel, string> = {
  madevisa: 'Sent by MadeVisa',
  employer_site: 'You send it on the employer’s site',
};
