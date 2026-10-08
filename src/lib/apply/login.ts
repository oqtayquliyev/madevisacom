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

/** The quick "apply to your top 3": jobs MadeVisa can submit by itself first, sign-in sites last. Order otherwise kept. */
export function quickPicks<T>(items: T[], urlOf: (x: T) => string | null | undefined, n = 3): T[] {
  return [...items.filter((x) => !needsLogin(urlOf(x))), ...items.filter((x) => needsLogin(urlOf(x)))].slice(0, n);
}

/** "Needs attention" only because the employer's privacy notice wasn't accepted. */
export const isConsentStop = (reason: string | null | undefined) => /privacy notice/i.test(reason ?? '');
