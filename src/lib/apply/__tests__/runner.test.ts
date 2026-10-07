import { describe, expect, it } from 'vitest';
import type { SubmitResult } from '@/lib/apply/channels';
import { runQueue, tally, type PrepareResult, type RunDeps, type Step } from '@/lib/apply/runner';
import type { Application, Needed } from '@/lib/apply/types';
import { MemoryBackend } from './memoryBackend';

const JOBS = [
  { jobId: 'j1', title: 'Data Analyst', company: 'Alpha', score: 90, rank: 100, channel: 'madevisa' as const },
  { jobId: 'j2', title: 'BI Analyst', company: 'Beta', score: 84, rank: 90, channel: 'madevisa' as const },
  { jobId: 'j3', title: 'Reporting Analyst', company: 'Gamma', score: 80, rank: 80, channel: 'madevisa' as const },
];

const prepared = (needs: Needed[] = []): PrepareResult => ({
  ok: true,
  prepared: { cv: { name: 'Leyla Data Analyst CV.docx', base64: 'AAAA' }, cvChanged: true, letter: null, answers: { answered: [{ id: 'basic:email', label: 'Email', value: 'l@example.com', source: 'cv', key: 'email' }], needs, left: [] } },
});

type Opts = {
  be: MemoryBackend;
  send?: (jobId: string) => SubmitResult | Promise<SubmitResult>;
  prepare?: (app: Application) => PrepareResult | Promise<PrepareResult>;
  control?: () => 'run' | 'pause' | 'stop';
  log?: string[];
};
const deps = (o: Opts): RunDeps => ({
  move: o.be.move,
  prepare: async (app, onStep) => {
    onStep('cv');
    return o.prepare ? o.prepare(app) : prepared();
  },
  save: async () => {},
  submit: { madevisa: async (pack) => (o.send ? o.send(pack.jobId) : { ok: true, confirmation: { kind: 'email', id: `msg-${pack.jobId}` } }) },
  control: o.control ?? (() => 'run'),
  onUpdate: (app: Application, step: Step | null) => o.log?.push(`${app.jobId}:${step ?? app.status}`),
});

describe('successful applications', () => {
  it('prepares, sends and records each one — highest priority first', async () => {
    const be = new MemoryBackend();
    be.enqueue([JOBS[2], JOBS[0], JOBS[1]]);
    const log: string[] = [];
    const end = await runQueue(be.list(), deps({ be, log }));
    expect(end).toEqual({ state: 'done', reason: null, processed: 3 });
    expect(be.list().every((a) => a.status === 'submitted')).toBe(true);
    // Order of work follows rank, not the order they were added.
    expect(log.filter((l) => l.endsWith(':submitted'))).toEqual(['j1:submitted', 'j2:submitted', 'j3:submitted']);
    // Each one went through every step.
    expect(log.filter((l) => l.startsWith('j1:'))).toEqual(['j1:cv', 'j1:cv', 'j1:application', 'j1:questions', 'j1:submit', 'j1:submitted']);
  });

  it('is “verified” only with the channel’s own confirmation', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    await runQueue(be.list(), deps({ be }));
    const app = be.list()[0];
    expect(app.verified).toBe(true);
    expect(app.confirmation).toMatchObject({ kind: 'email', id: 'msg-j1' });
    expect(app.cvName).toBe('Leyla Data Analyst CV.docx');
    expect(app.submittedAt).toBeTruthy();
  });

  it('uses one from the allowance per submitted application', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS);
    await runQueue(be.list(), deps({ be }));
    expect(be.used()).toBe(3);
    expect(be.count('application_credit_used')).toBe(3);
    expect(be.count('application_submitted')).toBe(3);
    expect(be.count('application_credit_refunded')).toBe(0);
  });

  it('running the same queue again sends nothing twice', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS);
    let sends = 0;
    const d = deps({ be, send: () => ((sends += 1), { ok: true, confirmation: { kind: 'email', id: 'm' } }) });
    await runQueue(be.list(), d);
    await runQueue(be.list(), d);
    expect(sends).toBe(3);
    expect(be.used()).toBe(3);
  });
});

