import type { ApplyRoute } from '@/lib/apply/types';

/** Careers sites that make the candidate sign in or create an account first. MadeVisa never signs in as anyone. */
const LOGIN_HOSTS = /(\.myworkdayjobs\.com|\.myworkdaysite\.com|(^|\.)icims\.com|(^|\.)successfactors\.(com|eu)|(^|\.)jobs\.sap\.com|(^|\.)oraclecloud\.com|(^|\.)taleo\.net|(^|\.)amazon\.jobs)$/;

export function needsLogin(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return LOGIN_HOSTS.test(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** How sure MadeVisa is it can send one by itself: 0 = yes (a known form, or email) … 3 = it can't. */
export function sendRank(route: ApplyRoute | null | undefined, url: string | null | undefined): number {
  if (route === 'auto' || route === 'email') return 0;
  if (route === 'login' || needsLogin(url)) return 2;
  if (route === 'none' || route === 'closed') return 3;
  return 1; // not followed yet, or another careers site: MadeVisa tries
}

/** The quick "apply to your top 3": jobs MadeVisa can send by itself first, sign-in sites and dead ends last. Order otherwise kept. */
export function quickPicks<T>(items: T[], factsOf: (x: T) => { route?: ApplyRoute | null; url?: string | null } | undefined, n = 3): T[] {
  const rank = (x: T) => sendRank(factsOf(x)?.route, factsOf(x)?.url);
  return items
    .map((x, i) => ({ x, i, r: rank(x) }))
    .filter((y) => y.r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, n)
    .map((y) => y.x);
}

/** "Needs attention" only because the employer's privacy notice wasn't accepted. */
export const isConsentStop = (reason: string | null | undefined) => /privacy notice/i.test(reason ?? '');
