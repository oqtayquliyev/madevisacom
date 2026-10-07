import { describe, expect, it } from 'vitest';
import { STATUSES, STATUS_LABEL, assertMove, canMove, isFinal, isPending, needsYou, nextStates } from '@/lib/apply/machine';

describe('application state transitions', () => {
  it('follows the normal path to submitted', () => {
    expect(canMove('queued', 'preparing')).toBe(true);
    expect(canMove('preparing', 'submitting')).toBe(true);
    expect(canMove('submitting', 'submitted')).toBe(true);
  });

  it('cannot be submitted without being prepared and sent', () => {
    expect(canMove('queued', 'submitted')).toBe(false);
    expect(canMove('preparing', 'submitted')).toBe(false);
    expect(canMove('needs_answer', 'submitted')).toBe(false);
    expect(canMove('failed', 'submitted')).toBe(false);
    expect(() => assertMove('queued', 'submitted')).toThrow(/can’t become/);
  });

  it('submitted, already applied and expired are final', () => {
    for (const s of ['submitted', 'already_applied', 'expired'] as const) {
      expect(nextStates(s)).toEqual([]);
      expect(isFinal(s)).toBe(true);
    }
  });

  it('an unanswered question stops one application, which can come back', () => {
    expect(canMove('preparing', 'needs_answer')).toBe(true);
    expect(canMove('needs_answer', 'queued')).toBe(true);
    expect(canMove('needs_answer', 'submitting')).toBe(false);
  });

  it('pausing puts the application in hand back in the queue', () => {
    expect(canMove('preparing', 'queued')).toBe(true);
    // Mid-send it must finish one way or the other first.
    expect(canMove('submitting', 'queued')).toBe(false);
  });

  it('a failure is never hidden: it can be retried or skipped, nothing else', () => {
    expect(nextStates('failed').sort()).toEqual(['queued', 'skipped']);
  });

  it('review required becomes submitted only when the person sends it', () => {
    expect(canMove('review_required', 'submitted')).toBe(true);
    expect(canMove('review_required', 'skipped')).toBe(true);
  });

  it('every state has a label and every move stays within the known states', () => {
    for (const s of STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      for (const t of nextStates(s)) expect(STATUSES).toContain(t);
      expect(canMove(s, s)).toBe(false);
    }
  });

  it('knows who has to act next', () => {
    expect(STATUSES.filter(needsYou).sort()).toEqual(['failed', 'needs_answer', 'review_required']);
    expect(STATUSES.filter(isPending).sort()).toEqual(['preparing', 'queued', 'submitting']);
  });
});
