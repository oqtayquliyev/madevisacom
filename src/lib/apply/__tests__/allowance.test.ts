import { describe, expect, it } from 'vitest';
import { hold, left, periodOf, release, spent, use, type Ledger } from '@/lib/apply/allowance';

const P = '2026-10';

describe('credit consumption', () => {
  it('one submitted application uses one', () => {
    const l: Ledger = new Map();
    expect(hold(l, 'a', P, 5)).toEqual({ ok: true, changed: true });
    expect(use(l, 'a', P, 5)).toEqual({ ok: true, changed: true });
    expect(spent(l, P)).toBe(1);
    expect(left(l, P, 5)).toBe(4);
  });

  it('the same application is never counted twice', () => {
    const l: Ledger = new Map();
    hold(l, 'a', P, 5);
    hold(l, 'a', P, 5);
    use(l, 'a', P, 5);
    expect(use(l, 'a', P, 5)).toEqual({ ok: true, changed: false });
    expect(spent(l, P)).toBe(1);
  });

  it('refuses when the month is used up — checked before sending, not after', () => {
    const l: Ledger = new Map();
    hold(l, 'a', P, 1);
    expect(hold(l, 'b', P, 1)).toEqual({ ok: false, code: 'allowance' });
    expect(l.has('b')).toBe(false);
  });

  it('one sent by the person themselves is counted when they confirm it', () => {
    const l: Ledger = new Map();
    expect(use(l, 'a', P, 1)).toEqual({ ok: true, changed: true });
    expect(use(l, 'b', P, 1)).toEqual({ ok: false, code: 'allowance' });
  });

  it('a skipped application uses nothing', () => {
    const l: Ledger = new Map();
    expect(release(l, 'never-held')).toEqual({ refunded: false });
    expect(spent(l, P)).toBe(0);
  });

  it('a new month starts a new allowance', () => {
    const l: Ledger = new Map();
    use(l, 'a', '2026-10', 1);
    expect(left(l, '2026-11', 1)).toBe(1);
    expect(periodOf(Date.parse('2026-10-31T23:59:59Z'))).toBe('2026-10');
    expect(periodOf(Date.parse('2026-11-01T00:00:00Z'))).toBe('2026-11');
  });
});

describe('credit refund', () => {
  it('a failed send gives the held one back', () => {
    const l: Ledger = new Map();
    hold(l, 'a', P, 1);
    expect(release(l, 'a')).toEqual({ refunded: true });
    expect(spent(l, P)).toBe(0);
    expect(hold(l, 'b', P, 1).ok).toBe(true);
  });

  it('is given back once only', () => {
    const l: Ledger = new Map();
    hold(l, 'a', P, 1);
    release(l, 'a');
    expect(release(l, 'a')).toEqual({ refunded: false });
  });

  it('a submitted application is never refunded', () => {
    const l: Ledger = new Map();
    hold(l, 'a', P, 1);
    use(l, 'a', P, 1);
    expect(release(l, 'a')).toEqual({ refunded: false });
    expect(spent(l, P)).toBe(1);
  });

  it('after a refund the same application can be tried again', () => {
    const l: Ledger = new Map();
    hold(l, 'a', P, 1);
    release(l, 'a');
    expect(hold(l, 'a', P, 1)).toEqual({ ok: true, changed: true });
    expect(use(l, 'a', P, 1)).toEqual({ ok: true, changed: true });
    expect(spent(l, P)).toBe(1);
  });
});
