import { allCountries } from '@/data/allCountries';

/** Page width shared with the site header, so edges line up. */
export const WRAP = 'mx-auto w-full max-w-7xl px-5 sm:px-8';

/** Client-side navigation the App router listens to. */
export function nav(href: string) {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

export const countryName = (code: string | null | undefined) => allCountries.find((c) => c.code === code)?.name ?? code ?? '';
