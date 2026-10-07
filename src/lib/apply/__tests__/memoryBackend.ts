// A stand-in for the database, for tests: the same rules as apply_move
// (migration 20261204090000) — allowed moves, the monthly allowance, the
// daily limit, duplicates — kept in memory.

import { hold, periodOf, release, spent, use, type Ledger } from '@/lib/apply/allowance';
import { canMove } from '@/lib/apply/machine';
import type { MoveDetail, MoveResult } from '@/lib/apply/runner';
import type { AppStatus, Application, Channel, Priority } from '@/lib/apply/types';

export type Event = { name: string; app: string | null };

export class MemoryBackend {
  apps = new Map<string, Application>();
  ledger: Ledger = new Map();
  events: Event[] = [];
  /** Job ids this person already applied to outside Auto Apply (the existing tracker). */
  tracked = new Set<string>();
  /** Jobs closed since the search. */
  closed = new Set<string>();
  /** Applications started per day (YYYY-MM-DD). */
  private started = new Map<string, Set<string>>();
  now = Date.parse('2026-10-07T12:00:00Z');

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
        cc: null,
        country: null,
        score: it.score,
        status,
        priority: it.priority ?? 'good',
        rank: it.rank,
        channel: it.channel ?? 'employer_site',
        sponsorship: 'not_indicated',
        url: it.url ?? `https://example.com/jobs/${it.jobId}`,
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

  move = async (id: string, to: AppStatus, detail: MoveDetail = {}): Promise<MoveResult> => {
    const app = this.apps.get(id);
    if (!app) return { ok: false, code: 'error', message: 'No such application.' };
    if (!canMove(app.status, to)) return { ok: false, code: 'invalid', message: `Can’t move from ${app.status} to ${to}.`, app };
    const period = periodOf(this.now);
    const day = new Date(this.now).toISOString().slice(0, 10);

    if (to === 'preparing') {
      if (this.closed.has(app.jobId)) return this.set(app, 'expired', { reason: 'The job is no longer open.', code: 'closed' }, 'expired');
      if (this.tracked.has(app.jobId)) return this.set(app, 'already_applied', { reason: 'This job is already in your applications.', code: 'already_applied' }, 'duplicate');
      const today = this.started.get(day) ?? new Set<string>();
      if (!today.has(id) && today.size >= this.limits.daily) return { ok: false, code: 'daily_limit', message: 'Today’s limit is reached.', app };
      today.add(id);
      this.started.set(day, today);
      this.log('application_started', id);
    }
    if (to === 'submitting') {
      const h = hold(this.ledger, id, period, this.limits.monthly);
      if (!h.ok) return { ok: false, code: 'allowance', message: 'This month’s applications are used.', app };
    }
    // Counted when MadeVisa's part is done: sent, or prepared and handed over ready to send.
    if (to === 'submitted' || to === 'review_required') {
      const u = use(this.ledger, id, period, this.limits.monthly);
      if (!u.ok) return { ok: false, code: 'allowance', message: 'This month’s applications are used.', app };
      if (u.changed) this.log('application_credit_used', id);
      if (to === 'submitted') this.log('application_submitted', id);
    } else if (to !== 'submitting' && release(this.ledger, id).refunded) this.log('application_credit_refunded', id);
    if (to === 'failed') this.log('application_failed', id);
    if (to === 'review_required' || to === 'needs_answer') this.log('application_requires_review', id);
    if (to === 'skipped') this.log('application_skipped', id);
    return this.set(app, to, detail);
  };

  private set(app: Application, to: AppStatus, detail: MoveDetail, refuse?: 'expired' | 'duplicate'): MoveResult {
    const next: Application = {
      ...app,
      status: to,
      reason: detail.reason ?? (to === 'queued' || to === 'preparing' || to === 'submitting' || to === 'submitted' ? null : app.reason),
      reasonCode: detail.code ?? null,
      needs: to === 'needs_answer' ? detail.needs ?? [] : [],
      cvName: detail.cvName ?? app.cvName,
      coverLetter: detail.coverLetter ?? app.coverLetter,
      // "Verified" only with a confirmation from the channel itself — never from the person's own word.
      verified: to === 'submitted' ? Boolean(detail.confirmation && detail.confirmation.kind !== 'self' && detail.confirmation.id) : false,
      confirmation: to === 'submitted' ? { kind: detail.confirmation?.kind ?? 'self', id: detail.confirmation?.id, at: new Date(this.now).toISOString() } : null,
      submittedAt: to === 'submitted' ? new Date(this.now).toISOString() : null,
      updatedAt: new Date(this.now).toISOString(),
    };
    this.apps.set(app.id, next);
    if (refuse === 'duplicate') this.log('application_duplicate', app.id);
    if (refuse) return { ok: false, code: refuse, message: next.reason ?? '', app: next };
    return { ok: true, app: next };
  }

  list = () => [...this.apps.values()];
  get = (id: string) => this.apps.get(id)!;
}