describe('failed applications', () => {
  it('a failed send is shown as failed, with the reason, and gives the allowance back', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 2));
    const end = await runQueue(be.list(), deps({ be, send: (id) => (id === 'j1' ? { ok: false, handover: false, reason: 'The employer’s mailbox refused the message.', code: 'bounced' } : { ok: true, confirmation: { kind: 'email', id: 'm2' } }) }));
    const [a, b] = be.list();
    expect(a.status).toBe('failed');
    expect(a.reason).toBe('The employer’s mailbox refused the message.');
    expect(a.verified).toBe(false);
    // The queue carries on to the next one.
    expect(b.status).toBe('submitted');
    expect(end.processed).toBe(2);
    expect(be.used()).toBe(1);
    expect(be.count('application_credit_refunded')).toBe(1);
    expect(be.count('application_failed')).toBe(1);
  });

  it('an error thrown while sending is a failure, not a crash — and never “submitted”', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    await runQueue(be.list(), deps({ be, send: () => Promise.reject(new Error('Network down')) }));
    expect(be.list()[0]).toMatchObject({ status: 'failed', reason: 'Network down' });
    expect(be.used()).toBe(0);
  });

  it('a CV that cannot be prepared fails before anything is counted', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    await runQueue(be.list(), deps({ be, prepare: () => ({ ok: false, gone: false, reason: 'The job ad could not be read.' }) }));
    expect(be.list()[0]).toMatchObject({ status: 'failed', reason: 'The job ad could not be read.' });
    expect(be.count('application_credit_refunded')).toBe(0);
    expect(be.used()).toBe(0);
  });

  it('a failed application can be retried, and is then counted once', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    let ok = false;
    const d = deps({ be, send: () => (ok ? { ok: true, confirmation: { kind: 'email', id: 'm' } } : { ok: false, handover: false, reason: 'Timed out.', code: 'timeout' }) });
    await runQueue(be.list(), d);
    expect(be.list()[0].status).toBe('failed');
    ok = true;
    await be.move(be.list()[0].id, 'queued');
    await runQueue(be.list(), d);
    expect(be.list()[0].status).toBe('submitted');
    expect(be.used()).toBe(1);
  });

  it('a job that closed since the search becomes “no longer open”', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 2));
    be.closed.add('j1');
    await runQueue(be.list(), deps({ be }));
    expect(be.list().map((a) => a.status)).toEqual(['expired', 'submitted']);
  });
});

describe('questions MadeVisa cannot answer', () => {
  const need: Needed = { id: 'q1', label: 'Describe a project you are proud of', key: null, kind: 'long', why: 'This is a question MadeVisa can’t safely answer for you.' };

  it('stops that application, asks, and carries on with the rest', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS);
    let sends = 0;
    await runQueue(be.list(), deps({ be, prepare: (app) => prepared(app.jobId === 'j1' ? [need] : []), send: () => ((sends += 1), { ok: true, confirmation: { kind: 'email', id: 'm' } }) }));
    const [a, b, c] = be.list();
    expect(a.status).toBe('needs_answer');
    expect(a.needs).toEqual([need]);
    expect(a.reason).toBe('The employer asked a question that MadeVisa cannot safely answer automatically.');
    expect([b.status, c.status]).toEqual(['submitted', 'submitted']);
    // Nothing was sent, and nothing counted, for the one that is waiting.
    expect(sends).toBe(2);
    expect(be.used()).toBe(2);
  });

  it('continues once the person has answered', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    let answered = false;
    const d = deps({ be, prepare: () => prepared(answered ? [] : [need]) });
    await runQueue(be.list(), d);
    expect(be.list()[0].status).toBe('needs_answer');
    answered = true;
    await be.move(be.list()[0].id, 'queued');
    await runQueue(be.list(), d);
    expect(be.list()[0].status).toBe('submitted');
    expect(be.list()[0].needs).toEqual([]);
  });
});

