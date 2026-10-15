import type { MouseEvent } from 'react';

/**
 * Attach to an <a href="..."> onClick. Lets the browser handle the
 * click natively (open in new tab/window) when a modifier key or the
 * middle mouse button is used; otherwise prevents the full page
 * navigation and runs the SPA's own client-side transition instead.
 */
export function handleNavClick(event: MouseEvent, action: () => void) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
    return;
  }
  event.preventDefault();
  action();
}

/** Job links from lists (/jobs, CV match, saved jobs, company pages…) open the job in a new tab, so the list stays where it was. */
export const NEW_TAB = { target: '_blank', rel: 'noopener' } as const;
