// The states an application moves through, and the only moves allowed.
// The database enforces the same table (apply_can_move, migration
// 20261204090000); this copy lets the page show the right buttons and
// lets the tests check the rules without a database.

import type { AppStatus, Application } from '@/lib/apply/types';

export const STATUSES: AppStatus[] = ['queued', 'preparing', 'needs_answer', 'submitting', 'submitted', 'failed', 'skipped', 'already_applied', 'expired', 'review_required'];

const MOVES: Record<AppStatus, AppStatus[]> = {
  queued: ['preparing', 'skipped', 'already_applied', 'expired'],
  // Back to queued: the person paused while this one was being prepared.
  preparing: ['queued', 'needs_answer', 'submitting', 'review_required', 'failed', 'skipped', 'expired', 'already_applied'],
  needs_answer: ['queued', 'skipped', 'expired'],
  submitting: ['submitted', 'failed', 'review_required'],
  // The person sent it on the employer's site and said so — or chose not to.
  review_required: ['submitted', 'queued', 'skipped', 'expired'],
  failed: ['queued', 'skipped'],
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
export const needsYou = (s: AppStatus): boolean => s === 'needs_answer' || s === 'review_required' || s === 'failed';
/** Still to be worked on by the queue. */
export const isPending = (s: AppStatus): boolean => s === 'queued' || s === 'preparing' || s === 'submitting';

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

/** The words people see. "Review required" reads as "Ready to send" when the application itself is complete. */
export const STATUS_LABEL: Record<AppStatus, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  needs_answer: 'Needs your answer',
  submitting: 'Submitting',
  submitted: 'Submitted',
  failed: 'Could not submit',
  skipped: 'Skipped',
  already_applied: 'Already applied',
  expired: 'No longer open',
  review_required: 'Review required',
};

export const STATUS_TONE: Record<AppStatus, 'ink' | 'brand' | 'amber' | 'emerald' | 'rose'> = {
  queued: 'ink',
  preparing: 'brand',
  needs_answer: 'amber',
  submitting: 'brand',
  submitted: 'emerald',
  failed: 'rose',
  skipped: 'ink',
  already_applied: 'ink',
  expired: 'ink',
  review_required: 'amber',
};

/**
 * How an application's state reads to the person. "Review required" with a
 * finished application behind it is "Ready to send"; a submitted one says
 * who sent it.
 */
export function statusText(a: Pick<Application, 'status' | 'verified' | 'reasonCode'>): string {
  if (a.status === 'review_required' && (a.reasonCode === 'employer_site' || a.reasonCode === 'channel_off')) return 'Ready to send';
  if (a.status === 'submitted') return a.verified ? 'Submitted' : 'Sent by you';
  return STATUS_LABEL[a.status];
}
