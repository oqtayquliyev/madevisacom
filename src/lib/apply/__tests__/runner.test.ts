import { describe, expect, it } from 'vitest';
import type { BatchContext, BatchJob, FormInfo } from '@/lib/apply/batch';
import type { DocsResult, Kept } from '@/lib/apply/prepare';
import { prepareBatch, tally, type Answer, type PrepDeps } from '@/lib/apply/runner';
import type { Application, Question } from '@/lib/apply/types';
import { CV_TEXT, cv, prefs, profile } from './fixtures';
import { MemoryBackend } from './memoryBackend';

const q = (label: string, over: Partial<Question> = {}): Question => ({ id: `gh:${label}`, label, required: true, kind: 'text', ...over });
const BASIC = [q('First Name'), q('Last Name'), q('Email'), q('Resume/CV', { kind: 'file' }), q('Will you require sponsorship?', { kind: 'yesno' })];
const greenhouse = (extra: Question[] = []): FormInfo => ({ platform: 'greenhouse', status: 'ok', questions: [...BASIC, ...extra] });

const KEPT: Kept = { cv: { name: 'Leyla — Data Analyst CV', content: 'Leyla…', meta: { lines: [{ kind: 'name', text: 'Leyla' }], changes: ['Moved SQL first'], headline: null } }, letter: null };
const ctx = (given: Record<string, string> = { 'sponsorship@DE': 'Yes' }): BatchContext => ({ profile: profile(), prefs: prefs({ alwaysAsk: [] }), prefsSaved: false, cv, cvText: CV_TEXT, given });

function batch(n: number, be = new MemoryBackend(), form: (i: number) => FormInfo = () => greenhouse()) {
  be.enqueue(Array.from({ length: n }, (_, i) => ({ jobId: `j${i + 1}`, title: `Analyst ${i + 1}`, company: `Co ${i + 1}`, score: 90 - i, rank: 100 - i })));
  const items = be.list().filter((a) => a.status === 'queued').map((app, i) => ({ app, job: { id: app.id, title: app.title, company: app.company, cc: app.cc, country: app.country, sponsorship: app.sponsorship, letter: false, form: form(i) } as BatchJob }));
  return { be, items };
}

type Saved = { app: string; answers: Answer[]; concepts: Record<string, string> };
const deps = (be: MemoryBackend, o: { docs?: (a: Application) => DocsResult; control?: () => 'run' | 'pause' | 'stop'; saved?: Saved[]; order?: string[] } = {}): PrepDeps => ({
  move: be.move,
  docs: async (a) => (o.docs ? o.docs(a) : { ok: true, kept: KEPT }),
  save: async (app, _kept, answers, concepts) => {
    be.docs.add(app.id);
    o.saved?.push({ app: app.jobId, answers, concepts });
  },
  control: o.control ?? (() => 'run'),
  onUpdate: (a) => (a.status === 'ready' ? o.order?.push(a.jobId) : undefined),
});

describe('preparing a batch', () => {
  it('takes every application to ready — best match first — with the exact answers it will be sent with', async () => {
    const { be, items } = batch(3);
    const saved: Saved[] = [];
    const order: string[] = [];
    const end = await prepareBatch([...items].reverse(), ctx(), deps(be, { saved, order }));
    expect(end).toEqual({ state: 'done', ready: 3, attention: 0, blocked: 0 });
    expect(order).toEqual(['j1', 'j2', 'j3']);
    expect(be.list().every((a) => a.status === 'ready' && a.cvName === 'Leyla — Data Analyst CV')).toBe(true);
    const s = saved[0];
    expect(s.answers.map((a) => [a.label, a.value])).toEqual([['First Name', 'Leyla'], ['Last Name', 'Mammadova'], ['Email', 'leyla.mammadova@example.com'], ['Will you require sponsorship?', 'Yes']]);
    expect(s.concepts).toMatchObject({ sponsorship: 'Yes', first_name: 'Leyla' });
  });

  it('one application’s own question stops only that one; a login-only employer is blocked, but still prepared', async () => {
    const forms = [greenhouse([q('Why do you want to join Co 1?', { kind: 'long' })]), greenhouse(), { platform: 'workday', status: 'login', questions: null } as FormInfo, greenhouse()];
    const { be, items } = batch(4, undefined, (i) => forms[i]);
    const end = await prepareBatch(items, ctx(), deps(be));
    expect(end).toEqual({ state: 'done', ready: 2, attention: 1, blocked: 1 });
    const one = be.list().find((a) => a.jobId === 'j1')!;
    expect(one.status).toBe('needs_attention');
    expect(one.needs.map((n) => n.label)).toEqual(['Why do you want to join Co 1?']);
    const three = be.list().find((a) => a.jobId === 'j3')!;
    expect(three).toMatchObject({ status: 'blocked', reasonCode: 'login_required', cvName: 'Leyla — Data Analyst CV' });
    expect(be.docs.has(three.id)).toBe(true);
  });

  it('a job that closed is expired; a failure to prepare is reported, and the rest carry on', async () => {
    const { be, items } = batch(3, undefined, (i) => (i === 0 ? { platform: 'greenhouse', status: 'closed', questions: null } : greenhouse()));
    await prepareBatch(items, ctx(), deps(be, { docs: (a) => (a.jobId === 'j2' ? { ok: false, gone: false, reason: 'The job ad could not be read.' } : { ok: true, kept: KEPT }) }));
    expect(be.list().map((a) => a.status)).toEqual(['expired', 'failed', 'ready']);
  });

  it('pausing stops between applications; carrying on (or a refreshed page) picks up where it was', async () => {
    const { be, items } = batch(4);
    let n = 0;
    const end = await prepareBatch(items, ctx(), deps(be, { control: () => (n++ < 2 ? 'run' : 'pause') }));
    expect(end.state).toBe('paused');
    expect(be.list().map((a) => a.status)).toEqual(['ready', 'ready', 'queued', 'queued']);
    // A page left mid-way: one was left analyzing. The next run takes them all from where they are.
    be.move(items[2].app.id, 'analyzing');
    const rest = be.list().filter((a) => a.status !== 'ready').map((app) => ({ app, job: items.find((i) => i.app.id === app.id)!.job }));
    const again = await prepareBatch(rest, ctx(), deps(be));
    expect(again).toMatchObject({ state: 'done', ready: 2 });
    expect(be.list().every((a) => a.status === 'ready')).toBe(true);
  });
});

