// The page's part of a batch: take every application from "the form was
// read" to "ready to submit".
//
// For each application, best match first:
//   1. preparing  tailor the CV to the ad, write the letter if one helps
//   2. keep the documents, the exact answers, and the answers by concept
//      (what the worker falls back on if the live form asks more)
//   3. ready            → the application worker submits it
//      needs_attention  → a question the person left for later
//      blocked          → the employer needs a sign-in
//      expired          → the job closed
// Between applications the runner looks at Pause / Stop.
//
// The runner holds no rules of its own about what is allowed — every move
// goes through the backend (the database). That is also why it can be
// tested with a stand-in backend.

import { answersFor, conceptAnswers, planBatch, type BatchContext, type BatchJob } from '@/lib/apply/batch';
import type { DocsResult, Kept } from '@/lib/apply/prepare';
import type { AppStatus, Application, Needed } from '@/lib/apply/types';

export type MoveDetail = {
  reason?: string;
  code?: string;
  needs?: Needed[];
  confirmation?: { kind: 'email' | 'self' | 'site'; id?: string };
  cvName?: string;
  coverLetter?: boolean;
  platform?: string;
};
export type MoveResult = { ok: true; app: Application } | { ok: false; code: 'allowance' | 'daily_limit' | 'invalid' | 'duplicate' | 'expired' | 'error'; message: string; app?: Application };

export type Answer = { id: string; label: string; value: string; source: string; key: string | null };

export type PrepDeps = {
  move: (id: string, to: AppStatus, detail?: MoveDetail) => Promise<MoveResult>;
  docs: (app: Application) => Promise<DocsResult>;
  save: (app: Application, kept: Kept, answers: Answer[], concepts: Record<string, string>) => Promise<void>;
  control: () => 'run' | 'pause' | 'stop';
  onUpdate?: (app: Application) => void;
};

export type PrepEnd = { state: 'done' | 'paused' | 'stopped'; ready: number; attention: number; blocked: number };

const order = <T extends { app: Application }>(xs: T[]) => [...xs].sort((a, b) => b.app.rank - a.app.rank || b.app.score - a.app.score);

/** Questions an application still waits on, in the words the person sees. */
export function needsOf(job: BatchJob, ctx: BatchContext): Needed[] {
  const plan = planBatch([job], ctx);
  const items = [...plan.ask, ...plan.extra];
  const j = plan.jobs[0];
  const out: Needed[] = items
    .filter((a) => !ctx.given[a.key]?.trim())
    .map((a) => ({ id: a.key, label: a.label, key: a.concept, kind: a.input === 'long' ? 'long' : a.input === 'yesno' ? 'yesno' : a.options?.length ? 'select' : 'text', options: a.options, why: a.concept ? 'You haven’t saved an answer to this yet.' : 'Only you can answer this one.' }));
  if (j?.outcome === 'attention' && j.reason) out.push({ id: `stuck:${j.id}`, label: j.reason, key: null, kind: 'text', why: j.reason });
  return out;
}

/**
 * Prepare a batch's applications. `items` are the batch's applications still to prepare
 * (queued / analyzing / preparing), each with what was read of its form.
 */
export async function prepareBatch(items: { app: Application; job: BatchJob }[], ctx: BatchContext, deps: PrepDeps): Promise<PrepEnd> {
  const end: PrepEnd = { state: 'done', ready: 0, attention: 0, blocked: 0 };
  const halted = (): PrepEnd | null => {
    const c = deps.control();
    return c === 'run' ? null : { ...end, state: c === 'pause' ? 'paused' : 'stopped' };
  };
  const step = async (app: Application, to: AppStatus, detail?: MoveDetail): Promise<Application | null> => {
    const r = await deps.move(app.id, to, detail);
    if (r.app) deps.onUpdate?.(r.app);
    return r.ok ? r.app : null;
  };

  for (const { app: first, job } of order(items)) {
    const stop = halted();
    if (stop) return stop;
    let app = first;

    const outcome = planBatch([job], ctx).jobs[0];
    if (job.form.status === 'closed') {
      await step(app, 'expired', { reason: 'The job is no longer open.', code: 'closed' });
      continue;
    }
    // Through "analyzing" (the form was read) to "preparing".
    if (app.status === 'queued') app = (await step(app, 'analyzing')) ?? app;
    if (app.status === 'analyzing') {
      const next = await step(app, 'preparing', { platform: job.form.platform ?? undefined });
      if (!next) continue; // closed or applied to since: the backend has marked it
      app = next;
    }
    if (app.status !== 'preparing') continue;

    let docs: DocsResult;
    try {
      docs = await deps.docs(app);
    } catch (e) {
      docs = { ok: false, gone: false, reason: e instanceof Error ? e.message : 'The application could not be prepared.' };
    }
    if (!docs.ok) {
      if (docs.gone) await step(app, 'expired', { reason: 'The job is no longer open.', code: 'closed' });
      else await step(app, 'failed', { reason: docs.reason, code: 'prepare' });
      continue;
    }
    const letter = Boolean(docs.kept.letter);
    const withLetter: BatchJob = { ...job, letter };
    await deps.save(app, docs.kept, answersFor(withLetter, ctx), conceptAnswers(withLetter, ctx));
    const detail = { cvName: docs.kept.cv.name, coverLetter: letter };

    if (outcome.outcome === 'blocked') {
      await step(app, 'blocked', { ...detail, reason: outcome.reason ?? undefined, code: outcome.reasonCode ?? undefined });
      end.blocked += 1;
      continue;
    }
    const needs = needsOf(withLetter, ctx);
    if (needs.length) {
      const reason = outcome.outcome === 'attention' && outcome.reason ? outcome.reason : needs.length === 1 ? `This employer asks something only you can answer: “${needs[0].label}”` : `This employer asks ${needs.length} things only you can answer.`;
      await step(app, 'needs_attention', { ...detail, needs: needs.filter((n) => !n.id.startsWith('stuck:')), reason, code: 'question' });
      end.attention += 1;
      continue;
    }
    if (await step(app, 'ready', detail)) end.ready += 1;
  }
  return end;
}

/** What a batch amounts to. */
export type Tally = {
  total: number;
  /** Submitted by MadeVisa, with the employer's confirmation. */
  sent: number;
  /** Submitted by the person on the employer's site. */
  sentByYou: number;
  /** Waiting for the person: a question, a CAPTCHA, a sign-in, a failure. */
  attention: number;
  skipped: number;
  /** Still being worked on (prepared, or being submitted). */
  pending: number;
};
export function tally(apps: Pick<Application, 'status' | 'verified'>[]): Tally {
  const n = (f: (a: Pick<Application, 'status' | 'verified'>) => boolean) => apps.filter(f).length;
  return {
    total: apps.length,
    sent: n((a) => a.status === 'submitted' && a.verified),
    sentByYou: n((a) => a.status === 'submitted' && !a.verified),
    attention: n((a) => a.status === 'needs_attention' || a.status === 'blocked' || a.status === 'failed'),
    skipped: n((a) => a.status === 'skipped' || a.status === 'already_applied' || a.status === 'expired'),
    pending: n((a) => a.status === 'queued' || a.status === 'analyzing' || a.status === 'preparing' || a.status === 'ready' || a.status === 'submitting'),
  };
}
