// Application credits — the allowance that comes with the plan (plus any
// extra granted for the month: application_credit_grants).
//
// The numbers live in the database (apply_settings, migrations 20261204090000
// and 20261205090000) and can be changed there without touching this code.
//
// The rules, the same ones the database applies (apply_transition):
//   • a submitted application uses one;
//   • while MadeVisa is submitting it, one is held, so two at once can't
//     both take the last one;
//   • if it isn't submitted after all (it failed, it needs the person, the
//     employer wants a login), the held one is given back;
//   • one that is skipped, a duplicate, blocked or needs attention never
//     counted — until it is actually submitted;
//   • "I submitted it myself" counts only when apply_settings.charge_self_sent is on;
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

/** Submitted: the held one is used. Without a hold (submitted by the person, when that is charged) one is taken now. */
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
