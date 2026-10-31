import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// "+12 new jobs added": while someone is on /jobs, count the jobs published since they arrived.
// One tiny count request (no rows) every 2 minutes, only while the tab is visible.

const EVERY_MS = 2 * 60_000;

async function countSince(iso: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('sponsored_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gt('created_at', iso);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

/** New jobs since the page opened (or since `reset()`). Off when `on` is false. */
export function useNewJobsSince(on: boolean): { added: number; reset: () => void } {
  const [since, setSince] = useState(() => new Date().toISOString());
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const n = await countSince(since);
      if (alive) setAdded(n);
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
    reset: () => {
      setAdded(0);
      setSince(new Date().toISOString());
    },
  };
}
