import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Infinity as InfinityIcon, Loader2, Play, RefreshCw, ScanSearch, Square, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { syncImportSource, type ImportSource } from '@/lib/importSync';
import { backfillJobFacts, type ImportCountryLookup, purgeJunkJobs } from '@/lib/admin';
import { countLiveJobs, fetchRecentRuns, saveRun, startRun, type JobUpdateRun } from '@/lib/jobUpdateRuns';
import { PublicCountBar } from '@/pages/admin/PublicCountBar';

/**
 * Admin → "Update all jobs": one click that
 *   1. syncs every company that has an import source (new jobs in, gone
 *      jobs out, still-open jobs refreshed), then
 *   2. detects job details (salary, remote, experience, visa…) on the
 *      server for every job that doesn't have them yet.
 * Companies without a source (added by hand) are skipped automatically.
 */

type SourceState = 'waiting' | 'running' | 'done' | 'failed';
type Phase = 'idle' | 'sync' | 'detect' | 'finished';

const CONCURRENCY = 3;
const AUTO_KEY = 'madevisa:autoUpdate';
const GAPS = [
  { min: 30, label: 'every 30 min' },
  { min: 60, label: 'every hour' },
  { min: 180, label: 'every 3 hours' },
  { min: 360, label: 'every 6 hours' },
];

type WakeLockLike = { release: () => Promise<void> };

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Number that counts up smoothly when it changes. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      const v = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

