import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps a `position: fixed; inset: 0` overlay on the visible screen and stops the page scrolling
 * behind it. Some browser extensions put a filter/transform on <html> or <body>, which makes
 * "fixed" elements follow the page instead of the screen (the popup ends up halfway down a long
 * page). If that happens, the overlay is moved back onto the screen.
 */
export function useViewportFixed(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const prev = { body: document.body.style.overflow, html: html.style.overflow };
    document.body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    const fit = () => {
      Object.assign(el.style, { top: '', left: '', width: '', height: '', bottom: '', right: '' });
      const r = el.getBoundingClientRect();
      if (Math.abs(r.top) < 1 && Math.abs(r.left) < 1 && Math.abs(r.height - window.innerHeight) < 2) return;
      Object.assign(el.style, { top: `${-r.top}px`, left: `${-r.left}px`, right: 'auto', bottom: 'auto', width: `${window.innerWidth}px`, height: `${window.innerHeight}px` });
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, true);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit, true);
      document.body.style.overflow = prev.body;
      html.style.overflow = prev.html;
    };
  }, [ref]);
}
