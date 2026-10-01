// Why the visitor was sent to sign in, and where to go afterwards.
// Kept in sessionStorage so it survives the Google redirect too.

export type AuthIntent = { reason?: 'more-jobs' | 'save' | 'track' | 'share' | 'offer'; next?: string; /** When it was saved (ms). */ at?: number };

const KEY = 'mv:authIntent';
/** An intent older than this is from an abandoned sign-in, not this one. */
const MAX_AGE_MS = 6 * 3_600_000;

export function rememberAuthIntent(intent: AuthIntent) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...intent, at: Date.now() }));
  } catch {
    /* private mode — the sign-in still works, it just lands on the home page */
  }
}

export function readAuthIntent(): AuthIntent {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const intent = raw ? (JSON.parse(raw) as AuthIntent) : {};
    if (intent.at && Date.now() - intent.at > MAX_AGE_MS) return {};
    return intent;
  } catch {
    return {};
  }
}

/**
 * Opening sign-in / sign-up from any page: remember that page (path,
 * query and #hash) so the visitor lands back on it once signed in —
 * not on the home page. A page that just saved its own intent (e.g.
 * "more jobs" on /jobs, a few seconds ago) keeps it.
 */
export function rememberReturnPage() {
  const { pathname, search, hash } = window.location;
  if (/^\/(login|register|reset-password)\b/.test(pathname)) return; // already on an auth page — keep the earlier one
  const current = readAuthIntent();
  if (current.next && current.at && Date.now() - current.at < 15_000) return;
  rememberAuthIntent({ next: `${pathname}${search}${hash}` });
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
  if (/^\/(login|register|reset-password|pending-confirmation)\b/.test(next)) return '/';
  return next;
}

export const AUTH_REASON_TEXT: Record<NonNullable<AuthIntent['reason']>, string> = {
  'more-jobs': 'To see more than one page of jobs, create an account or sign in.',
  save: 'Sign in to save jobs.',
  track: 'Sign in to track your applications.',
  share: 'Sign in to share your experience.',
  offer: 'Create a free account to get your document — your first one is free. Everything you chose is saved.',
};
