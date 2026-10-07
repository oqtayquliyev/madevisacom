// The queue: one application after another, highest priority first.
//
// For each application
//   1. tailor the CV to the ad            (preparing)
//   2. prepare the letter and the answers
//   3. check every required question has a verified answer
//        → if not: "Needs your answer", and on to the next application
//   4. send it                            (submitting)
//        → sent, with a confirmation:      Submitted
//        → something went wrong:           Could not submit
//      An application for the employer's own site is never "submitting":
//      once prepared it is Review required — ready for the person to send.
// Between steps the runner looks at Pause / Stop. Pausing never loses
// anything: what was submitted stays submitted, and the application in
// hand goes back to the queue.
//
// The runner holds no rules of its own about what is allowed — every move
// goes through the backend (the database), which checks the state, the
// duplicates, the daily limit and the allowance. That is also why it can be
// tested with a stand-in backend.

import type { AnswerSet } from '@/lib/apply/profile';
import { handoverReason, type Pack, type SubmitResult } from '@/lib/apply/channels';
import type { AppStatus, Application, Channel, Needed, PauseReason } from '@/lib/apply/types';

export type Step = 'cv' | 'application' | 'questions' | 'submit';
export const STEP_TEXT: Record<Step, string> = {
  cv: 'Preparing tailored CV',
  application: 'Preparing application',
  questions: 'Checking required questions',
  submit: 'Submitting',
};
export const STEPS: Step[] = ['cv', 'application', 'questions', 'submit'];

export type MoveDetail = {
  reason?: string;
  code?: string;
  needs?: Needed[];
  confirmation?: { kind: 'email' | 'self' | 'site'; id?: string };
  cvName?: string;
  coverLetter?: boolean;
};
export type MoveResult = { ok: true; app: Application } | { ok: false; code: 'allowance' | 'daily_limit' | 'invalid' | 'duplicate' | 'expired' | 'error'; message: string; app?: Application };

export type Prepared = {
  /** The tailored CV file. */
  cv: { name: string; base64: string };
  cvChanged: boolean;
  letter: string | null;
  /** Everything the form asks, answered or not. */
  answers: AnswerSet;
};
export type PrepareResult = { ok: true; prepared: Prepared } | { ok: false; gone: true } | { ok: false; gone: false; reason: string };

export type RunDeps = {
  move: (id: string, to: AppStatus, detail?: MoveDetail) => Promise<MoveResult>;
  /** Read the ad, tailor the CV, write the letter, answer the questions. */
  prepare: (app: Application, onStep: (s: Step) => void) => Promise<PrepareResult>;
  /** Keep the documents and answers with the application, so the receipt can show exactly what was sent. */
  save: (app: Application, p: Prepared) => Promise<void>;
  /** The channels MadeVisa can send through itself. A channel without one is handed to the person. */
  submit: Partial<Record<Channel, (pack: Pack, url: string | null) => Promise<SubmitResult>>>;
  /** What the person wants right now. */
  control: () => 'run' | 'pause' | 'stop';
  onUpdate?: (app: Application, step: Step | null) => void;
};

export type RunEnd = { state: 'done' | 'paused' | 'stopped'; reason: PauseReason; processed: number };

const order = (apps: Application[]) => [...apps].sort((a, b) => b.rank - a.rank || b.score - a.score);

