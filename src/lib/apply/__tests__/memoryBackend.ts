// A stand-in for the database, for tests: the same rules as apply_transition
// (migration 20261205090000) — allowed moves, credits held / used / given back,
// the daily limit, duplicates, who may do what — kept in memory. It also plays
// the application worker (claim → report), so a whole batch can be followed.

import { hold, periodOf, release, spent, use as spend, type Ledger } from '@/lib/apply/allowance';
import { canMove } from '@/lib/apply/machine';
import type { MoveDetail, MoveResult } from '@/lib/apply/runner';
import type { AppStatus, Application, Channel, Priority, QueueState } from '@/lib/apply/types';

export type Event = { name: string; app: string | null };
type Who = 'page' | 'worker';

export class MemoryBackend {
  apps = new Map<string, Application>();
  ledger: Ledger = new Map();
  events: Event[] = [];
  /** Job ids this person already applied to outside Auto Apply (the existing tracker). */
  tracked = new Set<string>();
  /** Jobs closed since the search. */
  closed = new Set<string>();
  /** Applications MadeVisa started submitting, per day (YYYY-MM-DD). */
  private started = new Map<string, Set<string>>();
  /** Documents saved per application (ready needs a CV). */
  docs = new Set<string>();
  queue: QueueState = 'analyzing';
  now = Date.parse('2026-10-08T12:00:00Z');
  chargeSelfSent = false;

  constructor(public limits: { monthly: number; daily: number } = { monthly: 150, daily: 20 }) {}

  private log(name: string, app: string | null) {
    this.events.push({ name, app });
  }
  count = (name: string) => this.events.filter((e) => e.name === name).length;
  used = () => spent(this.ledger, periodOf(this.now));

  /** Queue jobs. A job already applied to, or already queued, is never added twice. */
  enqueue(items: { jobId: string; title: string; company: string; score: number; rank: number; priority?: Priority; channel?: Channel; url?: string | null }[]): Application[] {
    const out: Application[] = [];
    const seen = new Set<string>();
    this.queue = 'analyzing';
    for (const it of items) {
      const existing = [...this.apps.values()].find((a) => a.jobId === it.jobId);
      if (existing) {
        this.log('application_duplicate', existing.id);
        continue;
      }
      const twin = `${it.company.toLowerCase()}::${it.title.toLowerCase()}`;
      const sameRole = seen.has(twin) || [...this.apps.values()].some((a) => `${a.company.toLowerCase()}::${a.title.toLowerCase()}` === twin && a.status !== 'skipped');
      seen.add(twin);
      const status: AppStatus = this.tracked.has(it.jobId) || sameRole ? 'already_applied' : this.closed.has(it.jobId) ? 'expired' : 'queued';
      const app: Application = {
        id: `app-${this.apps.size + 1}`,
        jobId: it.jobId,
        title: it.title,
        company: it.company,
        cc: 'DE',
        country: 'Germany',
        score: it.score,
        status,
        priority: it.priority ?? 'good',
        rank: it.rank,
        channel: it.channel ?? 'employer_site',
        sponsorship: 'unclear',
        url: it.url ?? `https://boards.greenhouse.io/x/jobs/${it.jobId}`,
        reason: status === 'already_applied' ? 'This job is already in your applications.' : status === 'expired' ? 'The job is no longer open.' : null,
        reasonCode: status === 'queued' ? null : status,
        needs: [],
        verified: false,
        confirmation: null,
        cvName: null,
        coverLetter: false,
        submittedAt: null,
        updatedAt: new Date(this.now).toISOString(),
      };
      this.apps.set(app.id, app);
      this.log(status === 'queued' ? 'application_queued' : status === 'already_applied' ? 'application_duplicate' : 'application_skipped', app.id);
      out.push(app);
    }
    return out;
  }

  /** The page's way in. */
  move = (id: string, to: AppStatus, detail: MoveDetail = {}): Promise<MoveResult> => Promise.resolve(this.transition(id, to, detail, 'page'));

