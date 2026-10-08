// Preparing one application's documents: read the ad, tailor the CV to it,
// and write a letter where one is useful. Runs in the person's browser, on
// their own CV — the same place and the same rules as the match score.
//
// What the form asks, and the answers, are worked out for the whole batch
// at once (batch.ts); the employer's form is filled in by the application
// worker (worker/).

import { supabase } from '@/lib/supabase';
import { parseJob } from '@/lib/cv/jobProfile';
import type { StoredCv } from '@/lib/cv/store';
import { stripHtml } from '@/lib/cv/text';
import { jobsInEnglish } from '@/lib/cv/translate';
import { coverLetter, letterReason } from '@/lib/apply/coverLetter';
import { tailorCv, tailoredName, untouchedCv, verifyTailored, type Tailored } from '@/lib/apply/tailor';
import type { Application, ApplyProfile } from '@/lib/apply/types';

/** What is kept with the application so the receipt can show exactly what was used. */
export type Kept = {
  cv: { name: string; content: string; meta: { lines: Tailored['lines']; changes: string[]; headline: string | null } };
  letter: { name: string; content: string } | null;
};

export type DocsResult = { ok: true; kept: Kept } | { ok: false; gone: true } | { ok: false; gone: false; reason: string };

type AdRow = { id: string; title: string; status: string; job_function: string | null; experience_level: string | null; html: string | null; exp: string | null; description: string | null };

export type DocsContext = {
  cv: StoredCv;
  profile: ApplyProfile;
  /** Link to the person's sponsorship document for this job, if they made one. */
  documentUrl?: string | null;
};

export async function prepareDocs(app: Application, ctx: DocsContext): Promise<DocsResult> {
  const { data, error } = await supabase
    .from('sponsored_jobs')
    .select('id, title, status, job_function, experience_level, html:facts->>html, exp:facts->facts->>experience, description')
    .eq('id', app.jobId)
    .maybeSingle();
  if (error) return { ok: false, gone: false, reason: 'The job ad could not be read. Check your connection and try again.' };
  const row = data as unknown as AdRow | null;
  if (!row || row.status !== 'published') return { ok: false, gone: true };
  const adText = row.html || row.description || '';

  const cvName = tailoredName(ctx.profile.answers.full_name?.value ?? null, app.title);
  // Too little ad to tailor to: the CV goes as it is (still a good application).
  if (stripHtml(adText).length < 80) {
    const t = untouchedCv(ctx.cv.text);
    return { ok: true, kept: { cv: { name: cvName, content: t.text, meta: { lines: t.lines, changes: [], headline: null } }, letter: null } };
  }

  // The ad in English where it has a translation, so the same words can be compared.
  const english = (await jobsInEnglish([{ id: row.id, title: row.title, description: adText }])).get(row.id);
  const ad = english ?? { title: row.title, description: adText };
  const job = parseJob({ title: ad.title, description: ad.description, department: row.job_function, experienceHint: row.experience_level || row.exp || null });

  // Tailor — and check. A version that says anything the CV doesn't is thrown away.
  let tailored = tailorCv(ctx.cv.text, ctx.cv.profile, job);
  if (!verifyTailored(ctx.cv.text, ctx.cv.profile, tailored).ok) tailored = untouchedCv(ctx.cv.text);

  const why = letterReason(stripHtml(adText), job, app.priority);
  const letter = why
    ? coverLetter({ cvText: ctx.cv.text, cv: ctx.cv.profile, job, jobTitle: app.title, company: app.company, profile: ctx.profile, sponsorship: app.sponsorship, jobCountry: app.country, documentUrl: ctx.documentUrl ?? null })
    : null;

  return {
    ok: true,
    kept: {
      cv: { name: cvName, content: tailored.text, meta: { lines: tailored.lines, changes: tailored.changes, headline: tailored.headline } },
      letter: letter ? { name: `Cover letter — ${app.company}`, content: letter } : null,
    },
  };
}
