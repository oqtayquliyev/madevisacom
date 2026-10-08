import { describe, expect, it } from 'vitest';
import { STATUSES, STATUS_LABEL, assertMove, canMove, isFinal, isPending, needsYou, nextStates, statusText } from '@/lib/apply/machine';

describe('application state transitions', () => {
  it('follows the batch path to submitted', () => {
    const path = ['queued', 'analyzing', 'preparing', 'ready', 'submitting', 'submitted'] as const;
    for (let i = 1; i < path.length; i += 1) expect(canMove(path[i - 1], path[i])).toBe(true);
  });

  it('cannot be submitted by skipping steps', () => {
    for (const s of ['queued', 'analyzing', 'preparing', 'ready', 'skipped'] as const) expect(canMove(s, 'submitted')).toBe(false);
    expect(() => assertMove('queued', 'submitted')).toThrow(/can’t become/);
  });

  it('submitted, already applied and expired are final', () => {
    for (const s of ['submitted', 'already_applied', 'expired'] as const) {
      expect(nextStates(s)).toEqual([]);
      expect(isFinal(s)).toBe(true);
    }
  });

  it('one application needing the person can come back without restarting the batch', () => {
    expect(canMove('submitting', 'needs_attention')).toBe(true);
    expect(canMove('needs_attention', 'ready')).toBe(true);
    expect(canMove('blocked', 'ready')).toBe(true);
    // …or the person finishes it themselves.
    expect(canMove('needs_attention', 'submitted')).toBe(true);
    expect(canMove('blocked', 'submitted')).toBe(true);
  });

  it('a site that didn’t respond goes back to ready, never straight to submitted again', () => {
    expect(canMove('submitting', 'ready')).toBe(true);
    expect(canMove('submitting', 'queued')).toBe(false);
  });

  it('every state has a label and every move stays within the known states', () => {
    for (const s of STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      for (const t of nextStates(s)) expect(STATUSES).toContain(t);
      expect(canMove(s, s)).toBe(false);
    }
  });

  it('knows who has to act next', () => {
    expect(STATUSES.filter(needsYou).sort()).toEqual(['blocked', 'failed', 'needs_attention']);
    expect(STATUSES.filter(isPending).sort()).toEqual(['analyzing', 'preparing', 'queued', 'ready', 'submitting']);
  });

  it('says who submitted it', () => {
    expect(statusText({ status: 'submitted', verified: true, reasonCode: null })).toBe('Submitted');
    expect(statusText({ status: 'submitted', verified: false, reasonCode: null })).toBe('Submitted by you');
    expect(statusText({ status: 'blocked', verified: false, reasonCode: 'login_required' })).toBe('Needs a login');
  });
});
