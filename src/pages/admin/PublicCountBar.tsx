import { useEffect, useRef, useState } from 'react';
import { Check, Globe2, Loader2, RefreshCw } from 'lucide-react';
import { readSavedSiteStats, refreshSiteStats, type SiteStats } from '@/lib/siteStats';

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/**
 * The job count visitors see on the homepage ("… to 12,746 opportunities
 * worldwide") and the jobs page, with a button to recount it now.
 * Also recounts by itself when a full update finishes (refreshKey changes).
 */
export function PublicCountBar({ refreshKey }: { refreshKey: string | null }) {
  const [shown, setShown] = useState<SiteStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const firstKey = useRef(refreshKey);

  useEffect(() => {
    readSavedSiteStats().then(setShown);
  }, []);

  const update = async () => {
    setBusy(true);
    setNote(null);
    const before = shown?.publishedJobs ?? null;
    const res = await refreshSiteStats();
    if (res.stats && res.saved) {
      setShown(res.stats);
      const diff = before != null ? res.stats.publishedJobs - before : 0;
      setNote({
        kind: 'ok',
        text: `Updated — visitors now see ${res.stats.publishedJobs.toLocaleString()}${diff ? ` (${diff > 0 ? '+' : ''}${diff.toLocaleString()})` : ''}.`,
      });
    } else {
      setNote({ kind: 'warn', text: res.error ?? 'Couldn’t update the count.' });
    }
    setBusy(false);
  };

  // A full update just finished: recount so the homepage matches.
  useEffect(() => {
    if (refreshKey && refreshKey !== firstKey.current) void update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-5 py-3 text-xs text-white/60 sm:px-6">
      <Globe2 className="h-4 w-4 shrink-0 text-white/40" />
      <span>
        Homepage &amp; jobs page show{' '}
        <strong className="font-slab text-sm tabular-nums text-white">{shown ? shown.publishedJobs.toLocaleString() : '—'}</strong> opportunities
        {shown && (
          <>
            {' '}
            · counted {ago(shown.computedAt)}
            {shown.newJobs24h > 0 && <> · {shown.newJobs24h.toLocaleString()} new in 24 h</>}
            {Date.now() - new Date(shown.computedAt).getTime() > 3 * 3600_000 && <> (over 3 h old, so visitors get a direct count instead)</>}
          </>
        )}
      </span>
      {note && <span className={note.kind === 'ok' ? 'flex items-center gap-1 text-emerald-400' : 'text-amber-300'}>{note.kind === 'ok' && <Check className="h-3.5 w-3.5" />}{note.text}</span>}
      <button
        onClick={update}
        disabled={busy}
        className="ml-auto flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 font-semibold text-white hover:bg-white/10 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Update count now
      </button>
    </div>
  );
}
