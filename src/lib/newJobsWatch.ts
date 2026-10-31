import { useEffect, useState } from 'react';
import { fetchJobsAddedSince } from '@/lib/sponsoredJobs';

// "+12 new jobs added": while someone is on /jobs, the live jobs added since they arrived that are
// really new (posted in the last 7 days) — counted with the same rules the list uses, so the number
// is exactly what a click puts at the top. Checked every 2 minutes, only while the tab is visible.

const EVERY_MS = 2 * 60_000;

/** New jobs since the page opened (or since `reset()`). Off when `on` is false. */
export function useNewJobsSince(on: boolean): { added: number; since: string; reset: () => void } {
  const [since, setSince] = useState(() => new Date().toISOString());
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const rows = await fetchJobsAddedSince(since, { idsOnly: true, limit: 100 });
      if (alive) setAdded(rows.length);
    };
    const t = window.setInterval(check, EVERY_MS);
    const onVis = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [on, since]);

  return {
    added,
    since,
    reset: () => {
      setAdded(0);
      setSince(new Date().toISOString());
    },
  };
}
