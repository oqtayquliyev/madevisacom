import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Rocket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchCurrentRelease, type JobRelease } from '@/lib/sponsoredJobs';

/**
 * The daily routine's last step. Imported jobs wait here until you press
 * "Publish update" — then they go public together as one release, the
 * site's numbers ("N new jobs published today") are stored with it, and
 * visitors' saved copies refresh once. Between releases the public site
 * doesn't change, so it loads from the browser's copy instantly.
 * (Migration 20261029090000_job_releases.sql.)
 */
export function PublishReleasePanel({ onPublished }: { onPublished?: () => void }) {
  const [waiting, setWaiting] = useState<number | null>(null);
  const [release, setRelease] = useState<JobRelease | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const [{ data, error }, rel] = await Promise.all([supabase.rpc('unreleased_job_count'), fetchCurrentRelease(true)]);
    setReady(!error);
    setWaiting(error ? null : Number(data ?? 0));
    setRelease(rel);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('publish_job_release', { p_note: null });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    const r = data as { jobs_released: number; new_today: number };
    setMsg({ ok: true, text: `Published ${r.jobs_released.toLocaleString()} jobs. The site now shows ${r.new_today.toLocaleString()} new jobs today.` });
    await refresh();
    onPublished?.();
  };

  const when = release ? new Date(release.published_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <section className="mt-6 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
            <Rocket className="h-4 w-4 text-brand-600" /> Publish update
          </p>
          {ready === false ? (
            <p className="mt-1 text-xs text-amber-800">Run the 20261029090000_job_releases.sql migration to publish in batches. Until then, imported jobs go live straight away.</p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-ink-600">
              Daily routine: <strong>1.</strong> Sync sources (in parts — Pause/Continue below) · <strong>2.</strong> Detect details · Last added ·{' '}
              <strong>3.</strong> Publish. Imported jobs stay hidden until you publish, so the site stays fast while you work.
              {when && (
                <span className="mt-1 block text-ink-500">
                  Last published {when}
                  {release ? ` · ${release.new_today.toLocaleString()} new today on the site` : ''}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
          <button
            onClick={() => void publish()}
            disabled={busy || !ready || !waiting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {waiting ? `Publish ${waiting.toLocaleString()} waiting jobs` : 'Nothing waiting'}
          </button>
          {waiting === 0 && ready && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Site is up to date
            </span>
          )}
        </div>
      </div>
      {msg && <p className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</p>}
    </section>
  );
}