export async function runQueue(apps: Application[], deps: RunDeps): Promise<RunEnd> {
  let processed = 0;
  const halted = (): RunEnd | null => {
    const c = deps.control();
    return c === 'run' ? null : { state: c === 'pause' ? 'paused' : 'stopped', reason: 'you', processed };
  };

  for (const first of order(apps.filter((a) => a.status === 'queued'))) {
    let app = first;
    const stop0 = halted();
    if (stop0) return stop0;

    const started = await deps.move(app.id, 'preparing');
    if (!started.ok) {
      if (started.code === 'daily_limit') return { state: 'paused', reason: 'daily_limit', processed };
      // Already applied, or closed since the search: the backend has marked it; nothing more to do here.
      if (started.app) deps.onUpdate?.(started.app, null);
      continue;
    }
    app = started.app;
    deps.onUpdate?.(app, 'cv');

    let res: PrepareResult;
    try {
      res = await deps.prepare(app, (s) => deps.onUpdate?.(app, s));
    } catch (e) {
      res = { ok: false, gone: false, reason: e instanceof Error ? e.message : 'The application could not be prepared.' };
    }
    if (!res.ok) {
      const end = res.gone ? await deps.move(app.id, 'expired', { reason: 'The job is no longer open.', code: 'closed' }) : await deps.move(app.id, 'failed', { reason: res.reason, code: 'prepare' });
      if (end.ok) deps.onUpdate?.(end.app, null);
      processed += 1;
      continue;
    }
    const p = res.prepared;

    // Paused or stopped while it was being prepared: back in the queue, nothing lost.
    const stop1 = halted();
    if (stop1) {
      const back = await deps.move(app.id, 'queued');
      if (back.ok) deps.onUpdate?.(back.app, null);
      return stop1;
    }

    deps.onUpdate?.(app, 'application');
    await deps.save(app, p);

    deps.onUpdate?.(app, 'questions');
    if (p.answers.needs.length) {
      const asked = await deps.move(app.id, 'needs_answer', {
        needs: p.answers.needs,
        reason: 'The employer asked a question that MadeVisa cannot safely answer automatically.',
        code: 'question',
        cvName: p.cv.name,
        coverLetter: Boolean(p.letter),
      });
      if (asked.ok) deps.onUpdate?.(asked.app, null);
      processed += 1;
      continue;
    }

    // No channel MadeVisa can send through (the employer's own form): it is ready, and the person sends it.
    // It never passes through "Submitting" — nothing is being submitted.
    const send = deps.submit[app.channel];
    if (!send) {
      // A finished application counts against the month — so this is refused when the month is used up.
      const ready = await deps.move(app.id, 'review_required', { reason: handoverReason(app.url), code: 'employer_site', cvName: p.cv.name, coverLetter: Boolean(p.letter) });
      if (!ready.ok) {
        const back = await deps.move(app.id, 'queued');
        if (back.ok) deps.onUpdate?.(back.app, null);
        if (ready.code === 'allowance') return { state: 'paused', reason: 'allowance', processed };
        continue;
      }
      deps.onUpdate?.(ready.app, null);
      processed += 1;
      continue;
    }

    // From here an application may be counted: the backend sets one aside first.
    const sending = await deps.move(app.id, 'submitting', { cvName: p.cv.name, coverLetter: Boolean(p.letter) });
    if (!sending.ok) {
      const back = await deps.move(app.id, 'queued');
      if (back.ok) deps.onUpdate?.(back.app, null);
      if (sending.code === 'allowance') return { state: 'paused', reason: 'allowance', processed };
      if (sending.code === 'daily_limit') return { state: 'paused', reason: 'daily_limit', processed };
      continue;
    }
    app = sending.app;
    deps.onUpdate?.(app, 'submit');

    let sent: SubmitResult;
    try {
      sent = await send(
        { applicationId: app.id, jobId: app.jobId, cv: p.cv, letter: p.letter, answers: p.answers.answered.map((a) => ({ label: a.label, value: a.value })) },
        app.url,
      );
    } catch (e) {
      sent = { ok: false, handover: false, reason: e instanceof Error ? e.message : 'The application could not be sent.', code: 'send' };
    }

    const end = sent.ok
      ? await deps.move(app.id, 'submitted', { confirmation: sent.confirmation })
      : sent.handover
        ? await deps.move(app.id, 'review_required', { reason: sent.reason, code: sent.code })
        : await deps.move(app.id, 'failed', { reason: sent.reason, code: sent.code });
    if (end.ok) deps.onUpdate?.(end.app, null);
    processed += 1;
  }
  return { state: 'done', reason: null, processed };
}

/** What a finished (or paused) batch amounts to. */
export type Tally = {
  total: number;
  /** Sent by MadeVisa, with a confirmation. */
  sent: number;
  /** Sent by the person on the employer's site. */
  sentByYou: number;
  /** Prepared, waiting for the person to send. */
  ready: number;
  needsAnswer: number;
  failed: number;
  skipped: number;
  queued: number;
};
export function tally(apps: Pick<Application, 'status' | 'verified'>[]): Tally {
  const n = (f: (a: Pick<Application, 'status' | 'verified'>) => boolean) => apps.filter(f).length;
  return {
    total: apps.length,
    sent: n((a) => a.status === 'submitted' && a.verified),
    sentByYou: n((a) => a.status === 'submitted' && !a.verified),
    ready: n((a) => a.status === 'review_required'),
    needsAnswer: n((a) => a.status === 'needs_answer'),
    failed: n((a) => a.status === 'failed'),
    skipped: n((a) => a.status === 'skipped' || a.status === 'already_applied' || a.status === 'expired'),
    queued: n((a) => a.status === 'queued' || a.status === 'preparing' || a.status === 'submitting'),
  };
}