describe('the batch with the worker', () => {
  it('partial success: 14 submitted, 2 need attention — the 14 stay submitted, credits only for them', async () => {
    const { be, items } = batch(16);
    await prepareBatch(items, ctx(), deps(be));
    be.queue = 'running';
    be.drain((a) => (a.jobId === 'j4' || a.jobId === 'j9' ? { to: 'needs_attention', code: 'captcha' } : { to: 'submitted' }));
    const t = tally(be.list());
    expect(t).toMatchObject({ total: 16, sent: 14, attention: 2, pending: 0 });
    expect(be.used()).toBe(14);
    expect(be.count('application_credit_refunded')).toBe(2);
    expect(be.queue).toBe('done');
    expect(be.list().filter((a) => a.status === 'submitted').every((a) => a.verified)).toBe(true);
  });

  it('a failure before submission gives the credit back; a retry is counted once', async () => {
    const { be, items } = batch(1);
    await prepareBatch(items, ctx(), deps(be));
    be.queue = 'running';
    const [a] = be.claim();
    expect(be.used()).toBe(1);
    be.report(a.id, 'ready', { code: 'timeout' });
    expect(be.used()).toBe(0);
    const [again] = be.claim();
    be.report(again.id, 'submitted', { confirmation: { kind: 'site' } });
    expect(be.used()).toBe(1);
    expect(be.count('application_credit_used')).toBe(1);
  });

  it('only the worker can call an application submitted and verified; the person’s own word is never verified, and free by default', async () => {
    const { be, items } = batch(2);
    await prepareBatch(items, ctx(), deps(be));
    const [a, b] = be.list();
    expect((await be.move(a.id, 'submitted', { confirmation: { kind: 'site', id: 'x' } })).ok).toBe(false);
    be.queue = 'running';
    const [c] = be.claim(1);
    expect((await be.move(c.id, 'submitted')).ok).toBe(false);
    be.report(c.id, 'blocked', { code: 'login_required' });
    const self = await be.move(c.id, 'submitted', { confirmation: { kind: 'site', id: 'forged' } });
    expect(self.ok && self.app).toMatchObject({ status: 'submitted', verified: false, confirmation: { kind: 'self' } });
    expect(be.used()).toBe(0);
    be.chargeSelfSent = true;
    be.claim(1);
    be.report(b.id, 'needs_attention', { code: 'captcha' });
    await be.move(b.id, 'submitted');
    expect(be.used()).toBe(1);
  });

  it('the month’s allowance pauses the batch before submitting — nothing is lost', async () => {
    const be = new MemoryBackend({ monthly: 5, daily: 30 });
    const { items } = batch(7, be);
    await prepareBatch(items, ctx(), deps(be));
    be.queue = 'running';
    be.drain(() => ({ to: 'submitted' }));
    expect(be.used()).toBe(5);
    expect(be.queue).toBe('paused');
    expect(be.list().filter((a) => a.status === 'ready')).toHaveLength(2);
  });

  it('the daily limit holds the rest until tomorrow', async () => {
    const be = new MemoryBackend({ monthly: 150, daily: 3 });
    const { items } = batch(5, be);
    await prepareBatch(items, ctx(), deps(be));
    be.queue = 'running';
    be.drain(() => ({ to: 'submitted' }));
    expect(tally(be.list())).toMatchObject({ sent: 3, pending: 2 });
    be.now += 86_400_000;
    be.drain(() => ({ to: 'submitted' }));
    expect(tally(be.list())).toMatchObject({ sent: 5, pending: 0 });
  });

  it('never the same job twice, nor the same role at the same company', () => {
    const be = new MemoryBackend();
    be.tracked.add('j9');
    be.enqueue([
      { jobId: 'j1', title: 'Analyst', company: 'Acme', score: 90, rank: 100 },
      { jobId: 'j2', title: 'Analyst', company: 'Acme', score: 88, rank: 99 },
      { jobId: 'j9', title: 'Engineer', company: 'Beta', score: 80, rank: 90 },
    ]);
    be.enqueue([{ jobId: 'j1', title: 'Analyst', company: 'Acme', score: 90, rank: 100 }]);
    expect(be.list().map((a) => a.status)).toEqual(['queued', 'already_applied', 'already_applied']);
    expect(be.list()).toHaveLength(3);
  });
});
