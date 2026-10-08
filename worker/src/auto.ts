// Auto-apply with Pro: new jobs that match a person's CV, applied to by themselves.
//
// For each Pro member who switched it on (apply_auto_due), every hour:
//   new jobs since the last check → scored against the CV with the same rules
//   as the match score → the best ones at or above their minimum (75% by
//   default), up to what is left of their month → one batch, prepared exactly
//   like a batch the person starts on /cv-match (forms read, CV tailored,
//   saved answers) → "ready", and the normal worker loop submits them.
// Only saved answers are used. A question they never answered makes that one
// application "Needs attention"; nothing is guessed.

import type { BatchContext, BatchJob } from '../../src/lib/apply/batch';
import { coverLetter, letterReason } from '../../src/lib/apply/coverLetter';
import { prepareBatch, type MoveResult } from '../../src/lib/apply/runner';
import { tailorCv, tailoredName, untouchedCv, verifyTailored } from '../../src/lib/apply/tailor';
import { DEFAULT_PREFS, type Application, type ApplyPrefs, type ApplyProfile } from '../../src/lib/apply/types';
import { parseCv } from '../../src/lib/cv/cvProfile';
import { parseJob } from '../../src/lib/cv/jobProfile';
import { matchCv } from '../../src/lib/cv/match';
import { stripHtml } from '../../src/lib/cv/text';
import { readForms, type FormRead } from '../../supabase/functions/apply/forms';

type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T | null>;

type Due = {
  userId: string;
  prefs: Partial<ApplyPrefs> & { autoNew?: boolean; autoConsent?: boolean };
  cvText: string;
  answers: ApplyProfile['answers'];
  custom: ApplyProfile['custom'];
  byCountry: ApplyProfile['byCountry'];
  email: string | null;
  since: string;
  left: number;
};
type NewJob = { id: string; title: string; company: string | null; publisherId: string | null; cc: string | null; country: string | null; html: string; jobFunction: string | null; experience: string | null; at: string };

/** At most this many applications per person per check. */
const PER_RUN = 15;

export async function autoApply(rpc: Rpc, fetcher: typeof fetch, log: (...a: unknown[]) => void): Promise<number> {
  const due = (await rpc<Due[]>('apply_auto_due', { p_limit: 10 })) ?? [];
  let total = 0;
  for (const d of due) {
    try {
      total += await forPerson(d, rpc, fetcher, log);
    } catch (e) {
      log('auto: failed for', d.userId, String(e).slice(0, 300));
      await rpc('apply_auto_mark', { p_user: d.userId, p_seen_until: d.since, p_applied: 0 });
    }
  }
  return total;
}

async function forPerson(d: Due, rpc: Rpc, fetcher: typeof fetch, log: (...a: unknown[]) => void): Promise<number> {
  const prefs: ApplyPrefs = { ...DEFAULT_PREFS, ...d.prefs, alwaysAsk: [] };
  const cv = parseCv(d.cvText);
  const jobs = (await rpc<NewJob[]>('apply_auto_jobs', { p_user: d.userId, p_since: d.since })) ?? [];
  const newest = jobs[0]?.at ?? new Date().toISOString();

  // Score every new job against the CV — the same rules as /cv-match.
  const scored = jobs
    .filter((j) => (!prefs.countries.length || (j.cc && prefs.countries.includes(j.cc.toUpperCase()))) && stripHtml(j.html).length > 80)
    .map((j) => {
      const job = parseJob({ title: j.title, description: j.html, department: j.jobFunction, experienceHint: j.experience });
      return { j, job, score: matchCv(cv, d.cvText, job).score };
    })
    .filter((x) => x.score >= prefs.minScore)
    .sort((a, b) => b.score - a.score);
  // One per company and role.
  const seen = new Set<string>();
  const picked = scored.filter((x) => {
    const k = `${x.j.publisherId}:${x.j.title.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, Math.min(PER_RUN, d.left));

  if (!picked.length) {
    await rpc('apply_auto_mark', { p_user: d.userId, p_seen_until: newest, p_applied: 0 });
    return 0;
  }
  log('auto:', d.userId, `${jobs.length} new, ${scored.length} match, applying to ${picked.length}`);

  const given: Record<string, string> = d.prefs.autoConsent ? { consent: 'Yes' } : {};
  const r = await rpc<{ applications: (Application & { status: string })[] }>('apply_auto_enqueue', {
    p_user: d.userId,
    p_items: picked.map((x, i) => ({ jobId: x.j.id, score: x.score, decision: 'auto', priority: x.score >= 85 ? 'strong' : 'good', rank: 100 - i, sponsorship: 'unclear' })),
    p_email: d.email,
    p_given: given,
  });
  const apps = (r?.applications ?? []).filter((a) => a.status === 'queued');
  if (!apps.length) {
    await rpc('apply_auto_mark', { p_user: d.userId, p_seen_until: newest, p_applied: 0 });
    return 0;
  }

  // Read the forms, as the page does before a batch.
  const forms: Record<string, FormRead> = await readForms(fetcher, apps.map((a) => ({ id: a.id, url: a.url, email: a.channel === 'madevisa' })));
  await rpc('apply_forms_store', { p_user: d.userId, p_forms: forms });

  const profile: ApplyProfile = { answers: d.answers ?? {}, custom: d.custom ?? {}, byCountry: d.byCountry ?? {} };
  const ctx: BatchContext = { profile, prefs, prefsSaved: true, cv, cvText: d.cvText, given };
  const byJob = new Map(picked.map((x) => [x.j.id, x]));
  const items = apps.map((app) => ({
    app,
    job: { id: app.id, title: app.title, company: app.company, cc: app.cc, country: app.country, sponsorship: app.sponsorship, letter: false, form: forms[app.id] ?? { platform: null, status: 'live', questions: null } } as BatchJob,
  }));

  const end = await prepareBatch(items, ctx, {
    move: async (id, to, detail) => {
      const res = await rpc<MoveResult & { app?: Application }>('apply_auto_move', { p_user: d.userId, p_id: id, p_to: to, p_detail: detail ?? null });
      return res ?? { ok: false, code: 'error', message: 'No answer from the database.' };
    },
    docs: async (app) => {
      const x = byJob.get(app.jobId);
      if (!x) return { ok: false, gone: true };
      const name = tailoredName(profile.answers.full_name?.value ?? null, app.title);
      let t = tailorCv(d.cvText, cv, x.job);
      if (!verifyTailored(d.cvText, cv, t).ok) t = untouchedCv(d.cvText);
      const why = letterReason(stripHtml(x.j.html), x.job, app.priority);
      const letter = why ? coverLetter({ cvText: d.cvText, cv, job: x.job, jobTitle: app.title, company: app.company, profile, sponsorship: app.sponsorship, jobCountry: app.country, documentUrl: null }) : null;
      return { ok: true, kept: { cv: { name, content: t.text, meta: { lines: t.lines, changes: t.changes, headline: t.headline } }, letter: letter ? { name: `Cover letter — ${app.company}`, content: letter } : null } };
    },
    save: async (app, kept, answers, concepts) => {
      await rpc('apply_auto_save', { p_user: d.userId, p_id: app.id, p_cv: kept.cv, p_letter: kept.letter, p_answers: answers, p_concepts: concepts });
    },
    control: () => 'run',
  });
  await rpc('apply_auto_mark', { p_user: d.userId, p_seen_until: newest, p_applied: end.ready });
  return end.ready;
}
