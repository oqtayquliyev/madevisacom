import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Factory, Loader2, Pause, Play, Rocket, Search, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchCurrentRelease, type JobRelease } from '@/lib/sponsoredJobs';

/**
 * Publish update — imported jobs wait here, then go live.
 *
 * Auto-publish (migration 20261031090000_auto_release_drip.sql): the
 * database publishes a few ready jobs every 3–4 minutes, all day, up to a
 * daily limit — no tab needs to stay open. Jobs are published only after
 * the description detector has run on them. Visitors download only what's
 * new since their last visit, so frequent releases don't slow the site.
 *
 * "Publish all waiting now" (migration 20261029090000) still works.
 */

type AutoStatus = {
  enabled: boolean;
  daily_limit: number;
  auto_balance: boolean;
  target_live: number;
  min_interval_s: number;
  max_interval_s: number;
  max_per_tick: number;
  min_description_chars: number;
  max_age_days: number;
  timezone: string;
  detect_enabled: boolean;
  today_limit: number;
  extra_today: number;
  released_today: number;
  next_release_at: string;
  last_release_at: string | null;
  last_batch: number | null;
  last_detect_at: string | null;
  last_detect_status: number | null;
  waiting: number;
  ready: number;
  to_detect: number;
  detect_failed: number;
  too_short: number;
  too_old: number;
  cron: boolean;
  // Automatic pipeline (migration 20261101090000) — absent before it runs.
  conveyor_enabled?: boolean;
  companies_per_run?: number;
  resync_hours?: number;
  last_conveyor_at?: string | null;
  last_conveyor?: { text?: string; ok?: boolean; published?: number } | null;
  conveyor_healthy?: boolean;
  sources_due?: number;
  finder_enabled?: boolean;
  finder_every_min?: number;
  next_finder_at?: string | null;
  last_finder_at?: string | null;
  last_finder?: { text?: string; ok?: boolean } | null;
  log?: { at: string; kind: string; ok: boolean; summary: string }[];
};

type Settings = Pick<AutoStatus, 'daily_limit' | 'auto_balance' | 'target_live' | 'min_interval_s' | 'max_interval_s' | 'min_description_chars' | 'max_age_days' | 'timezone'> & {
  companies_per_run?: number;
  resync_hours?: number;
  finder_every_min?: number;
};

