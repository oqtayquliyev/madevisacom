// The states an application moves through, and the only moves allowed.
// The database enforces the same table (apply_can_move, migration
// 20261204090000); this copy lets the page show the right buttons and
// lets the tests check the rules without a database.

import type { AppStatus, Application } from '@/lib/apply/types';

export const STATUSES: AppStatus[] = ['queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted', 'needs_attention', 'failed', 'skipped', 'blocked', 'already_applied', 'expired'];

const MOVES: Record<AppStatus, AppStatus[]> = {
  queued: ['analyzing', 'preparing', 'skipped', 'already_applied', 'expired'],
  analyzing: ['queued', 'preparing', 'needs_attention', 'blocked', 'skipped', 'already_applied', 'expired'],
  // Back to queued: the person paused while this one was being prepared.
  preparing: ['queued', 'ready', 'needs_attention', 'blocked', 'failed', 'skipped', 'already_applied', 'expired'],
  ready: ['submitting', 'queued', 'needs_attention', 'skipped', 'expired'],
  // Back to ready: the employer's site didn't respond — the worker tries again later.
  submitting: ['submitted', 'failed', 'needs_attention', 'blocked', 'ready', 'expired'],
  // The person answered (ready), finished it themselves (submitted), or let it go.
  needs_attention: ['queued', 'ready', 'submitted', 'skipped', 'expired'],
  blocked: ['queued', 'ready', 'submitted', 'skipped'],
  failed: ['queued', 'ready', 'submitted', 'skipped'],
  skipped: ['queued'],
  submitted: [],
  already_applied: [],
  expired: [],
};

export const canMove = (from: AppStatus, to: AppStatus): boolean => MOVES[from]?.includes(to) ?? false;
export const nextStates = (from: AppStatus): AppStatus[] => MOVES[from] ?? [];

/** Nothing more will happen to it by itself. */
export const isFinal = (s: AppStatus): boolean => MOVES[s].length === 0 || s === 'skipped';
/** Waiting for the person. */
export const needsYou = (s: AppStatus): boolean => s === 'needs_attention' || s === 'blocked' || s === 'failed';
/** Still to be worked on — by the page or by the worker. */
export const isPending = (s: AppStatus): boolean => s === 'queued' || s === 'analyzing' || s === 'preparing' || s === 'ready' || s === 'submitting';

export class MoveError extends Error {
  constructor(
    public from: AppStatus,
    public to: AppStatus,
  ) {
    super(`An application that is “${STATUS_LABEL[from]}” can’t become “${STATUS_LABEL[to]}”.`);
  }
}
export function assertMove(from: AppStatus, to: AppStatus): void {
  if (!canMove(from, to)) throw new MoveError(from, to);
}

/** The words people see. */
export const STATUS_LABEL: Record<AppStatus, string> = {
  queued: 'Queued',
  analyzing: 'Checking the form',
  preparing: 'Preparing',
  ready: 'Ready',
  submitting: 'Submitting',
  submitted: 'Submitted',
  needs_attention: 'Needs attention',
  failed: 'Could not submit',
  skipped: 'Skipped',
  blocked: 'Needs attention',
  already_applied: 'Already applied',
  expired: 'No longer open',
};

export const STATUS_TONE: Record<AppStatus, 'ink' | 'brand' | 'amber' | 'emerald' | 'rose'> = {
  queued: 'ink',
  analyzing: 'brand',
  preparing: 'brand',
  ready: 'brand',
  submitting: 'brand',
  submitted: 'emerald',
  needs_attention: 'amber',
  failed: 'rose',
  skipped: 'ink',
  blocked: 'amber',
  already_applied: 'ink',
  expired: 'ink',
};

/** How an application's state reads to the person. A submitted one says who sent it. */
export function statusText(a: Pick<Application, 'status' | 'verified' | 'reasonCode'>): string {
  if (a.status === 'submitted') return a.verified ? 'Submitted' : 'Submitted by you';
  if (a.status === 'blocked' && a.reasonCode === 'login_required') return 'Needs a login';
  if (a.status === 'needs_attention' && a.reasonCode === 'dry_run') return 'Filled (test mode)';
  return STATUS_LABEL[a.status];
}