export function UpdateAllJobsPanel({ sources, countries, onChange }: { sources: ImportSource[]; countries: ImportCountryLookup[]; onChange: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [current, setCurrent] = useState<string[]>([]);
  const [detail, setDetail] = useState('');
  const [syncDone, setSyncDone] = useState(0);
  const [detect, setDetect] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [totals, setTotals] = useState({ fetched: 0, added: 0, removed: 0, failed: 0, checked: 0, filled: 0 });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<JobUpdateRun | null>(null);
  const [runs, setRuns] = useState<JobUpdateRun[] | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [removal, setRemoval] = useState<'delete' | 'expire' | 'close'>('close');
  const [refreshText, setRefreshText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const [detectOnly, setDetectOnly] = useState(false);

  // ---- Keep jobs updated (auto mode) ----
  // Runs a full update, cleans up jobs closed over 24 h ago, waits, repeats —
  // for as long as this tab stays open. Only a click starts it.
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const [gapMin, setGapMin] = useState(() => {
    try {
      return Number(JSON.parse(localStorage.getItem(AUTO_KEY) ?? '{}').gap) || 60;
    } catch {
      return 60;
    }
  });
  const [wasAuto] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem(AUTO_KEY) ?? '{}').on);
    } catch {
      return false;
    }
  });
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [cycles, setCycles] = useState(0);
  const [lastCleanup, setLastCleanup] = useState<string | null>(null);
  const wake = useRef<WakeLockLike | null>(null);
  const saveAuto = (on: boolean, gap = gapMin) => {
    try {
      localStorage.setItem(AUTO_KEY, JSON.stringify({ on, gap }));
    } catch {
      /* optional */
    }
  };

  // Only companies with a source; one entry per source, stable order.
  const list = useMemo(() => [...sources].sort((a, b) => (a.publisher?.name ?? '').localeCompare(b.publisher?.name ?? '')), [sources]);
  const running = phase === 'sync' || phase === 'detect';

  const loadRuns = () => fetchRecentRuns().then(setRuns);
  useEffect(() => {
    loadRuns();
  }, []);

  // Clock for the elapsed timer.
  useEffect(() => {
    if (!running && !auto) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running, auto]);

  // Closing the tab mid-run would cut it off — ask first.
  useEffect(() => {
    if (!running && !auto) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running, auto]);

  const runAll = async () => {
    if (running || !list.length) return;
    setDetectOnly(false);
    stop.current = false;
    setError(null);
    setResult(null);
    setStates(Object.fromEntries(list.map((s) => [s.id, 'waiting' as SourceState])));
    setSyncDone(0);
    setDetect({ done: 0, total: 0 });
    const t = { fetched: 0, added: 0, removed: 0, failed: 0, checked: 0, filled: 0 };
    setTotals({ ...t });
    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);

    const liveBefore = await countLiveJobs();
    const runId = await startRun({ sources_total: list.length, live_before: liveBefore });

    // ---- 1. Sync every source (3 at a time) ----
    setPhase('sync');
    let next = 0;
    let done = 0;
    const active = new Set<string>();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < list.length && !stop.current) {
          const src = list[next++];
          const name = src.publisher?.name ?? 'Company';
          active.add(name);
          setCurrent([...active]);
          setStates((s) => ({ ...s, [src.id]: 'running' }));
          const res = await syncImportSource(src, {
            countries,
            removal,
            refreshContent: refreshText,
            allowLargeRemoval: false,
            onProgress: (m) => setDetail(m),
            shouldStop: () => stop.current,
          });
          const failed = Boolean(res.summary.error) || !res.ok;
          t.fetched += res.summary.fetched;
          t.added += res.summary.added;
          t.removed += res.summary.removed + res.summary.duplicatesRemoved;
          if (failed) t.failed++;
          setTotals({ ...t });
          setStates((s) => ({ ...s, [src.id]: failed ? 'failed' : 'done' }));
          active.delete(name);
          setCurrent([...active]);
          done++;
          setSyncDone(done);
        }
      })
    );
    await saveRun(runId, { sources_ok: done - t.failed, sources_failed: t.failed, jobs_fetched: t.fetched, jobs_added: t.added, jobs_removed: t.removed });

    // ---- 2. Detect job details (server) for jobs that don't have them ----
    let detectError: string | undefined;
    if (!stop.current) {
      setPhase('detect');
      setDetail('Reading job descriptions…');
      const res = await backfillJobFacts(
        (d, total) => {
          setDetect({ done: d, total });
          t.checked = d;
          setTotals({ ...t });
        },
        () => stop.current,
        { onlyMissing: true }
      );
      t.checked = res.scanned;
      t.filled = res.updated;
      t.removed += res.counts.junkRemoved ?? 0;
      setTotals({ ...t });
      detectError = res.error;
      // Bot-check pages ("JavaScript is disabled"…) saved earlier → delete.
      const junk = await purgeJunkJobs();
      t.removed += junk.removed;
      setTotals({ ...t });
    }

    const liveAfter = await countLiveJobs();
    const status: JobUpdateRun['status'] = stop.current ? 'stopped' : detectError ? 'failed' : 'done';
    const final: Partial<JobUpdateRun> = {
      finished_at: new Date().toISOString(),
      status,
      details_checked: t.checked,
      details_filled: t.filled,
      live_after: liveAfter,
      error: detectError ?? null,
    };
    await saveRun(runId, final);
    setResult({
      id: runId ?? 'local',
      started_at: new Date(t0).toISOString(),
      sources_total: list.length,
      sources_ok: done - t.failed,
      sources_failed: t.failed,
      jobs_fetched: t.fetched,
      jobs_added: t.added,
      jobs_removed: t.removed,
      live_before: liveBefore,
      ...final,
    } as JobUpdateRun);
    if (detectError) setError(detectError);

    // Jobs closed over 24 hours ago → deleted (their numbers stay in company stats).
    if (!stop.current) {
      const { data, error: cleanErr } = await supabase.rpc('cleanup_closed_jobs');
      if (!cleanErr && typeof data === 'number') setLastCleanup(data ? `${data.toLocaleString()} closed job${data === 1 ? '' : 's'} older than 24 h removed` : 'No closed jobs older than 24 h');
    }

    setPhase('finished');
    setCurrent([]);
    setDetail('');
    loadRuns();
    onChange();
    if (autoRef.current) {
      if (stop.current) stopAuto();
      else {
        setCycles((c) => c + 1);
        setNextRunAt(Date.now() + gapMinRef.current * 60_000);
      }
    }
  };

  /** Step 2 only: re-reads every job's description (and removes bot-check pages). */
  const runDetectOnly = async () => {
    if (running) return;
    setDetectOnly(true);
    stop.current = false;
    setError(null);
    setResult(null);
    setDetect({ done: 0, total: 0 });
    const t = { fetched: 0, added: 0, removed: 0, failed: 0, checked: 0, filled: 0 };
    setTotals({ ...t });
    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);
    setPhase('detect');
    setDetail('Removing bot-check pages…');
    const junk = await purgeJunkJobs();
    t.removed += junk.removed;
    setTotals({ ...t });
    setDetail('Reading job descriptions…');
    const res = await backfillJobFacts(
      (d, total) => {
        setDetect({ done: d, total });
        t.checked = d;
        setTotals({ ...t });
      },
      () => stop.current,
      { onlyMissing: false }
    );
    t.checked = res.scanned;
    t.filled = res.updated;
    t.removed += res.counts.junkRemoved ?? 0;
    setTotals({ ...t });
    const err = res.error ?? junk.error;
    if (err) setError(err);
    setResult({
      id: 'detect-only',
      started_at: new Date(t0).toISOString(),
      finished_at: new Date().toISOString(),
      status: stop.current ? 'stopped' : err ? 'failed' : 'done',
      sources_total: 0,
      sources_ok: 0,
      sources_failed: 0,
      jobs_fetched: 0,
      jobs_added: 0,
      jobs_removed: t.removed,
      details_checked: t.checked,
      details_filled: t.filled,
      error: err ?? null,
    } as JobUpdateRun);
    setPhase('finished');
    setDetail('');
    onChange();
  };

  const runAllRef = useRef(runAll);
  runAllRef.current = runAll;
  const gapMinRef = useRef(gapMin);
  gapMinRef.current = gapMin;

  const startAuto = async () => {
    autoRef.current = true;
    setAuto(true);
    setCycles(0);
    saveAuto(true);
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } }).wakeLock;
      if (wl) wake.current = await wl.request('screen');
    } catch {
      /* the screen may still sleep; the tab keeps working while open */
    }
    void runAllRef.current();
  };

  function stopAuto() {
    autoRef.current = false;
    setAuto(false);
    setNextRunAt(null);
    saveAuto(false);
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
  }

  // Next cycle when the wait is over.
  useEffect(() => {
    if (auto && nextRunAt && !running && now >= nextRunAt) {
      setNextRunAt(null);
      void runAllRef.current();
    }
  }, [auto, nextRunAt, running, now]);

  const last = runs?.find((r) => r.status !== 'running') ?? null;
  const syncPct = list.length ? syncDone / list.length : 0;
  const detectPct = detect.total ? detect.done / detect.total : phase === 'finished' ? 1 : 0;
  const overall = detectOnly ? (phase === 'finished' ? 1 : detectPct) : phase === 'sync' ? syncPct * 0.7 : phase === 'detect' ? 0.7 + detectPct * 0.3 : phase === 'finished' ? 1 : 0;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-white shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 px-5 pb-4 pt-5 sm:px-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-600">
          <RefreshCw className={`h-5 w-5 ${running ? 'animate-spin [animation-duration:2.5s]' : ''}`} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">Update all jobs</h2>
          <p className="text-xs text-white/60">
            Fetches all {list.length} companies with a source, then detects job details. Companies without a source are skipped.
          </p>
        </div>
        {running ? (
          <button
            onClick={() => {
              stop.current = true;
              if (autoRef.current) stopAuto();
              setDetail('Stopping after the current step…');
            }}
            className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
          >
            <Square className="h-3.5 w-3.5 fill-current" /> Stop
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
          <button
            onClick={runDetectOnly}
            title="Skips fetching. Re-reads every job's description to fill in details, and removes bot-check pages."
            className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <ScanSearch className="h-4 w-4" /> Detect job details only
          </button>
          <button
            onClick={runAll}
            disabled={!list.length}
            className="group flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_0_4px_rgba(37,99,235,0.25)] transition hover:bg-brand-500 disabled:opacity-40"
          >
            <Play className="h-4 w-4 fill-current transition group-hover:scale-110" /> Run full update
          </button>
          </div>
        )}
      </div>

      {/* Keep jobs updated */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3 text-xs sm:px-6 ${auto ? 'border-brand-500/40 bg-brand-600/15' : 'border-white/10'}`}>
        <InfinityIcon className={`h-4 w-4 shrink-0 ${auto ? 'text-brand-300' : 'text-white/40'}`} />
        {auto ? (
          <>
            <span className="font-semibold text-white">
              Keeping jobs updated {GAPS.find((g) => g.min === gapMin)?.label ?? `every ${gapMin} min`}
            </span>
            <span className="text-white/60">
              {running ? `Cycle ${cycles + 1} running…` : nextRunAt ? `Next update in ${fmtDuration(nextRunAt - now)}` : 'Starting…'}
              {cycles > 0 && ` · ${cycles} done`}
              {lastCleanup && ` · ${lastCleanup}`}
            </span>
            <button onClick={stopAuto} className="ml-auto flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 font-semibold text-white hover:bg-white/10">
              <Square className="h-3 w-3 fill-current" /> Stop auto-update
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-white/60">
              <strong className="text-white">Keep jobs updated:</strong> runs the full update again and again while this tab is open. Jobs gone from a careers page show as “Closed” for 24 h, then are removed.
              {wasAuto && !running && <span className="text-amber-300"> It was on last time — click Start to continue.</span>}
            </span>
            <select
              value={gapMin}
              onChange={(e) => {
                setGapMin(Number(e.target.value));
                saveAuto(false, Number(e.target.value));
              }}
              className="rounded bg-white/10 px-2 py-1.5 text-white"
            >
              {GAPS.map((g) => (
                <option key={g.min} value={g.min} className="text-ink-900">
                  {g.label}
                </option>
              ))}
            </select>
            <button
              onClick={startAuto}
              disabled={running || !list.length}
              className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-bold text-ink-950 hover:bg-brand-50 disabled:opacity-40"
            >
              <Play className="h-3 w-3 fill-current" /> Start
            </button>
          </>
        )}
      </div>

      {/* Last run line (idle) */}
      {phase === 'idle' && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 px-5 py-3 text-xs text-white/60 sm:px-6">
          {runs === null ? (
            <span>History appears after the job_update_runs migration is run.</span>
          ) : last ? (
            <>
              <span>
                Last update <strong className="text-white">{timeAgo(last.started_at)}</strong>
                {last.finished_at && <> · took {fmtDuration(new Date(last.finished_at).getTime() - new Date(last.started_at).getTime())}</>}
              </span>
              <span>
                <strong className="text-emerald-400">+{last.jobs_added.toLocaleString()}</strong> new
              </span>
              <span>{last.details_checked.toLocaleString()} jobs detected</span>
              {last.status !== 'done' && <span className="text-amber-300">{last.status === 'stopped' ? 'Stopped early' : 'Finished with a problem'}</span>}
            </>
          ) : (
            <span>Never run yet — press Run full update.</span>
          )}
          <button onClick={() => setShowOptions((v) => !v)} className="ml-auto flex items-center gap-1 font-semibold text-white/70 hover:text-white">
            Options & history <ChevronDown className={`h-3.5 w-3.5 transition ${showOptions ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
      <PublicCountBar refreshKey={result?.finished_at ?? null} />

      {phase === 'idle' && showOptions && (
        <div className="flex flex-wrap items-center gap-5 border-t border-white/10 bg-white/[0.03] px-5 py-3 text-xs text-white/80 sm:px-6">
          <label className="flex items-center gap-2">
            Jobs gone from the source:
            <select value={removal} onChange={(e) => setRemoval(e.target.value as 'delete' | 'expire' | 'close')} className="rounded bg-white/10 px-2 py-1 text-white">
              <option value="close" className="text-ink-900">Close (greyed 24 h, then deleted)</option>
              <option value="delete" className="text-ink-900">Delete now</option>
              <option value="expire" className="text-ink-900">Mark expired (keep)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={refreshText} onChange={(e) => setRefreshText(e.target.checked)} /> Re-download job text (slower)
          </label>
          <span className="text-white/50">Big removals (over 60% of a company's jobs) are always blocked for safety.</span>
        </div>
      )}

      {/* Live / result */}
      {phase !== 'idle' && (
        <div className="border-t border-white/10 px-5 py-5 sm:px-6">
          {/* Overall bar */}
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/50">
            <span>{phase === 'finished' ? (result?.status === 'done' && result.sources_failed === 0 ? 'Complete' : result?.status === 'done' ? 'Complete with problems' : result?.status === 'stopped' ? 'Stopped' : 'Finished with a problem') : 'Working'}</span>
            <span className="tabular-nums normal-case tracking-normal text-white/70">
              {Math.round(overall * 100)}% · {fmtDuration((phase === 'finished' && result?.finished_at ? new Date(result.finished_at).getTime() : now) - (startedAt ?? now))}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${phase === 'finished' && result?.status === 'done' ? (result.sources_failed ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-brand-500'}`}
              style={{ width: `${Math.max(2, overall * 100)}%` }}
            />
          </div>

          {/* Steps */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Step
              n={1}
              icon={RefreshCw}
              title={`Fetch from ${list.length} sources`}
              state={detectOnly ? 'waiting' : phase === 'sync' ? 'running' : syncDone === 0 && phase !== 'finished' ? 'waiting' : 'done'}
              progress={detectOnly ? 'Skipped — detect only' : `${syncDone} / ${list.length} companies`}
              pct={syncPct}
            />
            <Step
              n={2}
              icon={ScanSearch}
              title="Detect job details"
              state={phase === 'detect' ? 'running' : phase === 'finished' && result?.status !== 'stopped' ? 'done' : 'waiting'}
              progress={detect.total ? `${detect.done.toLocaleString()} / ${detect.total.toLocaleString()} jobs` : phase === 'finished' ? 'All jobs already had details' : detectOnly ? 'Starting…' : 'Waiting for step 1'}
              pct={detectPct}
            />
          </div>

          {/* Company strip */}
          <div className={`mt-5 flex-wrap gap-1.5 ${detectOnly ? 'hidden' : 'flex'}`} aria-label="Companies">
            {list.map((s) => {
              const st = states[s.id] ?? 'waiting';
              return (
                <span
                  key={s.id}
                  title={`${s.publisher?.name ?? 'Company'} — ${st}`}
                  className={`relative grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-white transition ${
                    st === 'waiting' ? 'opacity-30 grayscale' : st === 'running' ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-ink-950' : ''
                  }`}
                >
                  {s.publisher?.logo_url ? (
                    <img src={s.publisher.logo_url} alt="" className="h-full w-full object-contain p-0.5" />
                  ) : (
                    <span className="text-[10px] font-bold text-ink-700">{(s.publisher?.name ?? '?').slice(0, 2).toUpperCase()}</span>
                  )}
                  {st === 'done' && (
                    <span className="absolute bottom-0 right-0 grid h-3.5 w-3.5 place-items-center rounded-tl bg-emerald-500">
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
                    </span>
                  )}
                  {st === 'failed' && (
                    <span className="absolute bottom-0 right-0 grid h-3.5 w-3.5 place-items-center rounded-tl bg-rose-500">
                      <X className="h-2.5 w-2.5 text-white" strokeWidth={4} />
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {running && (
            <p className="mt-3 flex items-center gap-2 truncate text-xs text-white/60">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="truncate">{current.length ? `${current.join(', ')} — ` : ''}{detail}</span>
            </p>
          )}

          {/* Counters */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="New jobs" value={totals.added} tone="emerald" prefix="+" />
            <Tile label="Checked on sources" value={totals.fetched} tone="white" />
            <Tile label="Removed / closed" value={totals.removed} tone="white" />
            <Tile label="Jobs detected" value={totals.checked} tone="brand" />
          </div>

          {phase === 'finished' && result && (
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-white/[0.06] px-4 py-3 text-sm">
              {result.status === 'done' && result.sources_failed === 0 ? (
                <span className="flex items-center gap-2 font-bold text-emerald-400">
                  <Check className="h-4 w-4" strokeWidth={3} /> All jobs are up to date
                </span>
              ) : result.status === 'done' ? (
                <span className="font-bold text-amber-300">Updated — {result.sources_ok} of {result.sources_total} sources synced</span>
              ) : (
                <span className="font-bold text-amber-300">{result.status === 'stopped' ? 'Stopped — run again to finish.' : 'Finished with a problem'}</span>
              )}
              {result.live_before != null && result.live_after != null && (
                <span className="text-white/70">
                  Live jobs <strong className="font-slab text-white">{result.live_before.toLocaleString()}</strong> →{' '}
                  <strong className="font-slab text-white">{result.live_after.toLocaleString()}</strong>
                </span>
              )}
              {result.details_filled > 0 && <span className="text-white/70">{result.details_filled.toLocaleString()} jobs got new details</span>}
              {result.sources_failed > 0 && <span className="text-rose-300">{result.sources_failed} source{result.sources_failed === 1 ? '' : 's'} had problems — see the Imports tab</span>}
              <button onClick={() => setPhase('idle')} className="ml-auto text-xs font-semibold text-white/60 hover:text-white">
                Close
              </button>
            </div>
          )}
          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          {running && <p className="mt-4 text-[11px] text-white/40">Keep this tab open until it finishes.</p>}
        </div>
      )}

      {/* History */}
      {runs && runs.length > 0 && phase === 'idle' && showOptions && (
        <div className="border-t border-white/10 px-5 py-4 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Recent updates</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-white/40">
                <tr>
                  <th className="py-1.5 font-medium">When</th>
                  <th className="py-1.5 font-medium">Took</th>
                  <th className="py-1.5 font-medium">Sources</th>
                  <th className="py-1.5 font-medium">New</th>
                  <th className="py-1.5 font-medium">Removed</th>
                  <th className="py-1.5 font-medium">Detected</th>
                  <th className="py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5">{new Date(r.started_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-1.5 tabular-nums">{r.finished_at ? fmtDuration(new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) : '—'}</td>
                    <td className="py-1.5 tabular-nums">
                      {r.sources_ok}/{r.sources_total}
                    </td>
                    <td className="py-1.5 tabular-nums text-emerald-400">+{r.jobs_added.toLocaleString()}</td>
                    <td className="py-1.5 tabular-nums">{r.jobs_removed.toLocaleString()}</td>
                    <td className="py-1.5 tabular-nums">{r.details_checked.toLocaleString()}</td>
                    <td className="py-1.5">{{ done: 'Done', stopped: 'Stopped', failed: 'Problem', running: 'Interrupted' }[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Step({ n, icon: Icon, title, state, progress, pct }: { n: number; icon: typeof Play; title: string; state: 'waiting' | 'running' | 'done'; progress: string; pct: number }) {
  return (
    <div className={`rounded-lg border p-3.5 transition ${state === 'running' ? 'border-brand-500 bg-brand-500/10' : state === 'done' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10'}`}>
      <div className="flex items-center gap-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
            state === 'done' ? 'bg-emerald-500 text-white' : state === 'running' ? 'bg-brand-600 text-white' : 'bg-white/10 text-white/50'
          }`}
        >
          {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : state === 'running' ? <Icon className="h-3.5 w-3.5 animate-pulse" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${state === 'waiting' ? 'text-white/50' : 'text-white'}`}>{title}</p>
          <p className="text-[11px] tabular-nums text-white/50">{progress}</p>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-500 ${state === 'done' ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${(state === 'done' ? 1 : pct) * 100}%` }} />
      </div>
    </div>
  );
}

function Tile({ label, value, tone, prefix = '' }: { label: string; value: number; tone: 'emerald' | 'brand' | 'white'; prefix?: string }) {
  const color = tone === 'emerald' ? 'text-emerald-400' : tone === 'brand' ? 'text-brand-300' : 'text-white';
  return (
    <div className="rounded-lg bg-white/[0.05] px-3.5 py-3">
      <p className={`font-slab text-2xl font-bold tabular-nums leading-none ${color}`}>
        {prefix && value > 0 ? prefix : ''}
        <CountUp value={value} />
      </p>
      <p className="mt-1.5 text-[11px] font-medium text-white/50">{label}</p>
    </div>
  );
}