describe('the employer’s own site', () => {
  it('is prepared and handed over — never “submitting”, never “submitted” by itself', async () => {
    const be = new MemoryBackend();
    be.enqueue([{ ...JOBS[0], channel: 'employer_site', url: 'https://boards.greenhouse.io/alpha/jobs/123' }]);
    const log: string[] = [];
    let sends = 0;
    const end = await runQueue(be.list(), deps({ be, log, send: () => ((sends += 1), { ok: true, confirmation: { kind: 'email', id: 'm' } }) }));
    const app = be.list()[0];
    expect(app.status).toBe('review_required');
    expect(app.reasonCode).toBe('employer_site');
    expect(app.reason).toMatch(/ready to send/);
    expect(log).not.toContain('j1:submit');
    expect(sends).toBe(0);
    // MadeVisa's part is done, so it counts — once.
    expect(be.used()).toBe(1);
    expect(be.count('application_submitted')).toBe(0);
    expect(end.state).toBe('done');
  });

  it('becomes submitted — not verified — when the person says they sent it, and is not counted a second time', async () => {
    const be = new MemoryBackend();
    be.enqueue([{ ...JOBS[0], channel: 'employer_site' }]);
    await runQueue(be.list(), deps({ be }));
    const r = await be.move(be.list()[0].id, 'submitted', { confirmation: { kind: 'self' } });
    expect(r.ok).toBe(true);
    expect(be.list()[0]).toMatchObject({ status: 'submitted', verified: false });
    expect(be.list()[0].confirmation?.kind).toBe('self');
    expect(be.used()).toBe(1);
  });
});

describe('pause and resume', () => {
  it('pause stops before the next application and loses nothing', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS);
    let sent = 0;
    const d = deps({ be, control: () => (sent >= 1 ? 'pause' : 'run'), send: () => ((sent += 1), { ok: true, confirmation: { kind: 'email', id: 'm' } }) });
    const end = await runQueue(be.list(), d);
    expect(end).toEqual({ state: 'paused', reason: 'you', processed: 1 });
    expect(be.list().map((a) => a.status)).toEqual(['submitted', 'queued', 'queued']);
  });

  it('pausing while one is being prepared puts it back in the queue', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 2));
    let paused = false;
    const d = deps({
      be,
      control: () => (paused ? 'pause' : 'run'),
      prepare: () => {
        paused = true;
        return prepared();
      },
    });
    const end = await runQueue(be.list(), d);
    expect(end.state).toBe('paused');
    expect(be.list().map((a) => a.status)).toEqual(['queued', 'queued']);
    expect(be.used()).toBe(0);
  });

  it('resume carries on where it stopped, without repeating what was sent', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS);
    const sentJobs: string[] = [];
    let go = true;
    const d = deps({ be, control: () => (go ? 'run' : 'pause'), send: (id) => (sentJobs.push(id), (go = false), { ok: true, confirmation: { kind: 'email', id: `m-${id}` } }) });
    await runQueue(be.list(), d);
    expect(sentJobs).toEqual(['j1']);
    go = true;
    const d2 = deps({ be, send: (id) => (sentJobs.push(id), { ok: true, confirmation: { kind: 'email', id: `m-${id}` } }) });
    const end = await runQueue(be.list(), d2);
    expect(end.state).toBe('done');
    expect(sentJobs).toEqual(['j1', 'j2', 'j3']);
    expect(be.used()).toBe(3);
  });

  it('stop leaves the rest queued', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS);
    const end = await runQueue(be.list(), deps({ be, control: () => 'stop' }));
    expect(end).toEqual({ state: 'stopped', reason: 'you', processed: 0 });
    expect(be.list().every((a) => a.status === 'queued')).toBe(true);
  });

  it('pauses by itself at the daily limit and continues the next day', async () => {
    const be = new MemoryBackend({ monthly: 150, daily: 2 });
    be.enqueue(JOBS);
    const end = await runQueue(be.list(), deps({ be }));
    expect(end).toEqual({ state: 'paused', reason: 'daily_limit', processed: 2 });
    expect(be.list().map((a) => a.status)).toEqual(['submitted', 'submitted', 'queued']);
    be.now += 86_400_000;
    expect((await runQueue(be.list(), deps({ be }))).state).toBe('done');
    expect(be.list()[2].status).toBe('submitted');
  });

  it('pauses when the month is used up, before handing over one more than the plan includes', async () => {
    const be = new MemoryBackend({ monthly: 2, daily: 20 });
    be.enqueue(JOBS.map((j) => ({ ...j, channel: 'employer_site' as const })));
    const end = await runQueue(be.list(), deps({ be }));
    expect(end).toEqual({ state: 'paused', reason: 'allowance', processed: 2 });
    expect(be.list().map((a) => a.status)).toEqual(['review_required', 'review_required', 'queued']);
    expect(be.used()).toBe(2);
  });

  it('pauses when the month’s allowance is used — before sending, with nothing lost', async () => {
    const be = new MemoryBackend({ monthly: 1, daily: 20 });
    be.enqueue(JOBS);
    let sends = 0;
    const end = await runQueue(be.list(), deps({ be, send: () => ((sends += 1), { ok: true, confirmation: { kind: 'email', id: 'm' } }) }));
    expect(end).toEqual({ state: 'paused', reason: 'allowance', processed: 1 });
    expect(sends).toBe(1);
    expect(be.list().map((a) => a.status)).toEqual(['submitted', 'queued', 'queued']);
    expect(be.used()).toBe(1);
  });
});

