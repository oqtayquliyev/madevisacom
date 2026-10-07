// Applications a month — the fair-use allowance that comes with the plan.
//
// There is nothing to buy here: the number comes with the existing Free and
// Pro plans (apply_settings, migration 20261204090000), and can be changed
// there without touching this code.
//
// The rules, the same ones the database applies (apply_move):
//   • an application is counted only when MadeVisa has finished its part:
//     sent with a confirmation, or prepared and handed to the person ready
//     to send;
//   • while MadeVisa is sending it, one is held, so two at once can't both
//     take the last one;
//   • if the send fails, the held one is given back;
//   • one that is skipped, expired or waiting for an answer never counted;
//   • one application can never be counted twice.

export type CreditState = 'held' | 'used' | 'released';
export type Credit = { state: CreditState; period: string };
/** Application id → its one entry. One entry per application is what makes a double charge impossible. */
export type Ledger = Map<string, Credit>;

/** "2026-10" — allowances are per calendar month (UTC), like sponsorship documents. */
export const periodOf = (now: number): string => new Date(now).toISOString().slice(0, 7);

/** Counted against the month: submitted ones and ones being sent right now. */
export const spent = (ledger: Ledger, period: string): number => [...ledger.values()].filter((c) => c.period === period && c.state !== 'released').length;
export const left = (ledger: Ledger, period: string, limit: number): number => Math.max(0, limit - spent(ledger, period));

export type CreditResult = { ok: true; changed: boolean } | { ok: false; code: 'allowance' };

/** Before sending: set one aside. Refused when the month's allowance is gone. */
export function hold(ledger: Ledger, appId: string, period: string, limit: number): CreditResult {
  const c = ledger.get(appId);
  if (c && c.state !== 'released') return { ok: true, changed: false };
  if (left(ledger, period, limit) < 1) return { ok: false, code: 'allowance' };
  ledger.set(appId, { state: 'held', period });
  return { ok: true, changed: true };
}

/** Finished — sent, or ready to send: the held one is used. Without a hold (the employer's own site) one is taken now. */
export function use(ledger: Ledger, appId: string, period: string, limit: number): CreditResult {
  const c = ledger.get(appId);
  if (c?.state === 'used') return { ok: true, changed: false };
  if (c?.state === 'held') {
    c.state = 'used';
    return { ok: true, changed: true };
  }
  if (left(ledger, period, limit) < 1) return { ok: false, code: 'allowance' };
  ledger.set(appId, { state: 'used', period });
  return { ok: true, changed: true };
}

/** The send failed: give the held one back. A used one is never given back here. */
export function release(ledger: Ledger, appId: string): { refunded: boolean } {
  const c = ledger.get(appId);
  if (c?.state !== 'held') return { refunded: false };
  c.state = 'released';
  return { refunded: true };
}
