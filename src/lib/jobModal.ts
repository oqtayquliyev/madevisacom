// Jobs open as a large popup over the list (like a portfolio's project view), with the
// job's own address in the URL bar: /jobs/<company>/<title>-<id>. Copy, share, reload or
// open that link in a new tab and it is the normal full job page. Back closes the popup
// and returns to the list exactly where it was (filters, scroll).
//
// The popup is just a history entry with state { jobModal: true, under: '/jobs?…' };
// App.tsx renders the list ("under") with the job on top while that entry is current.

export type JobModalState = { jobModal: true; under: string };

export function readJobModal(state: unknown = typeof window !== 'undefined' ? window.history.state : null): JobModalState | null {
  const s = state as Partial<JobModalState> | null;
  return s?.jobModal && typeof s.under === 'string' && s.under.startsWith('/jobs') && !s.under.startsWith('/jobs/') ? { jobModal: true, under: s.under } : null;
}

/** Opens a job (its jobPath) as the popup over the current list. */
export function openJobModal(href: string): void {
  const under = window.location.pathname + window.location.search;
  window.history.pushState({ jobModal: true, under } satisfies JobModalState, '', href);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

/** Closes it: Back when the popup was opened from the list in this tab, else straight to the list. */
export function closeJobModal(): void {
  const m = readJobModal();
  if (m && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.history.pushState({}, '', m?.under ?? '/jobs');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** "Open as a page": the same address, without the list behind it. */
export function expandJobModal(): void {
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}