describe('duplicate protection (in the queue)', () => {
  it('never queues the same job twice', () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    expect(be.enqueue(JOBS.slice(0, 1))).toEqual([]);
    expect(be.list()).toHaveLength(1);
    expect(be.count('application_duplicate')).toBe(1);
  });

  it('marks a job already applied to as such, and never sends it', async () => {
    const be = new MemoryBackend();
    be.tracked.add('j2');
    be.enqueue(JOBS);
    let sends = 0;
    await runQueue(be.list(), deps({ be, send: () => ((sends += 1), { ok: true, confirmation: { kind: 'email', id: 'm' } }) }));
    expect(be.list().map((a) => a.status)).toEqual(['submitted', 'already_applied', 'submitted']);
    expect(sends).toBe(2);
  });

  it('the same role at the same company is one application', () => {
    const be = new MemoryBackend();
    be.enqueue([JOBS[0], { ...JOBS[0], jobId: 'j1-munich' }]);
    expect(be.list().map((a) => a.status)).toEqual(['queued', 'already_applied']);
  });

  it('catches an application made elsewhere between queueing and sending', async () => {
    const be = new MemoryBackend();
    be.enqueue(JOBS.slice(0, 1));
    be.tracked.add('j1');
    await runQueue(be.list(), deps({ be }));
    expect(be.list()[0].status).toBe('already_applied');
    expect(be.used()).toBe(0);
  });
});

describe('the tally', () => {
  it('keeps “sent by MadeVisa”, “sent by you” and “ready to send” apart', () => {
    const t = tally([
      { status: 'submitted', verified: true },
      { status: 'submitted', verified: false },
      { status: 'review_required', verified: false },
      { status: 'needs_answer', verified: false },
      { status: 'failed', verified: false },
      { status: 'already_applied', verified: false },
      { status: 'queued', verified: false },
    ]);
    expect(t).toEqual({ total: 7, sent: 1, sentByYou: 1, ready: 1, needsAnswer: 1, failed: 1, skipped: 1, queued: 1 });
  });
});
