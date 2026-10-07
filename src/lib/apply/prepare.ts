// Preparing one application: read the ad, tailor the CV to it, write the
// letter if one is useful, and answer the form's questions from the verified
// profile. Everything here runs in the person's browser, on their own CV —
// the same place and the same rules as the match score.

import { supabase } from '@/lib/supabase';
import { parseJob } from '@/lib/cv/jobProfile';
import type { StoredCv } from '@/lib/cv/store';
import { stripHtml } from '@/lib/cv/text';
import { jobsInEnglish } from '@/lib/cv/translate';
import { greenhouseRef, parseGreenhouseQuestions } from '@/lib/apply/channels';
import { coverLetter, letterReason } from '@/lib/apply/coverLetter';
import { docxBytes, toBase64 } from '@/lib/apply/docx';
import { answerQuestions, basicQuestions, classifyQuestion } from '@/lib/apply/profile';
import type { PrepareResult, Step } from '@/lib/apply/runner';
import { tailorCv, tailoredName, untouchedCv, verifyTailored, type Tailored } from '@/lib/apply/tailor';
import type { Application, ApplyPrefs, ApplyProfile, Question } from '@/lib/apply/types';

/** What is kept with the application so the receipt can show exactly what was used. */
export type Kept = {
  cv: { name: string; content: string; meta: { lines: Tailored['lines']; changes: string[]; headline: string | null } };
  letter: { name: string; content: string } | null;
  answers: { id: string; label: string; value: string; source: string; key: string | null }[];
};

type AdRow = { id: string; title: string; status: string; job_function: string | null; experience_level: string | null; html: string | null; exp: string | null; description: string | null };

/** The employer's own question list, where its hiring system publishes one. Null when there is none to read. */
async function formQuestions(app: Application): Promise<Question[] | null> {
  if (!greenhouseRef(app.url)) return null;
  try {
    const { data, error } = await supabase.functions.invoke('apply', { body: { action: 'questions', job_id: app.jobId } });
    if (error || !data) return null;
    const qs = parseGreenhouseQuestions({ questions: (data as { questions?: unknown }).questions });
    return qs.length ? qs : null;
  } catch {
    return null;
  }
}

export type PrepareContext = {
  cv: StoredCv;
  profile: ApplyProfile;
  prefs: ApplyPrefs;
  /** Answers given for this one application (question id → value). */
  given: Record<string, string>;
  /** Link to the person's sponsorship document for this job, if they made one. */
  documentUrl?: string | null;
};

export async function prepareApplication(app: Application, ctx: PrepareContext, onStep: (s: Step) => void): Promise<PrepareResult & { kept?: Kept }> {
  onStep('cv');
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select('id, title, status, job_function, experience_level, html:facts->>html, exp:facts->facts->>experience, description')
    .eq('id', app.jobId)
    .maybeSingle();
  if (error) return { ok: false, gone: false, reason: 'The job ad could not be read. Check your connection and try again.' };
  const row = data as unknown as AdRow | null;
  if (!row || row.status !== 'published') return { ok: false, gone: true };
  const adText = row.html || row.description || '';
  if (stripHtml(adText).length < 80) return { ok: false, gone: false, reason: 'The job ad has too little text to tailor a CV to.' };

  // The ad in English where it has a translation, so the same words can be compared.
  const english = (await jobsInEnglish([{ id: row.id, title: row.title, description: adText }])).get(row.id);
  const ad = english ?? { title: row.title, description: adText };
  const job = parseJob({ title: ad.title, description: ad.description, department: row.job_function, experienceHint: row.experience_level || row.exp || null });

  // Tailor — and check. A version that says anything the CV doesn't is thrown away.
  let tailored = tailorCv(ctx.cv.text, ctx.cv.profile, job);
  if (!verifyTailored(ctx.cv.text, ctx.cv.profile, tailored).ok) tailored = untouchedCv(ctx.cv.text);
  const cvName = tailoredName(ctx.profile.answers.full_name?.value ?? null, app.title);
  const base64 = toBase64(docxBytes(tailored.lines, cvName));

  onStep('application');
  const why = letterReason(stripHtml(adText), job, app.priority);
  const letter = why
    ? coverLetter({ cvText: ctx.cv.text, cv: ctx.cv.profile, job, jobTitle: app.title, company: app.company, profile: ctx.profile, sponsorship: app.sponsorship, jobCountry: app.country, documentUrl: ctx.documentUrl ?? null })
    : null;

  onStep('questions');
  const abroad = app.sponsorship !== 'not_needed';
  const basics = basicQuestions(abroad);
  const form = await formQuestions(app);
  // The form's own questions replace our basic ones where they ask the same thing.
  const formKeys = new Set((form ?? []).map((q) => classifyQuestion(q.label)));
  const nameOnForm = formKeys.has('full_name') || (formKeys.has('first_name') && formKeys.has('last_name'));
  const questions = [...basics.filter((q) => { const k = classifyQuestion(q.label); return k === 'full_name' ? !nameOnForm : !formKeys.has(k); }), ...(form ?? [])];
  const answers = answerQuestions(questions, ctx.profile, ctx.prefs, ctx.cv.profile, ctx.given);

  return {
    ok: true,
    prepared: { cv: { name: cvName, base64 }, cvChanged: tailored.changes.length > 0, letter, answers },
    kept: {
      cv: { name: cvName, content: tailored.text, meta: { lines: tailored.lines, changes: tailored.changes, headline: tailored.headline } },
      letter: letter ? { name: `Cover letter — ${app.company}`, content: letter } : null,
      answers: answers.answered.map((a) => ({ id: a.id, label: a.label, value: a.value, source: a.source, key: a.key })),
    },
  };
}
