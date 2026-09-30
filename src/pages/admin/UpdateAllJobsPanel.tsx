import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX2, Check, ChevronDown, Loader2, Pause, Play, RefreshCw, ScanSearch, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { syncImportSource, type ImportSource } from '@/lib/importSync';
import { runJobCheck, type ImportCountryLookup } from '@/lib/admin';
import { countLiveJobs, fetchRecentRuns, saveRun, startRun, type JobUpdateRun } from '@/lib/jobUpdateRuns';
import { PublicCountBar } from '@/pages/admin/PublicCountBar';

/**
 * Admin → Import & sync → "Update all jobs now": a manual run from this
 * browser (the Job pipeline does the same every day on the server):
 *   1. syncs every company that has an import source (new jobs in, gone
 *      jobs out, still-open jobs refreshed, wrong countries corrected), then
 *   2. checks jobs: details from descriptions for every job that doesn't
 *      have them yet, and locations of jobs added in the last 48 h.
 * Companies without a source (added by hand) are skipped automatically.
 */

type SourceState = 'waiting' | 'running' | 'done' | 'failed';
type Phase = 'idle' | 'sync' | 'detect' | 'finished';

const CONCURRENCY = 3;
// Part-by-part updates: how many companies per run, and when the current
// "round" (every company once) started. Kept in this browser.
const PART_KEY = 'madevisa:updateParts';
const BATCH_SIZES = [0, 10, 25, 50, 100, 200];
type PartSettings = { batch: number; gentle: boolean; roundStart: string | null };
function readParts(): PartSettings {
  try {
    const v = JSON.parse(localStorage.getItem(PART_KEY) ?? '{}') as Partial<PartSettings>;
    return { batch: Number(v.batch) || 0, gentle: Boolean(v.gentle), roundStart: v.roundStart ?? null };
  } catch {
    return { batch: 0, gentle: false, roundStart: null };
  }
}
function writeParts(v: PartSettings) {
  try {
    localStorage.setItem(PART_KEY, JSON.stringify(v));
  } catch {
    /* optional */
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [totals, setTotals] = useState({ fetched: 0, added: 0, removed: 0, failed: 0, checked: 0, filled: 0, located: 0 });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<JobUpdateRun | null>(null);
  const [runs, setRuns] = useState<JobUpdateRun[] | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [removal, setRemoval] = useState<'delete' | 'expire' | 'close'>('close');
  const [refreshText, setRefreshText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  // ---- Part by part ----
  const [parts, setPartsState] = useState<PartSettings>(readParts);
  const setParts = (patch: Partial<PartSettings>) =>
    setPartsState((p) => {
      const next = { ...p, ...patch };
      writeParts(next);
      return next;
    });
  // The companies this run is working on (shown in the strip).
  const [targets, setTargets] = useState<ImportSource[]>([]);

  // ---- Remove jobs older than 30 days ----
  const [age, setAge] = useState<{ running: boolean; deleted: number; hidden: number; done: boolean; error?: string } | null>(null);
  const ageStop = useRef(false);

  const [lastCleanup, setLastCleanup] = useState<string | null>(null);

  // Only companies with a source; the ones updated longest ago first.
  const list = useMemo(
    () => [...sources].sort((a, b) => (a.last_synced_at ?? '').localeCompare(b.last_synced_at ?? '') || (a.publisher?.name ?? '').localeCompare(b.publisher?.name ?? '')),
    [sources]
  );
  // Companies not yet updated in the current round.
  const roundLeft = useMemo(
    () => (parts.roundStart ? list.filter((s) => !s.last_synced_at || s.last_synced_at < (parts.roundStart as string)) : list),
    [list, parts.roundStart]
  );
  const running = phase === 'sync' || phase === 'detect';

  const loadRuns = () => fetchRecentRuns().then(setRuns);
  useEffect(() => {
    loadRuns();
  }, []);

  // Clock for the elapsed timer.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  // Closing the tab mid-run would cut it off — ask first.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const runAll = async (opts: { newRound?: boolean } = {}) => {
    if (running || !list.length) return;
    // Which companies: the rest of this round (a new round when it's done),
    // at most `batch` of them, updated-longest-ago first.
    let roundStart = parts.roundStart;
    let pending = roundLeft;
    if (opts.newRound || !roundStart || pending.length === 0) {
      roundStart = new Date().toISOString();
      setParts({ roundStart });
      pending = list;
    }
    const chosen = parts.batch ? pending.slice(0, parts.batch) : pending;
    const gentle = parts.gentle;
    setTargets(chosen);
    stop.current = false;
    setError(null);
    setResult(null);
    setStates(Object.fromEntries(chosen.map((s) => [s.id, 'waiting' as SourceState])));
    setSyncDone(0);
    setDetect({ done: 0, total: 0 });
    const t = { fetched: 0, added: 0, removed: 0, failed: 0, checked: 0, filled: 0, located: 0 };
    setTotals({ ...t });
    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);

    const liveBefore = await countLiveJobs();
    const runId = await startRun({ sources_total: chosen.length, live_before: liveBefore });

    // ---- 1. Sync the chosen sources (3 at a time; gentle = 1 at a time with a short rest) ----
    setPhase('sync');
    let next = 0;
    let done = 0;
    const active = new Set<string>();
    await Promise.all(
      Array.from({ length: gentle ? 1 : CONCURRENCY }, async () => {
        while (next < chosen.length && !stop.current) {
          if (gentle && next > 0) await sleep(4000);
          if (stop.current) break;
          const src = chosen[next++];
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
          t.located += res.summary.countriesFixed ?? 0;
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

    // ---- 2. Check jobs: details (server) + locations ----
    let detectError: string | undefined;
    if (!stop.current) {
      setPhase('detect');
      setDetail('Reading job descriptions…');
      const res = await runJobCheck(
        { onlyMissing: true, recentHours: 48 },
        (step, d, total) => {
          if (step === 'details') {
            setDetect({ done: d, total });
            t.checked = d;
            setTotals({ ...t });
          } else setDetail(step === 'locations' ? 'Checking locations of new jobs…' : 'Removing bot-check pages…');
        },
        () => stop.current
      );
      t.checked = res.details.scanned;
      t.filled = res.details.updated;
      t.located += res.locations.fixed;
      t.removed += res.junkRemoved;
      setTotals({ ...t });
      detectError = res.error;
    }

    const liveAfter = await countLiveJobs();
    const status: JobUpdateRun['status'] = stop.current ? 'stopped' : detectError ? 'failed' : 'done';
    const final: Partial<JobUpdateRun> = {
      finished_at: new Date().toISOString(),
      status,
      details_checked: t.checked,
      details_filled: t.filled + t.located,
      live_after: liveAfter,
      error: detectError ?? null,
    };
    await saveRun(runId, final);
    setResult({
      id: runId ?? 'local',
      started_at: new Date(t0).toISOString(),
      sources_total: chosen.length,
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
  };

  /** Deletes / hides jobs posted more than 30 days ago, 2,000 at a time, until none are left (or paused). */
  const runAgeCleanup = async () => {
    if (age?.running) return;
    ageStop.current = false;
    let deleted = 0;
    let hidden = 0;
    setAge({ running: true, deleted, hidden, done: false });
    while (!ageStop.current) {
      const { data, error: e } = await supabase.rpc('enforce_job_age_limit', { p_batch: 2000 });
      if (e) {
        setAge({
          running: false,
          deleted,
          hidden,
          done: false,
          error: /function|schema cache|does not exist/i.test(e.message) ? 'Run the 20261028090000_jobs_30_day_rule.sql migration in Supabase first.' : e.message,
        });
        return;
      }
      const r = (data ?? {}) as { deleted?: number; hidden?: number };
      deleted += r.deleted ?? 0;
      hidden += r.hidden ?? 0;
      if (!r.deleted && !r.hidden) {
        setAge({ running: false, deleted, hidden, done: true });
        onChange();
        return;
      }
      setAge({ running: true, deleted, hidden, done: false });
      await sleep(parts.gentle ? 4000 : 1500);
    }
    setAge({ running: false, deleted, hidden, done: false });
    onChange();
  };

  const last = runs?.find((r) => r.status !== 'running') ?? null;
  const syncPct = targets.length ? syncDone / targets.length : 0;
  const midRound = Boolean(parts.roundStart) && roundLeft.length > 0 && roundLeft.length < list.length;
  const nextCount = Math.min(parts.batch || Infinity, roundLeft.length && midRound ? roundLeft.length : list.length);
  const runLabel = parts.batch ? `Update next ${nextCount} compan${nextCount === 1 ? 'y' : 'ies'}` : midRound ? `Continue (${roundLeft.length} left)` : 'Run full update';
  const detectPct = detect.total ? detect.done / detect.total : phase === 'finished' ? 1 : 0;
  const overall = phase === 'sync' ? syncPct * 0.7 : phase === 'detect' ? 0.7 + detectPct * 0.3 : phase === 'finished' ? 1 : 0;

  const partsAndAgeRows = (
    <>
      {/* Part by part */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-5 py-3 text-xs sm:px-6">
        <Pause className="h-4 w-4 shrink-0 text-white/40" />
        <span className="min-w-0 flex-1 text-white/60">
          <strong className="text-white">Part by part:</strong>{' '}
          {parts.roundStart ? (
            roundLeft.length === 0 ? (
              <>all {list.length} companies updated this round — the next run starts a new round.</>
            ) : (
              <>
                <strong className="text-white">{(list.length - roundLeft.length).toLocaleString()}</strong> of {list.length.toLocaleString()} companies updated this round ·{' '}
                <strong className="text-amber-300">{roundLeft.length.toLocaleString()} left</strong>. Pause any time; next time it continues with the rest.
              </>
            )
          ) : (
            <>update a few companies a day instead of all at once — the ones updated longest ago go first.</>
          )}
        </span>
        <label className="flex items-center gap-2 text-white/80">
          Per run
          <select
            value={parts.batch}
            disabled={running}
            onChange={(e) => setParts({ batch: Number(e.target.value) })}
            className="rounded bg-white/10 px-2 py-1.5 text-white"
          >
            {BATCH_SIZES.map((n) => (
              <option key={n} value={n} className="text-ink-900">
                {n ? `${n} companies` : 'All companies'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-white/80" title="One company at a time with a short rest in between — slower, but much lighter on the database.">
          <input type="checkbox" checked={parts.gentle} disabled={running} onChange={(e) => setParts({ gentle: e.target.checked })} /> Gentle mode
        </label>
        {midRound && !running && (
          <button onClick={() => runAll({ newRound: true })} className="font-semibold text-white/70 underline-offset-2 hover:text-white hover:underline">
            Start a new round
          </button>
        )}
      </div>

      {/* Jobs older than 30 days */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-5 py-3 text-xs sm:px-6">
        <CalendarX2 className={`h-4 w-4 shrink-0 ${age?.running ? 'text-amber-300' : 'text-white/40'}`} />
        <span className="min-w-0 flex-1 text-white/60">
          <strong className="text-white">Only jobs from the last 30 days:</strong>{' '}
          {age?.running ? (
            <span className="text-white">
              Removing… {age.deleted.toLocaleString()} deleted · {age.hidden.toLocaleString()} hidden
            </span>
          ) : age?.error ? (
            <span className="text-rose-300">{age.error}</span>
          ) : age?.done ? (
            <span className="text-emerald-400">
              Done — {age.deleted.toLocaleString()} deleted · {age.hidden.toLocaleString()} hidden. Nothing older than 30 days is left.
            </span>
          ) : age ? (
            <span className="text-amber-300">
              Paused — {age.deleted.toLocaleString()} deleted · {age.hidden.toLocaleString()} hidden so far. Press again to continue.
            </span>
          ) : (
            <>older jobs are hidden automatically every hour. To clear out the ones already there, press the button (2,000 at a time).</>
          )}
        </span>
        {age?.running ? (
          <button
            onClick={() => (ageStop.current = true)}
            className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 font-semibold text-white hover:bg-white/10"
          >
            <Pause className="h-3 w-3 fill-current" /> Pause
          </button>
        ) : (
          <button
            onClick={runAgeCleanup}
            className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-bold text-ink-950 hover:bg-brand-50"
          >
            <CalendarX2 className="h-3 w-3" /> {age && !age.done && !age.error ? 'Continue' : 'Remove jobs older than 30 days'}
          </button>
        )}
      </div>

    </>
  );

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-ink-800 bg-ink-950 text-white shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 px-5 pb-4 pt-5 sm:px-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-600">
          <RefreshCw className={`h-5 w-5 ${running ? 'animate-spin [animation-duration:2.5s]' : ''}`} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">Update all jobs now</h2>
          <p className="text-xs text-white/60">
            Syncs the {list.length.toLocaleString()} {list.length === 1 ? 'company' : 'companies'} with a source, then checks details and locations. The Job pipeline above already does this every day — use this for an
            immediate full refresh.
          </p>
        </div>
        {running ? (
          <button
            onClick={() => {
              stop.current = true;
              setDetail('Pausing after the companies in progress… (progress is kept)');
            }}
            className="flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
          >
            <Pause className="h-3.5 w-3.5 fill-current" /> Pause
          </button>
        ) : (
          <button
            onClick={() => runAll()}
            disabled={!list.length}
            className="group flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_0_4px_rgba(37,99,235,0.25)] transition hover:bg-brand-500 disabled:opacity-40"
          >
            <Play className="h-4 w-4 fill-current transition group-hover:scale-110" /> {runLabel}
          </button>
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
              <span>{last.details_checked.toLocaleString()} jobs checked</span>
              {last.status !== 'done' && <span className="text-amber-300">{last.status === 'stopped' ? 'Paused' : 'Finished with a problem'}</span>}
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

      {phase === 'idle' && showOptions && partsAndAgeRows}
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
            <span>{phase === 'finished' ? (result?.status === 'done' && result.sources_failed === 0 ? 'Complete' : result?.status === 'done' ? 'Complete with problems' : result?.status === 'stopped' ? 'Paused' : 'Finished with a problem') : 'Working'}</span>
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
              title={`Fetch from ${targets.length} sources`}
              state={phase === 'sync' ? 'running' : syncDone === 0 && phase !== 'finished' ? 'waiting' : 'done'}
              progress={`${syncDone} / ${targets.length} companies`}
              pct={syncPct}
            />
            <Step
              n={2}
              icon={ScanSearch}
              title="Check details & locations"
              state={phase === 'detect' ? 'running' : phase === 'finished' && result?.status !== 'stopped' ? 'done' : 'waiting'}
              progress={detect.total ? `${detect.done.toLocaleString()} / ${detect.total.toLocaleString()} jobs` : phase === 'finished' ? `All jobs had details${totals.located ? ` · ${totals.located} locations fixed` : ''}` : 'Waiting for step 1'}
              pct={detectPct}
            />
          </div>

          {/* Company strip */}
          <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Companies">
            {targets.map((s) => {
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
            <Tile label="Jobs checked" value={totals.checked} tone="brand" />
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
                <span className="font-bold text-amber-300">{result.status === 'stopped' ? 'Paused — press Continue to go on from here.' : 'Finished with a problem'}</span>
              )}
              {result.live_before != null && result.live_after != null && (
                <span className="text-white/70">
                  Live jobs <strong className="font-slab text-white">{result.live_before.toLocaleString()}</strong> →{' '}
                  <strong className="font-slab text-white">{result.live_after.toLocaleString()}</strong>
                </span>
              )}
              {result.details_filled > 0 && <span className="text-white/70">{result.details_filled.toLocaleString()} jobs got new details or a corrected location</span>}
              {lastCleanup && <span className="text-white/50">{lastCleanup}</span>}
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
                  <th className="py-1.5 font-medium">Checked</th>
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
                    <td className="py-1.5">{{ done: 'Done', stopped: 'Paused', failed: 'Problem', running: 'Interrupted' }[r.status]}</td>
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