  transition(id: string, to: AppStatus, detail: MoveDetail & { retryInSeconds?: number } = {}, who: Who): MoveResult {
    const app = this.apps.get(id);
    if (!app) return { ok: false, code: 'error', message: 'No such application.' };
    if (app.status === to) return { ok: true, app };
    if (!canMove(app.status, to)) return { ok: false, code: 'invalid', message: `Can’t move from ${app.status} to ${to}.`, app };
    if (who === 'page' && (to === 'submitting' || app.status === 'submitting')) return { ok: false, code: 'invalid', message: 'MadeVisa is submitting this one.', app };
    if (who === 'page' && to === 'submitted' && !['needs_attention', 'blocked', 'failed'].includes(app.status)) return { ok: false, code: 'invalid', message: 'Only a confirmation can mark this submitted.', app };
    const period = periodOf(this.now);
    const day = new Date(this.now).toISOString().slice(0, 10);

    if (['analyzing', 'preparing', 'ready'].includes(to) && ['queued', 'analyzing', 'needs_attention', 'blocked', 'failed'].includes(app.status)) {
      if (this.closed.has(app.jobId)) return this.set(app, 'expired', { reason: 'The job is no longer open.', code: 'closed' }, 'expired');
      if (this.tracked.has(app.jobId)) return this.set(app, 'already_applied', { reason: 'This job is already in your applications.', code: 'already_applied' }, 'duplicate');
    }
    if (to === 'ready' && !this.docs.has(id)) return { ok: false, code: 'invalid', message: 'No CV saved yet.', app };
    if (to === 'submitting') {
      const today = this.started.get(day) ?? new Set<string>();
      if (!today.has(id) && today.size >= this.limits.daily) return { ok: false, code: 'daily_limit', message: 'Today’s limit is reached.', app };
      const h = hold(this.ledger, id, period, this.limits.monthly);
      if (!h.ok) return { ok: false, code: 'allowance', message: 'This month’s applications are used.', app };
      today.add(id);
      this.started.set(day, today);
    }
    if (to === 'submitted') {
      const verified = who === 'worker' && Boolean(detail.confirmation && detail.confirmation.kind !== 'self');
      if (verified || this.chargeSelfSent) {
        const u = spend(this.ledger, id, period, this.limits.monthly);
        if (!u.ok && !verified) return { ok: false, code: 'allowance', message: 'This month’s applications are used.', app };
        if (u.ok && u.changed) this.log('application_credit_used', id);
      } else if (release(this.ledger, id).refunded) this.log('application_credit_refunded', id);
      this.log('application_submitted', id);
    } else if (to !== 'submitting' && release(this.ledger, id).refunded) this.log('application_credit_refunded', id);
    if (to === 'failed') this.log('application_failed', id);
    if (to === 'needs_attention' || to === 'blocked') this.log('application_requires_review', id);
    if (to === 'skipped') this.log('application_skipped', id);
    const r = this.set(app, to, detail, undefined, who);
    this.settle();
    return r;
  }

  private settle() {
    if (this.queue === 'running' && ![...this.apps.values()].some((a) => ['queued', 'analyzing', 'preparing', 'ready', 'submitting'].includes(a.status))) {
      this.queue = 'done';
      this.log('auto_apply_completed', null);
    }
  }

  private set(app: Application, to: AppStatus, detail: MoveDetail, refuse?: 'expired' | 'duplicate', who: Who = 'page'): MoveResult {
    const next: Application = {
      ...app,
      status: to,
      reason: ['queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted'].includes(to) ? null : detail.reason ?? app.reason,
      reasonCode: ['queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted'].includes(to) ? null : detail.code ?? app.reasonCode,
      needs: to === 'needs_attention' ? detail.needs ?? [] : [],
      cvName: detail.cvName ?? app.cvName,
      coverLetter: detail.coverLetter ?? app.coverLetter,
      platform: detail.platform ?? app.platform,
      // "Verified" only with a confirmation from the employer's site or the mail service — never the person's own word.
      verified: to === 'submitted' ? who === 'worker' && Boolean(detail.confirmation && detail.confirmation.kind !== 'self') : false,
      confirmation: to === 'submitted' ? { kind: who === 'worker' ? detail.confirmation?.kind ?? 'site' : 'self', id: detail.confirmation?.id, at: new Date(this.now).toISOString() } : null,
      submittedAt: to === 'submitted' ? new Date(this.now).toISOString() : null,
      updatedAt: new Date(this.now).toISOString(),
    };
    this.apps.set(app.id, next);
    if (refuse === 'duplicate') this.log('application_duplicate', app.id);
    if (refuse) return { ok: false, code: refuse, message: next.reason ?? '', app: next };
    return { ok: true, app: next };
  }

  // --- The worker -------------------------------------------------------------------------

  /** Take ready applications (best first) from a running batch. */
  claim(limit = 2): Application[] {
    if (this.queue !== 'running') return [];
    const out: Application[] = [];
    for (const a of this.list().filter((x) => x.status === 'ready').sort((x, y) => y.rank - x.rank)) {
      if (out.length >= limit) break;
      const r = this.transition(a.id, 'submitting', {}, 'worker');
      if (r.ok) out.push(r.app);
      else if (r.code === 'allowance') {
        this.queue = 'paused';
        break;
      }
    }
    return out;
  }
  report(id: string, to: 'submitted' | 'failed' | 'needs_attention' | 'blocked' | 'ready' | 'expired', detail: MoveDetail = {}): MoveResult {
    return this.transition(id, to, detail, 'worker');
  }
  /** Run the worker until nothing is left: `outcome` says how each job's form goes. */
  drain(outcome: (app: Application) => { to: 'submitted' | 'needs_attention' | 'blocked' | 'failed'; code?: string }): void {
    for (let guard = 0; guard < 100; guard += 1) {
      const got = this.claim(2);
      if (!got.length) return;
      for (const a of got) {
        const o = outcome(a);
        this.report(a.id, o.to, o.to === 'submitted' ? { confirmation: { kind: 'site', id: '' } } : { code: o.code, reason: o.code });
      }
    }
  }

  list = () => [...this.apps.values()];
  get = (id: string) => this.apps.get(id)!;
}