const SUGGESTED_DAILY_LIMIT = 2000;
const ago = (iso: string | null | undefined, now: number) => {
  if (!iso) return 'never';
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');

function countdown(iso: string, now: number): string {
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  return s <= 0 ? 'any moment' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function PublishReleasePanel({ onPublished }: { onPublished?: () => void }) {
  const [auto, setAuto] = useState<AutoStatus | null>(null);
  const [autoMissing, setAutoMissing] = useState(false);
  const [waitingAll, setWaitingAll] = useState<number | null>(null);
  const [release, setRelease] = useState<JobRelease | null>(null);
  const [releasesReady, setReleasesReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [extra, setExtra] = useState(500);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [st, cnt, rel] = await Promise.all([supabase.rpc('auto_release_status'), supabase.rpc('unreleased_job_count'), fetchCurrentRelease(true)]);
    if (st.error) setAutoMissing(true);
    else {
      setAutoMissing(false);
      setAuto(st.data as AutoStatus);
    }
    setReleasesReady(!cnt.error);
    setWaitingAll(cnt.error ? null : Number(cnt.data ?? 0));
    setRelease(rel);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // The countdown only needs a local clock.
  useEffect(() => {
    if (!auto?.enabled && !auto?.finder_enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [auto?.enabled, auto?.finder_enabled]);

  const runNow = async (kind: 'sync' | 'find') => {
    setBusy(`run-${kind}`);
    setMsg(null);
    const { error } = await supabase.rpc('pipeline_run_now', { p_kind: kind, p_want: 5 });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: kind === 'sync' ? 'Started one sync round — results show below in a minute or two.' : 'Started a company search — results show below in a few minutes.' });
    window.setTimeout(() => void refresh(), 60_000);
  };

  const configure = async (patch: Partial<AutoStatus>, label: string) => {
    setBusy(label);
    setMsg(null);
    const { data, error } = await supabase.rpc('auto_release_configure', { p: patch });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    setAuto(data as AutoStatus);
    return true;
  };

  const addExtra = async (publishNow: boolean) => {
    if (!extra || extra < 1) return;
    if (publishNow && extra > 200 && !window.confirm(`Publish ${extra.toLocaleString()} jobs right now, in one go?`)) return;
    setBusy(publishNow ? 'now' : 'spread');
    setMsg(null);
    const { data, error } = await supabase.rpc('auto_release_extra', { p_n: extra, p_now: publishNow });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    const r = data as { released: number; status: AutoStatus };
    setAuto(r.status);
    setMsg({
      ok: true,
      text: publishNow ? `Published ${fmt(r.released)} jobs now.` : `Added ${fmt(extra)} to today — they'll go out gradually with the rest.`,
    });
    if (publishNow) {
      await refresh();
      onPublished?.();
    }
  };

  const publishAll = async () => {
    if (!window.confirm(`Publish all ${fmt(waitingAll)} waiting jobs at once? This skips the detector check and the daily limit.`)) return;
    setBusy('all');
    setMsg(null);
    const { data, error } = await supabase.rpc('publish_job_release', { p_note: null });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    const r = data as { jobs_released: number; new_today: number };
    setMsg({ ok: true, text: `Published ${r.jobs_released.toLocaleString()} jobs. The site now shows ${r.new_today.toLocaleString()} new jobs today.` });
    await refresh();
    onPublished?.();
  };

  const openSettings = () => {
    if (auto) {
      setDraft({
        daily_limit: auto.daily_limit,
        auto_balance: auto.auto_balance,
        target_live: auto.target_live,
        min_interval_s: auto.min_interval_s,
        max_interval_s: auto.max_interval_s,
        min_description_chars: auto.min_description_chars,
        max_age_days: auto.max_age_days,
        timezone: auto.timezone,
        ...(auto.companies_per_run !== undefined
          ? { companies_per_run: auto.companies_per_run, resync_hours: auto.resync_hours, finder_every_min: auto.finder_every_min }
          : {}),
      });
    }
    setShowSettings((v) => !v);
  };

  const saveSettings = async () => {
    if (!draft || !auto) return;
    // Only what changed — re-sending the same daily limit would reset today's auto-balanced number.
    const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => auto[k as keyof Settings] !== v)) as Partial<AutoStatus>;
    if (!Object.keys(changed).length) return setShowSettings(false);
    if (await configure(changed, 'save')) {
      setShowSettings(false);
      setMsg({ ok: true, text: 'Settings saved.' });
    }
  };

  const when = release ? new Date(release.published_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const budget = auto ? auto.today_limit + auto.extra_today : 0;
  const pct = auto && budget > 0 ? Math.min(100, Math.round((auto.released_today / budget) * 100)) : 0
  const detectorTrouble = auto && auto.to_detect > 0 && auto.last_detect_status !== null && (auto.last_detect_status < 200 || auto.last_detect_status >= 300);
  const detectorIdle = auto && auto.detect_enabled && auto.to_detect > 0 && !auto.last_detect_at;

  const numberField = (key: keyof Settings, label: string, hint?: string, min = 0) =>
    draft && (
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-700">
        {label}
        <input
          type="number"
          min={min}
          value={draft[key] as number}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
          className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {hint && <span className="font-normal text-ink-500">{hint}</span>}
      </label>
    );

  return (
    <section className="mt-6 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-950">
            <Rocket className="h-4 w-4 text-brand-600" /> Publish update
            {auto?.enabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Auto-publishing
              </span>
            )}
          </p>

          {autoMissing ? (
            <p className="mt-1 text-xs text-amber-800">
              Run the 20261031090000_auto_release_drip.sql migration to publish automatically through the day.
              {releasesReady === false && ' (It needs 20261029090000_job_releases.sql first.)'}
            </p>
          ) : !auto ? (
            <p className="mt-1 text-xs text-ink-500">Loading…</p>
          ) : auto.enabled ? (
            <p className="mt-1 text-xs leading-5 text-ink-600">
              Next jobs in <strong className="tabular-nums text-ink-950">{countdown(auto.next_release_at, now)}</strong> · {fmt(auto.released_today)} of{' '}
              {fmt(budget)} published today
              {auto.last_release_at && (
                <>
                  {' '}
                  · last: {fmt(auto.last_batch)} at {clock(auto.last_release_at)}
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-ink-600">
              Turn on auto-publish and ready jobs go live a few at a time every {Math.round(auto.min_interval_s / 60)}–{Math.round(auto.max_interval_s / 60)} minutes, up to{' '}
              {fmt(auto.today_limit)} a day. Sync companies as usual; the waiting list feeds the day.
            </p>
          )}
          {when && (
            <span className="mt-1 block text-xs text-ink-500">
              Last release {when}
              {release ? ` · ${release.new_today.toLocaleString()} new today on the site` : ''}
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {auto && (
            <button
              onClick={() => void configure({ enabled: !auto.enabled }, 'toggle')}
              disabled={busy !== null || !auto.cron}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                auto.enabled ? 'border border-ink-200 bg-white text-ink-800 hover:bg-ink-50' : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}
            >
              {busy === 'toggle' ? <Loader2 className="h-4 w-4 animate-spin" /> : auto.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {auto.enabled ? 'Pause auto-publish' : 'Start auto-publish'}
            </button>
          )}
          {auto && (
            <button
              onClick={openSettings}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
              aria-expanded={showSettings}
            >
              <Settings2 className="h-4 w-4" /> Settings
            </button>
          )}
        </div>
      </div>

      {auto && !auto.cron && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> pg_cron isn't scheduled on this project, so nothing can run by itself. Enable pg_cron in Database → Extensions and run the migration again.
        </p>
      )}

      {auto && (
        <>
          {/* Today */}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Published today">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>

          {/* Queue */}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-ink-500">Ready to publish</dt>
              <dd className="text-base font-bold tabular-nums text-ink-950">{fmt(auto.ready)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Detector checking</dt>
              <dd className="text-base font-bold tabular-nums text-ink-950">{fmt(auto.to_detect)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Held back</dt>
              <dd className="text-base font-bold tabular-nums text-ink-950" title="Too short to be a real job ad, or posted too long ago">
                {fmt(auto.too_short + auto.too_old)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Waiting in total</dt>
              <dd className="text-base font-bold tabular-nums text-ink-950">{fmt(auto.waiting)}</dd>
            </div>
          </dl>
          {(auto.too_short > 0 || auto.too_old > 0 || auto.detect_failed > 0) && (
            <p className="mt-2 text-[11px] leading-4 text-ink-500">
              Held back: {fmt(auto.too_short)} with under {auto.min_description_chars} characters of description (usually not a real job ad) · {fmt(auto.too_old)} posted more than{' '}
              {auto.max_age_days} days ago
              {auto.detect_failed > 0 && ` · the detector gave up on ${fmt(auto.detect_failed)} (published without details)`}.
            </p>
          )}

          {detectorTrouble && (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                The detector call returned {auto.last_detect_status}.{' '}
                {auto.last_detect_status === 401
                  ? 'Redeploy job-facts with --no-verify-jwt (or turn off "Enforce JWT verification" for it).'
                  : auto.last_detect_status === 404
                    ? 'The job-facts function isn\u2019t deployed at the address in auto_release_settings.detect_url.'
                    : auto.last_detect_status === 403
                      ? 'The function is an older version — deploy the new job-facts.'
                      : 'See Edge Functions → job-facts → Logs.'}{' '}
                New jobs wait until it works.
              </span>
            </p>
          )}
          {detectorIdle && !detectorTrouble && auto.enabled && (
            <p className="mt-3 text-xs text-ink-500">The detector starts within a minute and checks about 30 jobs a minute.</p>
          )}

          {/* More today */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-3 text-xs text-ink-700">
            <span className="font-medium">More today:</span>
            <input
              type="number"
              min={1}
              value={extra}
              onChange={(e) => setExtra(Math.max(0, Number(e.target.value)))}
              aria-label="Extra jobs"
              className="w-24 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <button
              onClick={() => void addExtra(false)}
              disabled={busy !== null || !extra}
              className="rounded-md border border-ink-200 bg-white px-3 py-1.5 font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
            >
              {busy === 'spread' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Spread over today'}
            </button>
            <button
              onClick={() => void addExtra(true)}
              disabled={busy !== null || !extra || !auto.ready}
              className="rounded-md border border-ink-200 bg-white px-3 py-1.5 font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
            >
              {busy === 'now' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Publish now'}
            </button>
            <span className="text-ink-500">Only ready jobs are used.</span>
          </div>
        </>
      )}

      {auto && auto.conveyor_enabled !== undefined && (
        <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
          <p className="text-sm font-bold text-ink-950">Automatic pipeline</p>
          <p className="mt-0.5 text-xs text-ink-500">Runs on the server — you can close this tab. Finds companies, reads their careers pages, detects details and publishes, a few at a time.</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/* Conveyor */}
            <div className="rounded-md border border-ink-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <Factory className="h-4 w-4 text-brand-600" /> Sync &amp; publish
                </p>
                <button
                  onClick={() => void configure(auto.conveyor_enabled ? { conveyor_enabled: false } : { conveyor_enabled: true, enabled: true }, 'conveyor')}
                  disabled={busy !== null}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${auto.conveyor_enabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                >
                  {busy === 'conveyor' ? '…' : auto.conveyor_enabled ? 'On — turn off' : 'Turn on'}
                </button>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-600">
                Every 3–4 min: {auto.companies_per_run} companies from different countries, their newest jobs published. Each company is re-checked after {auto.resync_hours} h.{' '}
                {fmt(auto.sources_due)} due now.
              </p>
              {auto.conveyor_enabled && auto.conveyor_healthy === false && (
                <p className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No answer from the auto-pipeline function for 15 min — publishing from the waiting list instead. Is it deployed?
                </p>
              )}
              <p className={`mt-2 text-xs leading-5 ${auto.last_conveyor?.ok === false ? 'text-rose-700' : 'text-ink-700'}`}>
                <span className="text-ink-500">Last: {ago(auto.last_conveyor_at, now)} · </span>
                {auto.last_conveyor?.text ?? 'not run yet'}
              </p>
              <button onClick={() => void runNow('sync')} disabled={busy !== null} className="mt-2 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">
                {busy === 'run-sync' ? 'Starting…' : 'Run one round now'}
              </button>
            </div>

            {/* Finder */}
            <div className="rounded-md border border-ink-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <Search className="h-4 w-4 text-brand-600" /> Find new companies
                </p>
                <button
                  onClick={() => void configure({ finder_enabled: !auto.finder_enabled }, 'finder')}
                  disabled={busy !== null}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${auto.finder_enabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                >
                  {busy === 'finder' ? '…' : auto.finder_enabled ? 'On — turn off' : 'Turn on'}
                </button>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-600">
                One new company every {auto.finder_every_min} min, rotating through the countries (biggest companies first).
                {auto.finder_enabled && auto.next_finder_at && <> Next {Date.parse(auto.next_finder_at) <= now ? 'any moment' : `in ${countdown(auto.next_finder_at, now)}`}.</>}
              </p>
              <p className={`mt-2 text-xs leading-5 ${auto.last_finder?.ok === false ? 'text-rose-700' : 'text-ink-700'}`}>
                <span className="text-ink-500">Last: {ago(auto.last_finder_at, now)} · </span>
                {auto.last_finder?.text ?? 'not run yet'}
              </p>
              <button onClick={() => void runNow('find')} disabled={busy !== null} className="mt-2 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">
                {busy === 'run-find' ? 'Starting…' : 'Find one now'}
              </button>
            </div>
          </div>

          {!!auto.log?.length && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-600">Recent activity</summary>
              <ul className="mt-2 space-y-1.5">
                {auto.log.map((l, i) => (
                  <li key={i} className={`text-xs leading-5 ${l.ok ? 'text-ink-700' : 'text-rose-700'}`}>
                    <span className="tabular-nums text-ink-400">{clock(l.at)}</span> <span className="font-medium">{l.kind === 'find' ? 'Find' : 'Sync'}</span> — {l.summary}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {showSettings && draft && (
        <div className="mt-4 rounded-lg border border-ink-200 bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {numberField('daily_limit', 'Jobs per day', `Suggested ${SUGGESTED_DAILY_LIMIT.toLocaleString()} — keeps about ${(SUGGESTED_DAILY_LIMIT * 30).toLocaleString()} live jobs with the 30-day rule.`)}
            {numberField('min_interval_s', 'Shortest gap (seconds)', 'Default 180 (3 min).', 30)}
            {numberField('max_interval_s', 'Longest gap (seconds)', 'Default 240 (4 min).', 30)}
            {numberField('min_description_chars', 'Minimum description length', 'Shorter ones are held back.')}
            {numberField('max_age_days', 'Only jobs posted within (days)', 'Newest are published first.', 1)}
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-700">
              Day starts in time zone
              <input
                value={draft.timezone}
                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              <span className="font-normal text-ink-500">e.g. Asia/Baku, Europe/Berlin, UTC</span>
            </label>
          </div>
          {draft.companies_per_run !== undefined && (
            <div className="mt-4 grid gap-4 border-t border-ink-100 pt-4 sm:grid-cols-3">
              {numberField('companies_per_run', 'Companies per round', '1–5, each from a different country. 3 is gentle.', 1)}
              {numberField('resync_hours', 'Re-check a company after (hours)', 'Default 12. Closed jobs are noticed on each check.', 1)}
              {numberField('finder_every_min', 'Find a new company every (minutes)', 'Default 20 ≈ 70 companies a day tried.', 5)}
            </div>
          )}
          <label className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-700">
            <input type="checkbox" checked={draft.auto_balance} onChange={(e) => setDraft({ ...draft, auto_balance: e.target.checked })} />
            <span>
              <strong>Auto-balance each day</strong> toward
            </span>
            <input
              type="number"
              min={0}
              value={draft.target_live}
              disabled={!draft.auto_balance}
              onChange={(e) => setDraft({ ...draft, target_live: Number(e.target.value) })}
              aria-label="Target live jobs"
              className="w-28 rounded-md border border-ink-200 bg-white px-2 py-1 text-sm disabled:opacity-50"
            />
            <span className="text-ink-500">live jobs — fewer live → up to 50% more that day; more → up to 50% fewer.</span>
          </label>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => void saveSettings()}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
            <button onClick={() => setShowSettings(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {releasesReady && (
          <button onClick={() => void publishAll()} disabled={busy !== null || !waitingAll} className="font-semibold text-brand-700 hover:underline disabled:opacity-50 disabled:no-underline">
            {busy === 'all' ? 'Publishing…' : waitingAll ? `Publish all ${fmt(waitingAll)} waiting now` : 'Nothing waiting'}
          </button>
        )}
        {waitingAll === 0 && releasesReady && (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Site is up to date
          </span>
        )}
      </div>

      {msg && <p className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</p>}
    </section>
  );
}
