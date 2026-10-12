// Why the visitor was sent to sign in, and where to go afterwards.
// Kept in sessionStorage so it survives the Google redirect too.

export type AuthIntent = { reason?: 'more-jobs' | 'save' | 'track' | 'share' | 'offer' | 'alert' | 'match'; next?: string };

const KEY = 'mv:authIntent';

export function rememberAuthIntent(intent: AuthIntent) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    /* private mode — the sign-in still works, it just lands on the home page */
  }
}

export function readAuthIntent(): AuthIntent {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthIntent) : {};
  } catch {
    return {};
  }
}

export function clearAuthIntent() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Only same-site paths — never an external URL. */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (/^\/(login|register|reset-password)\b/.test(next)) return '/';
  return next;
}

export const AUTH_REASON_TEXT: Record<NonNullable<AuthIntent['reason']>, string> = {
  'more-jobs': 'To see more than one page of jobs, create an account or sign in.',
  save: 'Sign in to save jobs.',
  track: 'Sign in to track your applications.',
  share: 'Sign in to share your experience.',
  offer: 'Create an account to keep what you chose. Sponsorship documents are part of Starter and Pro.',
  match: 'Create a free account to see which skills your CV is missing — free on 3 jobs every day.',
  alert: 'Create a free account and we’ll email you new matching jobs once a day. Unsubscribe anytime.',
};
