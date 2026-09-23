import { useEffect, useState } from 'react';

/**
 * Light / dark mode. "system" (the default) follows the device setting
 * and switches automatically when it changes; "light"/"dark" are manual
 * overrides chosen from the account menu. The choice is kept in
 * localStorage. index.html runs the same logic before first paint so
 * pages never flash white in dark mode — keep the two in sync.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'madevisa.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePreference = getThemePreference()) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#020617' : '#f7f9fc');
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // storage unavailable — still apply for this page view
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent('madevisa:theme', { detail: pref }));
}

/** Call once at startup: applies the theme and follows OS changes while on "system". */
export function initTheme() {
  applyTheme();
  media().addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}

export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);
  useEffect(() => {
    const onChange = () => setPref(getThemePreference());
    window.addEventListener('madevisa:theme', onChange);
    return () => window.removeEventListener('madevisa:theme', onChange);
  }, []);
  return [pref, setThemePreference];
}
